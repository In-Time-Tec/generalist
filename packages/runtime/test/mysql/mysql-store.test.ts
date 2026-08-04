import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Redacted, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { MysqlClient } from "@effect/sql-mysql2"
import { Errors, MysqlRunSchema, RunClaims, Runtime, RuntimeWorker, RunStore } from "../../src/index.js"
import {
  SCHEMA_VERSION,
  TREE_MIGRATION_STATEMENTS,
  schemaChecksum,
  steeringSchemaChecksum,
} from "../../src/sql/mysql/schema.js"
import { assistantAddress, completedResult, openWait, researcherRef, textPrompt } from "../helpers.js"
import { mysqlAvailable, mysqlClient, mysqlLayer, mysqlUrl, prepareMysql, uniqueSession } from "./helpers.js"

const describeMysql = mysqlAvailable ? describe.sequential : describe.skip
const url = mysqlUrl!

expect(steeringSchemaChecksum()).toBe("8db779640c0b84515867e96dea8709a53b2ae369152b425408194f24501ea996")

const withSchema = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* prepareMysql(url)
    return yield* effect
  })

describeMysql("mysql run store", () => {
  it.live("executes the v4 backfill in numeric per-Run sequence order", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("tree-backfill"),
          idempotencyKey: "run",
          prompt: "backfill",
        })
        const sequences = yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const template = (yield* sql<{ event_json: string }>`
            SELECT event_json FROM baton_run_events WHERE run_id = ${receipt.runId} ORDER BY sequence DESC LIMIT 1
          `)[0]!
          for (let sequence = 1; sequence < 12; sequence++) {
            const event = JSON.parse(template.event_json) as Record<string, unknown>
            event.eventId = `${receipt.runId}:${sequence}`
            event.sequence = sequence
            yield* sql`
              INSERT INTO baton_run_events (run_id, sequence, event_id, event_json)
              VALUES (${receipt.runId}, ${sequence}, ${event.eventId as string}, ${JSON.stringify(event)})
            `
          }
          yield* sql`UPDATE baton_runs SET last_sequence = 11 WHERE run_id = ${receipt.runId}`
          yield* sql.unsafe("DROP TABLE baton_tree_event_index")
          yield* sql.unsafe("DROP TABLE baton_tree_roots")
          for (const statement of TREE_MIGRATION_STATEMENTS) yield* sql.unsafe(statement)
          const rows = yield* sql<{ run_sequence: number }>`
            SELECT run_sequence FROM baton_tree_event_index
            WHERE root_run_id = ${receipt.runId} ORDER BY position
          `
          return rows.map((row) => Number(row.run_sequence))
        }).pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
        expect(sequences).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("applies schema, uses READ COMMITTED, and reports multi-worker capability", () =>
    withSchema(
      Effect.gen(function* () {
        expect(yield* (yield* RunStore.RunStore).info).toEqual({
          durability: "durable",
          backend: "mysql",
          multiWorker: true,
        })
        expect(schemaChecksum()).toHaveLength(64)
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("has exact idempotency and caller run-id semantics", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const sessionId = uniqueSession("idem")
        const runId = `run:${sessionId}`
        const input = { runId, to: assistantAddress, sessionId, idempotencyKey: "same", prompt: textPrompt("one") }
        const first = yield* runtime.send(input)
        const duplicate = yield* runtime.send(input)
        expect(duplicate.duplicate).toBe(true)
        expect(duplicate.runId).toBe(first.runId)
        const conflict = yield* runtime.send({ ...input, prompt: textPrompt("changed") }).pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(Errors.IdempotencyConflict)
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("persists FIFO steering and orders completion against admission", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("steering"),
          idempotencyKey: "run",
          prompt: "start",
        })
        yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "one", prompt: "first" })
        yield* runtime.steer({ runId: receipt.runId, idempotencyKey: "two", prompt: "second" })
        const [claim] = yield* claims.claimReadyRuns({ workerId: "steering", limit: 1, lease: "10 seconds" })
        expect(claim).toBeDefined()
        const executionClaim = { runId: claim!.run.runId, ownerId: claim!.workerId, attemptFence: claim!.attemptFence }
        const entries = yield* store.readSteering(executionClaim)
        expect(entries.map((entry) => JSON.stringify(entry.prompt))).toEqual([
          expect.stringContaining("first"),
          expect.stringContaining("second"),
        ])
        expect(yield* store.complete({ ...executionClaim, result: completedResult("early") })).toBe("steering-pending")
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("claims independent lanes across workers without duplicates", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const receipts = yield* Effect.all(
          Array.from({ length: 6 }, (_, index) =>
            runtime.send({
              to: assistantAddress,
              sessionId: uniqueSession(`lane-${index}`),
              idempotencyKey: `k${index}`,
              prompt: textPrompt(`k${index}`),
            }),
          ),
          { concurrency: 6 },
        )
        const groups = yield* Effect.all(
          ["worker-a", "worker-b", "worker-c"].map((workerId) =>
            claims.claimReadyRuns({ workerId, limit: 2, lease: "10 seconds" }),
          ),
          { concurrency: 3 },
        )
        const ids = groups.flat().map((item) => item.run.runId)
        expect(new Set(ids).size).toBe(6)
        expect(ids.toSorted()).toEqual(receipts.map((receipt) => receipt.runId).toSorted())
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("serializes concurrent duplicate admission", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const input = {
          to: assistantAddress,
          sessionId: uniqueSession("concurrent-idem"),
          idempotencyKey: "same",
          prompt: textPrompt("same"),
        }
        const receipts = yield* Effect.all(
          Array.from({ length: 8 }, () => runtime.send(input)),
          { concurrency: 8 },
        )
        expect(new Set(receipts.map((receipt) => receipt.runId)).size).toBe(1)
        expect(receipts.filter((receipt) => !receipt.duplicate)).toHaveLength(1)
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("preserves FIFO and rejects a stale owner after lease takeover", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("fifo")
        const head = yield* runtime.send({ to: assistantAddress, sessionId, idempotencyKey: "a", prompt: "a" })
        const next = yield* runtime.send({ to: assistantAddress, sessionId, idempotencyKey: "b", prompt: "b" })
        const first = yield* claims.claimReadyRuns({ workerId: "owner-a", limit: 1, lease: "10 seconds" })
        expect(first[0]?.run.runId).toBe(head.runId)
        expect((yield* runtime.inspect(next.runId)).status).toBe("queued")
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_runs SET lease_expires_at = '2000-01-01 00:00:00.000' WHERE run_id = ${head.runId}`
        }).pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
        const second = yield* claims.claimReadyRuns({ workerId: "owner-b", limit: 1, lease: "10 seconds" })
        expect(second[0]!.attemptFence).toBeGreaterThan(first[0]!.attemptFence)
        const stale = yield* claims
          .commitWithClaim({
            runId: head.runId,
            workerId: "owner-a",
            attemptFence: first[0]!.attemptFence,
            transition: "complete",
            result: completedResult("late"),
          })
          .pipe(Effect.flip)
        expect(stale).toBeInstanceOf(Errors.StaleClaim)
        yield* claims.commitWithClaim({
          runId: head.runId,
          workerId: "owner-b",
          attemptFence: second[0]!.attemptFence,
          transition: "complete",
          result: completedResult("ok"),
        })
        const ownership = yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          return yield* sql<{ owner_worker_id: string | null; lease_expires_at: string | null }>`
            SELECT owner_worker_id, lease_expires_at FROM baton_runs WHERE run_id = ${head.runId}
          `
        }).pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
        expect(ownership[0]).toEqual({ owner_worker_id: null, lease_expires_at: null })
        expect((yield* claims.claimReadyRuns({ workerId: "owner-c", limit: 1 }))[0]?.run.runId).toBe(next.runId)
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("runs worker ticks and refreshes fenced leases", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const worker = yield* RuntimeWorker.RuntimeWorker
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("worker"),
          idempotencyKey: "worker",
          prompt: "worker",
        })
        const first = yield* worker.tick
        const claimed = first.find((item) => item.run.runId === receipt.runId)!
        expect(claimed).toBeDefined()
        expect(
          yield* (yield* RunClaims.RunClaims).refreshLease({
            runId: receipt.runId,
            workerId: "mysql-worker",
            attemptFence: claimed.attemptFence,
            lease: "10 seconds",
          }),
        ).toBe(true)
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
        expect(
          yield* (yield* RunClaims.RunClaims).refreshLease({
            runId: receipt.runId,
            workerId: "mysql-worker",
            attemptFence: claimed.attemptFence,
            lease: "10 seconds",
          }),
        ).toBe(false)
      }).pipe(
        Effect.provide(
          RuntimeWorker.layerWorker({
            workerId: "mysql-worker",
            concurrency: 2,
            lease: "5 seconds",
            pollInterval: "50 millis",
          }).pipe(Layer.provideMerge(mysqlLayer(url))),
        ),
        Effect.scoped,
      ),
    ),
  )

  it.live("serializes concurrent child settlements into one parent history", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("children"),
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const agent = (yield* runtime.inspect(parent.runId)).agent
        const children = yield* Effect.all(
          Array.from({ length: 4 }, (_, index) =>
            runtime.spawn({
              parentRunId: parent.runId,
              invocationId: `child-${index}`,
              agent,
              prompt: `child-${index}`,
            }),
          ),
          { concurrency: 4 },
        )
        yield* Effect.forEach(
          children,
          (child, index) =>
            store
              .claimExecution({ runId: child.runId, ownerId: `child-worker-${index}` })
              .pipe(
                Effect.flatMap((claim) =>
                  store.complete({ ...claim, runId: child.runId, result: completedResult(`child-${index}`) }),
                ),
              ),
          { concurrency: 4, discard: true },
        )
        const history = yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 30 })
        expect(history.filter((event) => event._tag === "ChildLinked")).toHaveLength(4)
        expect(history.filter((event) => event._tag === "ChildSettled")).toHaveLength(4)
        expect(history.map((event) => event.sequence)).toEqual(history.map((_, index) => index))
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("decodes MySQL booleans and timestamps", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("codecs"),
          idempotencyKey: "codec",
          prompt: "codec",
        })
        yield* runtime.cancel({ runId: receipt.runId, reason: "codec" })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        const fresh = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("timestamp"),
          idempotencyKey: "timestamp",
          prompt: "timestamp",
        })
        const claim = (yield* claims.claimReadyRuns({ workerId: "codec-worker", limit: 1 }))[0]!
        expect(claim.run.runId).toBe(fresh.runId)
        expect(claim.leaseExpiresAt).toBeInstanceOf(Date)
        expect(Number.isNaN(claim.leaseExpiresAt.getTime())).toBe(false)
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("persists waits, control input, and unknown operations", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("wait-op"),
          idempotencyKey: "wait-op",
          prompt: "wait-op",
        })
        const claimed = (yield* claims.claimReadyRuns({ workerId: "wait-worker", limit: 1 }))[0]!
        const claim = { runId: receipt.runId, ownerId: "wait-worker", attemptFence: claimed.attemptFence }
        yield* store.wait({ ...claim, wait: openWait("approval", "approval") })
        yield* runtime.respond({ runId: receipt.runId, waitId: "approval", resolution: { _tag: "Approved" } })
        const recorded = yield* store.recordOperation({
          ...claim,
          operationKey: "tool:external",
          kind: "tool",
          inputDigest: "digest",
          input: { value: 1 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...claim, operationId: recorded.operationId })
        expect((yield* store.expireRunningOperation({ ...claim, operationId: recorded.operationId })).outcome).toBe(
          "unknown",
        )
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("settles child completion into the parent stream", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("child"),
          idempotencyKey: "parent",
          prompt: "parent",
        })
        yield* claims.claimReadyRuns({ workerId: "parent-worker", limit: 1, lease: "10 seconds" })
        const child = yield* runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "child-1",
          agent: (yield* runtime.inspect(parent.runId)).agent,
          prompt: "child",
        })
        const [claim] = yield* claims.claimReadyRuns({ workerId: "child-worker", limit: 1, lease: "10 seconds" })
        expect(claim?.run.runId).toBe(child.runId)
        yield* claims.commitWithClaim({
          runId: child.runId,
          workerId: "child-worker",
          attemptFence: claim!.attemptFence,
          transition: "complete",
          result: completedResult("child"),
        })
        const tags = (yield* runtime.history({ runId: parent.runId, cursor: -1, limit: 20 })).map((event) => event._tag)
        expect(tags).toContain("ChildLinked")
        expect(tags).toContain("ChildSettled")
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("enforces durable fan-out concurrency through claims", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("fan-out"),
          idempotencyKey: "parent",
          prompt: "parent",
        })
        yield* claims.claimReadyRuns({ workerId: "parent", limit: 1 })
        const receipt = yield* runtime.fanOut({
          parentRunId: parent.runId,
          idempotencyKey: "reviews",
          members: [0, 1, 2].map((ordinal) => ({
            key: `review-${ordinal}`,
            agent: researcherRef,
            prompt: `review-${ordinal}`,
          })),
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "await",
        })
        const first = yield* claims.claimReadyRuns({ workerId: "fan-out", limit: 3 })
        expect(first.map((claim) => claim.run.runId)).toEqual([receipt.childRunIds[0]])
        yield* claims.commitWithClaim({
          runId: first[0]!.run.runId,
          workerId: "fan-out",
          attemptFence: first[0]!.attemptFence,
          transition: "complete",
          result: completedResult("first"),
        })
        const second = yield* claims.claimReadyRuns({ workerId: "fan-out", limit: 3 })
        expect(second.map((claim) => claim.run.runId)).toEqual([receipt.childRunIds[1]])
      }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped),
    ),
  )

  it.live("polls durable history written by another runtime", () =>
    withSchema(
      Effect.gen(function* () {
        const runId = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return (yield* runtime.send({
            to: assistantAddress,
            sessionId: uniqueSession("poll"),
            idempotencyKey: "poll",
            prompt: "poll",
          })).runId
        }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped)
        const observed = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const claims = yield* RunClaims.RunClaims
          yield* Effect.forkScoped(
            Effect.sleep("50 millis").pipe(
              Effect.andThen(claims.claimReadyRuns({ workerId: "other-node", limit: 1 })),
              Effect.flatMap((items) =>
                claims.commitWithClaim({
                  runId,
                  workerId: "other-node",
                  attemptFence: items[0]!.attemptFence,
                  transition: "complete",
                  result: completedResult("done"),
                }),
              ),
            ),
          )
          return yield* runtime.events({ runId, cursor: 0 }).pipe(Stream.take(2), Stream.runCollect)
        }).pipe(Effect.provide(mysqlLayer(url)), Effect.scoped)
        expect([...observed].map((event) => event._tag)).toEqual(["RunAttemptStarted", "RunCompleted"])
      }),
    ),
  )

  it.live("exposes plan, check, apply, markDirty, and verify-only startup", () =>
    withSchema(
      Effect.gen(function* () {
        const plan = yield* MysqlRunSchema.plan("mysql-test").pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
        expect(plan.required).toBe(SCHEMA_VERSION)
        expect(plan.upgradeRequired).toBe(false)
        expect(plan.statements).toEqual([])
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_schema_meta SET version = 0 WHERE id = 1`
        }).pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
        const upgrade = yield* Effect.exit(Effect.void.pipe(Effect.provide(mysqlLayer(url)), Effect.scoped))
        expect(Exit.isFailure(upgrade)).toBe(true)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION} WHERE id = 1`
        }).pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
        yield* MysqlRunSchema.markDirty("mysql-test").pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
        const dirty = yield* Effect.exit(Effect.void.pipe(Effect.provide(mysqlLayer(url)), Effect.scoped))
        expect(Exit.isFailure(dirty)).toBe(true)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_schema_meta SET dirty = 0, checksum = ${schemaChecksum()} WHERE id = 1`
        }).pipe(Effect.provide(MysqlClient.layer({ url: Redacted.make(url) })), Effect.scoped)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`
        }).pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
        const future = yield* MysqlRunSchema.apply("mysql-test").pipe(
          Effect.provide(mysqlClient(url)),
          Effect.scoped,
          Effect.flip,
        )
        expect(future).toBeInstanceOf(Errors.SchemaVersionUnsupported)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const rows = yield* sql<{ version: number }>`SELECT version FROM baton_schema_meta WHERE id = 1`
          expect(Number(rows[0]?.version)).toBe(SCHEMA_VERSION + 1)
          yield* sql`
            UPDATE baton_schema_meta
            SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = 0
            WHERE id = 1
          `
        }).pipe(Effect.provide(mysqlClient(url)), Effect.scoped)
      }),
    ),
  )
})

if (!mysqlAvailable) it.skip("mysql suite skipped: set BATON_MYSQL_URL or MYSQL_URL", () => undefined)
