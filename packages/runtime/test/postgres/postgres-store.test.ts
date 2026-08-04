import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Redacted, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { PgClient } from "@effect/sql-pg"
import { Errors, RunClaims, RunSchema, Runtime, RuntimeWorker, RunStore } from "../../src/index.js"
import {
  SCHEMA_META_TABLE,
  SCHEMA_VERSION,
  TREE_MIGRATION_STATEMENTS,
  schemaChecksum,
  steeringSchemaChecksum,
} from "../../src/sql/postgres/schema.js"
import {
  alternateAssistantRef,
  assistantAddress,
  assistantRef,
  completedResult,
  emptyTranscript,
  openWait,
  suspension,
  researcherRef,
  textPrompt,
} from "../helpers.js"
import {
  postgresAvailable,
  postgresLayer,
  postgresUrl,
  postgresWithWorker,
  preparePostgres,
  uniqueSession,
} from "./helpers.js"

const describePostgres = postgresAvailable ? describe.sequential : describe.skip

const url = postgresUrl!

expect(steeringSchemaChecksum()).toBe("3536918f55414098259ef8aac4aa0dd4dd327aa5daf5a8ed5926f15137e92a40")

const withSchema = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* preparePostgres(url)
    return yield* effect
  })

const expireLease = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE baton_runs
      SET lease_expires_at = NOW() - INTERVAL '1 second'
      WHERE run_id = ${runId}
    `
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

const bumpSchemaVersion = (version: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET version = ${version} WHERE id = 1`
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

const corruptChecksum = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET checksum = 'deadbeef' WHERE id = 1`
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

const corruptEventExecutableRef = (runId: string, executableRef: unknown) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = (yield* sql<{ event_json: string }>`
      SELECT event_json FROM baton_run_events WHERE run_id = ${runId} ORDER BY sequence LIMIT 1
    `)[0]!
    const event = JSON.parse(row.event_json) as Record<string, unknown>
    event.executableRef = executableRef
    yield* sql`
      UPDATE baton_run_events SET event_json = ${JSON.stringify(event)}
      WHERE run_id = ${runId} AND sequence = 0
    `
  }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

const markDirty = () =>
  RunSchema.markDirty("postgres-test").pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

describePostgres("postgres run store", () => {
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
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)
        expect(sequences).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("applies schema and reports multi-worker capability", () =>
    withSchema(
      Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        const info = yield* store.info
        expect(info).toEqual({ durability: "durable", backend: "postgres", multiWorker: true })
        expect(schemaChecksum().length).toBe(64)
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("persists the exact resolution supplied to RunStore.resume", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("direct-resume"),
          idempotencyKey: "direct-resume",
          prompt: "wait",
        })
        const claimed = (yield* claims.claimReadyRuns({ workerId: "direct-resume", limit: 1, lease: "10 seconds" }))[0]!
        yield* store.suspend({
          runId: receipt.runId,
          ownerId: claimed.workerId,
          attemptFence: claimed.attemptFence,
          wait: openWait("wait:direct-resume"),
          suspension: suspension("wait:direct-resume"),
        })
        const resolution = { _tag: "Denied" as const, reason: "postgres exact resolution" }
        const resumeInput = { runId: receipt.runId, waitId: "wait:direct-resume", resolution }
        yield* store.resume(resumeInput)
        const resumed = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 10 })).find(
          (event) => event._tag === "RunResumed",
        )
        expect(resumed).toEqual(expect.objectContaining({ resolution }))
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("verify-only startup rejects SchemaUpgradeRequired without DDL", () =>
    withSchema(
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET version = 0 WHERE id = 1`
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)
        const failed = yield* Effect.exit(Effect.void.pipe(Effect.provide(postgresLayer(url)), Effect.scoped))
        expect(Exit.isFailure(failed)).toBe(true)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`
            UPDATE ${sql(SCHEMA_META_TABLE)}
            SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = FALSE
            WHERE id = 1
          `
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)
      }),
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
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("exact duplicate admission and changed-payload conflict", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const sessionId = uniqueSession("idem")
        const runId = `run:${sessionId}`
        const first = yield* runtime.send({
          runId,
          to: assistantAddress,
          sessionId,
          idempotencyKey: "same",
          prompt: textPrompt("one"),
        })
        const dup = yield* runtime.send({
          runId,
          to: assistantAddress,
          sessionId,
          idempotencyKey: "same",
          prompt: textPrompt("one"),
        })
        expect(dup.duplicate).toBe(true)
        expect(dup.runId).toBe(first.runId)
        expect(first.runId).toBe(runId)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`
            UPDATE baton_runs SET
              executable_ref_json = ${JSON.stringify(alternateAssistantRef.ref)},
              executable_manifest_json = ${JSON.stringify(alternateAssistantRef.manifest)}
            WHERE run_id = ${runId}
          `
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)
        const authorityConflict = yield* runtime
          .send({ runId, to: assistantAddress, sessionId, idempotencyKey: "same", prompt: textPrompt("one") })
          .pipe(Effect.flip)
        expect(authorityConflict).toBeInstanceOf(Errors.IdempotencyConflict)
        const runIdConflict = yield* runtime
          .send({
            runId: `${runId}:other`,
            to: assistantAddress,
            sessionId,
            idempotencyKey: "same",
            prompt: textPrompt("one"),
          })
          .pipe(Effect.flip)
        expect(runIdConflict).toBeInstanceOf(Errors.RunIdConflict)
        const conflict = yield* runtime
          .send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "same",
            prompt: textPrompt("two"),
          })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(Errors.IdempotencyConflict)
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("locks admission and rejects spawning from a terminal parent", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("terminal-parent"),
          idempotencyKey: "parent",
          prompt: textPrompt("parent"),
        })
        const claim = yield* store.claimExecution({ runId: parent.runId, ownerId: "terminal-parent" })
        yield* store.complete({ ...claim, result: completedResult("done") })
        const failure = yield* runtime
          .spawn({
            parentRunId: parent.runId,
            invocationId: "too-late",
            selection: "researcher",
            prompt: textPrompt("child"),
          })
          .pipe(Effect.flip)
        expect(failure).toBeInstanceOf(Errors.RunTerminal)
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("fifo blocks successors until head terminals after claim", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("fifo")
        const head = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "a",
          prompt: textPrompt("a"),
        })
        const blocked = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "b",
          prompt: textPrompt("b"),
        })
        expect((yield* runtime.inspect(head.runId)).status).toBe("queued")
        expect((yield* runtime.inspect(blocked.runId)).status).toBe("queued")
        const claimed = yield* claims.claimReadyRuns({ workerId: "w1", limit: 1, lease: "10 seconds" })
        expect(claimed.map((item) => item.run.runId)).toEqual([head.runId])
        expect((yield* runtime.inspect(head.runId)).status).toBe("running")
        expect((yield* runtime.inspect(blocked.runId)).status).toBe("queued")
        yield* claims.commitWithClaim({
          runId: head.runId,
          workerId: "w1",
          attemptFence: claimed[0]!.attemptFence,
          transition: "complete",
          result: completedResult("done"),
        })
        const claimedNext = yield* claims.claimReadyRuns({ workerId: "w1", limit: 2, lease: "10 seconds" })
        expect(claimedNext.map((item) => item.run.runId)).toEqual([blocked.runId])
        expect((yield* runtime.inspect(blocked.runId)).status).toBe("running")
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("two and three workers distribute independent lanes", () =>
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
        const w1 = yield* claims.claimReadyRuns({ workerId: "worker-a", limit: 2, lease: "10 seconds" })
        const w2 = yield* claims.claimReadyRuns({ workerId: "worker-b", limit: 2, lease: "10 seconds" })
        const w3 = yield* claims.claimReadyRuns({ workerId: "worker-c", limit: 2, lease: "10 seconds" })
        const claimedIds = [...w1, ...w2, ...w3].map((item) => item.run.runId)
        expect(new Set(claimedIds).size).toBe(6)
        expect(claimedIds.toSorted()).toEqual(receipts.map((receipt) => receipt.runId).toSorted())
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("stale lease takeover and stale commit rejection", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("stale")
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "stale",
          prompt: textPrompt("stale"),
        })
        const first = yield* claims.claimReadyRuns({ workerId: "owner-a", limit: 1, lease: "2 seconds" })
        expect(first).toHaveLength(1)
        const fenceA = first[0]!.attemptFence
        yield* expireLease(receipt.runId)
        const second = yield* claims.claimReadyRuns({ workerId: "owner-b", limit: 1, lease: "10 seconds" })
        expect(second).toHaveLength(1)
        expect(second[0]!.attemptFence).toBeGreaterThan(fenceA)
        const stale = yield* claims
          .commitWithClaim({
            runId: receipt.runId,
            workerId: "owner-a",
            attemptFence: fenceA,
            transition: "complete",
            result: completedResult("late"),
          })
          .pipe(Effect.flip)
        expect(stale).toBeInstanceOf(Errors.StaleClaim)
        yield* claims.commitWithClaim({
          runId: receipt.runId,
          workerId: "owner-b",
          attemptFence: second[0]!.attemptFence,
          transition: "complete",
          result: completedResult("ok"),
        })
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("rejects emitAgentEvent after a concurrent lease takeover without changing newer state", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("agent-event-takeover"),
          idempotencyKey: "agent-event-takeover",
          prompt: textPrompt("agent-event-takeover"),
        })
        const [claimed] = yield* claims.claimReadyRuns({ workerId: "owner-a", limit: 1, lease: "10 seconds" })
        const claim = {
          runId: receipt.runId,
          ownerId: claimed!.workerId,
          attemptFence: claimed!.attemptFence,
        }
        const newerTranscript = textPrompt("owner-b transcript")
        const locked = yield* Deferred.make<void>()
        const takeover = Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql.withTransaction(
            Effect.gen(function* () {
              const pid = (yield* sql<{ readonly pid: number }>`SELECT pg_backend_pid() AS pid`)[0]!.pid
              yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${receipt.runId} FOR UPDATE`
              yield* Deferred.succeed(locked, undefined)
              let blocked = false
              for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
                const [waiting] = yield* sql<{ readonly blocked: boolean }>`
                  SELECT EXISTS (
                    SELECT 1 FROM pg_stat_activity
                    WHERE ${pid} = ANY(pg_blocking_pids(pid))
                  ) AS blocked
                `
                blocked = waiting?.blocked === true
                if (!blocked) yield* Effect.sleep("10 millis")
              }
              expect(blocked).toBe(true)
              yield* sql`
                UPDATE baton_runs
                SET owner_worker_id = 'owner-b', attempt_fence = attempt_fence + 1,
                  transcript_json = ${JSON.stringify(newerTranscript)},
                  lease_expires_at = NOW() + INTERVAL '10 seconds', updated_at = NOW()
                WHERE run_id = ${receipt.runId}
              `
            }),
          )
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

        const takeoverFiber = yield* Effect.forkScoped(takeover)
        yield* Deferred.await(locked)
        const staleFiber = yield* Effect.forkScoped(
          store.emitAgentEvent({
            ...claim,
            event: {
              _tag: "TurnCompleted",
              turn: 0,
              transcript: emptyTranscript,
              usage: {
                inputTokens: { total: 0, uncached: 0, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 0, text: 0, reasoning: 0 },
              },
            },
          }),
        )
        yield* Fiber.join(takeoverFiber)
        const stale = yield* Fiber.join(staleFiber).pipe(Effect.flip)
        expect(stale).toBeInstanceOf(Errors.StaleClaim)

        const state = yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const [run] = yield* sql<{
            readonly owner_worker_id: string | null
            readonly attempt_fence: number
            readonly transcript_json: string | null
          }>`
            SELECT owner_worker_id, attempt_fence, transcript_json
            FROM baton_runs WHERE run_id = ${receipt.runId}
          `
          const [events] = yield* sql<{ readonly count: string }>`
            SELECT COUNT(*) AS count FROM baton_run_events
            WHERE run_id = ${receipt.runId} AND event_json LIKE '%"TurnCompleted"%'
          `
          return { run, eventCount: Number(events!.count) }
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)
        expect(state.run).toEqual({
          owner_worker_id: "owner-b",
          attempt_fence: claim.attemptFence + 1,
          transcript_json: JSON.stringify(newerTranscript),
        })
        expect(state.eventCount).toBe(0)
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("worker layer ticks claim and refresh leases", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const worker = yield* RuntimeWorker.RuntimeWorker
        const sessionId = uniqueSession("worker")
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "w",
          prompt: textPrompt("w"),
        })
        const claimed = yield* worker.tick
        const claim = claimed.find((item) => item.run.runId === receipt.runId)!
        expect(claim).toBeDefined()
        const again = yield* worker.tick
        expect(again.some((item) => item.run.runId === receipt.runId)).toBe(true)
        expect(again).toHaveLength(1)
        yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
        expect(
          yield* (yield* RunClaims.RunClaims).refreshLease({
            runId: receipt.runId,
            workerId: "tick-worker",
            attemptFence: claim.attemptFence,
            lease: "10 seconds",
          }),
        ).toBe(false)
      }).pipe(Effect.provide(postgresWithWorker(url, "tick-worker", 2)), Effect.scoped),
    ),
  )

  it.live("expired non-idempotent running operations become unknown", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("ops")
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "op",
          prompt: textPrompt("op"),
        })
        yield* claims.claimReadyRuns({ workerId: "ops-w", limit: 1, lease: "10 seconds" })
        const recorded = yield* driver.recordOperation({
          ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
          runId: receipt.runId,
          operationKey: "tool:counter",
          kind: "tool",
          inputDigest: "digest:1",
          input: { n: 1 },
          replayPolicy: "never",
          attempt: 1,
        })
        const operationClaim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
        yield* driver.startOperation({ ...operationClaim, operationId: recorded.operationId })
        const expired = yield* driver.expireRunningOperation({
          ...operationClaim,
          operationId: recorded.operationId,
        })
        expect(expired.outcome).toBe("unknown")
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
        expect(yield* claims.claimReadyRuns({ workerId: "blocked", limit: 1, lease: "10 seconds" })).toEqual([])
        expect(
          (yield* driver.claimExecution({ runId: receipt.runId, ownerId: "blocked" }).pipe(Effect.flip))._tag,
        ).toBe("@batonfx/runtime/RuntimeUnavailable")
        yield* runtime.resolveOperation({
          runId: receipt.runId,
          operationId: recorded.operationId,
          idempotencyKey: "resolve:postgres",
          resolution: { _tag: "Succeeded", value: "recovered" },
        })
        const [resumed] = yield* claims.claimReadyRuns({ workerId: "resumed", limit: 1, lease: "10 seconds" })
        expect(resumed?.run.runId).toBe(receipt.runId)
        expect((yield* driver.getOperation({ runId: receipt.runId, operationId: recorded.operationId })).result).toBe(
          "recovered",
        )
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("rejects stale operation completion after a concurrent lease takeover", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("operation-takeover"),
          idempotencyKey: "operation-takeover",
          prompt: textPrompt("operation-takeover"),
        })
        const [claimed] = yield* claims.claimReadyRuns({ workerId: "owner-a", limit: 1, lease: "10 seconds" })
        const claim = {
          runId: receipt.runId,
          ownerId: claimed!.workerId,
          attemptFence: claimed!.attemptFence,
        }
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: "tool:takeover",
          kind: "tool",
          inputDigest: "takeover",
          input: {},
          replayPolicy: "never",
          attempt: claimed!.run.attempt,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId })

        const locked = yield* Deferred.make<void>()
        const takeover = Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql.withTransaction(
            Effect.gen(function* () {
              const pid = (yield* sql<{ readonly pid: number }>`SELECT pg_backend_pid() AS pid`)[0]!.pid
              yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${receipt.runId} FOR UPDATE`
              yield* sql`
                SELECT operation_id FROM baton_run_operations
                WHERE run_id = ${receipt.runId} AND operation_id = ${operation.operationId}
                FOR UPDATE
              `
              yield* Deferred.succeed(locked, undefined)
              let blocked = false
              for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
                const [waiting] = yield* sql<{ readonly blocked: boolean }>`
                  SELECT EXISTS (
                    SELECT 1 FROM pg_stat_activity
                    WHERE ${pid} = ANY(pg_blocking_pids(pid))
                  ) AS blocked
                `
                blocked = waiting?.blocked === true
                if (!blocked) yield* Effect.sleep("10 millis")
              }
              expect(blocked).toBe(true)
              yield* sql`
                UPDATE baton_runs
                SET owner_worker_id = 'owner-b', attempt_fence = attempt_fence + 1,
                  lease_expires_at = NOW() + INTERVAL '10 seconds', updated_at = NOW()
                WHERE run_id = ${receipt.runId}
              `
            }),
          )
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

        const takeoverFiber = yield* Effect.forkScoped(takeover)
        yield* Deferred.await(locked)
        const checkpoint = {
          driverVersion: "1" as const,
          executable: assistantRef.ref,
          turn: 1,
          budget: { allocation: {}, remaining: {}, depth: 0 },
          state: {},
        }
        const staleFiber = yield* Effect.forkScoped(
          store.completeOperation({
            ...claim,
            operationId: operation.operationId,
            outcome: { _tag: "Succeeded", value: { owner: "owner-a" } },
            checkpoint,
          }),
        )
        yield* Fiber.join(takeoverFiber)
        const stale = yield* Fiber.join(staleFiber).pipe(Effect.flip)
        expect(stale).toBeInstanceOf(Errors.StaleClaim)
        expect((yield* store.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
          "running",
        )
        const completed = yield* store.completeOperation({
          runId: receipt.runId,
          ownerId: "owner-b",
          attemptFence: claim.attemptFence + 1,
          operationId: operation.operationId,
          outcome: { _tag: "Succeeded", value: { owner: "owner-b" } },
          checkpoint,
        })
        expect(completed.status).toBe("succeeded")
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("wait signal timeout cancel races and first terminal wins", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const driver = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("wait")
        const waiting = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "wait",
          prompt: textPrompt("wait"),
        })
        const successor = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "next",
          prompt: textPrompt("next"),
        })
        const claimed = yield* claims.claimReadyRuns({ workerId: "wait-w", limit: 1, lease: "10 seconds" })
        const claim = { runId: waiting.runId, ownerId: "wait-w", attemptFence: claimed[0]!.attemptFence }
        yield* driver.suspend({
          ...claim,
          wait: openWait("approval", "approval"),
          suspension: suspension("approval", "approval"),
        })
        expect((yield* runtime.inspect(successor.runId)).status).toBe("queued")
        yield* runtime.respond({ runId: waiting.runId, waitId: "approval", resolution: { _tag: "Approved" } })
        expect((yield* runtime.inspect(waiting.runId)).status).toBe("running")
        yield* driver.suspend({
          ...claim,
          wait: openWait("signal-me", "signal"),
          suspension: suspension("signal-me"),
        })
        yield* runtime.signal({ runId: waiting.runId, name: "signal-me" })
        const checkpoint = {
          driverVersion: "1" as const,
          executable: assistantRef.ref,
          turn: 1,
          budget: { allocation: {}, remaining: {}, depth: 0 },
          state: { dialect: "postgres" },
        }
        for (const outcome of [
          { _tag: "Failed" as const, error: { message: "failed" } },
          { _tag: "Unknown" as const },
        ]) {
          const operation = yield* driver.recordOperation({
            ...claim,
            operationKey: `tool:${outcome._tag}`,
            kind: "tool",
            inputDigest: outcome._tag,
            input: {},
            replayPolicy: "never",
            attempt: 1,
          })
          yield* driver.startOperation({ ...claim, operationId: operation.operationId })
          yield* driver.completeOperation({ ...claim, operationId: operation.operationId, outcome, checkpoint })
        }
        expect((yield* driver.loadExecution(waiting.runId)).checkpoint).toEqual(checkpoint)
        expect((yield* runtime.inspect(waiting.runId)).status).toBe("needs-resolution")
        yield* claims.commitWithClaim({
          runId: waiting.runId,
          workerId: "wait-w",
          attemptFence: claimed[0]!.attemptFence,
          transition: "complete",
          result: completedResult("done"),
        })
        const again = yield* driver
          .fail({
            runId: waiting.runId,
            ownerId: "wait-w",
            attemptFence: claimed[0]!.attemptFence,
            error: Errors.AgentExecutionFailure.make({ message: "nope" }),
          })
          .pipe(Effect.flip)
        expect(again).toBeInstanceOf(Errors.StaleClaim)
        expect((yield* runtime.inspect(waiting.runId)).status).toBe("succeeded")
        const nextClaim = yield* claims.claimReadyRuns({ workerId: "wait-w", limit: 1, lease: "10 seconds" })
        expect(nextClaim[0]?.run.runId).toBe(successor.runId)
        yield* runtime.cancel({ runId: successor.runId, reason: "stop" })
        expect((yield* runtime.inspect(successor.runId)).status).toBe("cancelled")
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("child completion reconciles without parent cancel inversion", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const sessionId = uniqueSession("child")
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId,
          idempotencyKey: "parent",
          prompt: textPrompt("parent"),
        })
        yield* claims.claimReadyRuns({ workerId: "parent-w", limit: 1, lease: "10 seconds" })
        const child = yield* runtime.spawn({
          parentRunId: parent.runId,
          invocationId: "inv-1",
          selection: "researcher",
          prompt: textPrompt("child"),
        })
        const [childClaim] = yield* claims.claimReadyRuns({ workerId: "child-w", limit: 1, lease: "10 seconds" })
        expect(childClaim?.run.runId).toBe(child.runId)
        yield* claims.commitWithClaim({
          runId: child.runId,
          workerId: "child-w",
          attemptFence: childClaim!.attemptFence,
          transition: "complete",
          result: completedResult("child-done"),
        })
        const parentTags = yield* runtime.events({ runId: parent.runId, cursor: -1 }).pipe(
          Stream.take(4),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk].map((event) => event._tag)),
        )
        expect(parentTags).toContain("ChildLinked")
        expect(parentTags).toContain("ChildSettled")
        yield* runtime.cancel({ runId: parent.runId, reason: "parent-stop" })
        expect((yield* runtime.inspect(parent.runId)).status).toBe("cancelled")
        expect((yield* runtime.inspect(child.runId)).status).toBe("succeeded")
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("enforces and recovers durable fan-out concurrency", () =>
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
            selection: "researcher",
            prompt: `review-${ordinal}`,
          })),
          concurrency: 1,
          join: { _tag: "Quorum", required: 2 },
          remainder: "abandon",
        })
        expect((yield* runtime.inspect(receipt.childRunIds[0]!)).executableRef).toEqual(researcherRef.ref)
        const changed = yield* runtime
          .fanOut({
            parentRunId: parent.runId,
            idempotencyKey: "reviews",
            members: [0, 1, 2].map((ordinal) => ({
              key: `review-${ordinal}`,
              selection: ordinal === 0 ? "analyst" : "researcher",
              prompt: `review-${ordinal}`,
            })),
            concurrency: 1,
            join: { _tag: "Quorum", required: 2 },
            remainder: "abandon",
          })
          .pipe(Effect.flip)
        expect(changed).toBeInstanceOf(Errors.FanOutConflict)
        const beforeMissing = yield* runtime.inspectTree(parent.runId)
        const missing = yield* runtime
          .fanOut({
            parentRunId: parent.runId,
            idempotencyKey: "missing",
            members: [{ key: "missing", selection: "undeclared", prompt: "missing" }],
            concurrency: 1,
            join: { _tag: "AllSuccess" },
            remainder: "await",
          })
          .pipe(Effect.flip)
        expect(missing).toBeInstanceOf(Errors.ChildSelectionMissing)
        expect(yield* runtime.inspectTree(parent.runId)).toEqual(beforeMissing)
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
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("rejects fan-out from a terminal parent", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("terminal-parent-fan-out"),
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const [claim] = yield* claims.claimReadyRuns({ workerId: "parent", limit: 1 })
        yield* claims.commitWithClaim({
          runId: parent.runId,
          workerId: "parent",
          attemptFence: claim!.attemptFence,
          transition: "complete",
          result: completedResult("done"),
        })
        const failure = yield* runtime
          .fanOut({
            parentRunId: parent.runId,
            idempotencyKey: "late",
            members: [{ key: "late", selection: "researcher", prompt: "late" }],
            concurrency: 1,
            join: { _tag: "AllSuccess" },
            remainder: "await",
          })
          .pipe(Effect.flip)
        expect(failure).toBeInstanceOf(Errors.RunTerminal)
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("cursor replay on a second runtime node matches history", () =>
    withSchema(
      Effect.gen(function* () {
        const sessionId = uniqueSession("replay")
        const runId = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          const claims = yield* RunClaims.RunClaims
          const receipt = yield* runtime.send({
            to: assistantAddress,
            sessionId,
            idempotencyKey: "replay",
            prompt: textPrompt("replay"),
          })
          const claimed = yield* claims.claimReadyRuns({ workerId: "n1", limit: 1, lease: "10 seconds" })
          yield* claims.commitWithClaim({
            runId: receipt.runId,
            workerId: "n1",
            attemptFence: claimed[0]!.attemptFence,
            transition: "complete",
            result: completedResult("ok"),
          })
          return receipt.runId
        }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped)

        const tagsA = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return yield* runtime.events({ runId, cursor: -1 }).pipe(
            Stream.take(3),
            Stream.runCollect,
            Effect.map((chunk) => [...chunk].map((event) => `${event.sequence}:${event._tag}`)),
          )
        }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped)

        const tagsB = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          return yield* runtime.events({ runId, cursor: -1 }).pipe(
            Stream.take(3),
            Stream.runCollect,
            Effect.map((chunk) => [...chunk].map((event) => `${event.sequence}:${event._tag}`)),
          )
        }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped)

        expect(tagsA).toEqual(tagsB)
        expect(tagsA[0]).toBe("0:RunAccepted")
      }),
    ),
  )

  it.live("rejects malformed and cross-closure persisted event references with RuntimeUnavailable", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const malformed = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("malformed-event-ref"),
          idempotencyKey: "malformed",
          prompt: textPrompt("malformed"),
        })
        const crossClosure = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("cross-closure-event-ref"),
          idempotencyKey: "cross-closure",
          prompt: textPrompt("cross-closure"),
        })

        yield* corruptEventExecutableRef(malformed.runId, {})
        const historyError = yield* runtime.history({ runId: malformed.runId, cursor: -1, limit: 10 }).pipe(Effect.flip)
        expect(historyError).toBeInstanceOf(Errors.RuntimeUnavailable)

        yield* corruptEventExecutableRef(crossClosure.runId, alternateAssistantRef.ref)
        const replayError = yield* runtime
          .events({ runId: crossClosure.runId, cursor: -1 })
          .pipe(Stream.runCollect, Effect.flip)
        expect(replayError).toBeInstanceOf(Errors.RuntimeUnavailable)
      }).pipe(Effect.provide(postgresLayer(url)), Effect.scoped),
    ),
  )

  it.live("RunSchema plan check apply and typed verify failures", () =>
    withSchema(
      Effect.gen(function* () {
        const restoreMeta = Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`
            UPDATE ${sql(SCHEMA_META_TABLE)}
            SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = FALSE
            WHERE id = 1
          `
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) })), Effect.scoped)

        const planned = yield* RunSchema.plan("postgres-test").pipe(
          Effect.provide(PgClient.layer({ url: Redacted.make(url) })),
          Effect.scoped,
        )
        expect(planned.required).toBe(SCHEMA_VERSION)
        expect(planned.upgradeRequired).toBe(false)
        yield* RunSchema.check("postgres-test").pipe(
          Effect.provide(PgClient.layer({ url: Redacted.make(url) })),
          Effect.scoped,
        )
        yield* markDirty()
        const dirty = yield* Effect.exit(Effect.void.pipe(Effect.provide(postgresLayer(url)), Effect.scoped))
        expect(Exit.isFailure(dirty)).toBe(true)
        yield* restoreMeta
        yield* corruptChecksum()
        const mismatch = yield* Effect.exit(Effect.void.pipe(Effect.provide(postgresLayer(url)), Effect.scoped))
        expect(Exit.isFailure(mismatch)).toBe(true)
        yield* restoreMeta
        yield* bumpSchemaVersion(SCHEMA_VERSION + 9)
        const future = yield* Effect.exit(Effect.void.pipe(Effect.provide(postgresLayer(url)), Effect.scoped))
        expect(Exit.isFailure(future)).toBe(true)
        yield* restoreMeta
      }),
    ),
  )
})

if (!postgresAvailable) {
  it.skip("postgres suite skipped: set BATON_DATABASE_URL or DATABASE_URL", () => undefined)
}
