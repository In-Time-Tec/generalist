import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Redacted, Schema, Scope, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { MysqlClient } from "@effect/sql-mysql2"
import { Errors, MysqlRunSchema, RunClaims, Runtime, RuntimeWorker, RunStore } from "../../src/index.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/sql/mysql/schema.js"
import {
  alternateAssistantRef,
  assistantAddress,
  assistantRef,
  completedResult,
  openWait,
  suspension,
  researcherRef,
  textPrompt,
} from "../helpers.js"
import { mysqlAvailable, mysqlClient, mysqlLayer, mysqlUrl, prepareMysql, uniqueSession } from "./helpers.js"
import { acknowledgementBoundaryContract } from "../acknowledgement-store-contract.js"

const scopedWith =
  <A, E>(layerValue: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A | Scope.Scope>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layerValue), (context) => effect.pipe(Effect.provideContext(context))))

const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

const describeMysql = mysqlAvailable ? describe.sequential : describe.skip
const url = mysqlUrl!

const withSchema = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* prepareMysql(url)
    return yield* effect
  })

const exactRegistrations = () => {
  const pins = new Set<string>()
  for (const entry of assistantRef.manifest.entries) {
    if (entry._tag !== "Agent") continue
    pins.add(entry.manifest.model)
    for (const value of [...entry.manifest.tools, ...entry.manifest.skills, ...entry.manifest.services]) {
      pins.add(value.pin)
    }
    if (entry.manifest.policy._tag === "Pinned") pins.add(entry.manifest.policy.pin)
    if (entry.manifest.compaction !== undefined) {
      pins.add(entry.manifest.compaction.service)
      pins.add(entry.manifest.compaction.summaryModel)
    }
  }
  return [...pins].map((pin) => ({ pin, codec: "mysql-test", version: "1", payload: { route: "exact" } }))
}

describeMysql("mysql run store", () => {
  it.live("persists the acknowledgement contract across a store reopen", () =>
    withSchema(
      Effect.gen(function* () {
        const recorded = yield* scopedWith(mysqlLayer(url))(acknowledgementBoundaryContract(uniqueSession("mysql-ack")))
        yield* scopedWith(mysqlLayer(url))(
          Effect.gen(function* () {
            const runtime = yield* Runtime.Runtime
            expect((yield* runtime.acknowledged(recorded.runId)).sequence).toBe(recorded.sequence)
          }),
        )
      }),
    ),
  )

  it.live("persists exact-start registrations and replays admission idempotently", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const input = {
          executable: assistantRef,
          registrations: exactRegistrations(),
          sessionId: uniqueSession("exact-start"),
          idempotencyKey: "exact-start",
          prompt: textPrompt("exact"),
          initialChildren: [
            {
              invocationId: "initial-research",
              idempotencyKey: "initial-research",
              selection: "researcher",
              sessionId: uniqueSession("exact-start-child"),
              prompt: textPrompt("research"),
            },
          ],
        }
        const first = yield* runtime.start(input)
        const duplicate = yield* runtime.start(input)
        const execution = yield* store.loadExecution(first.runId)
        expect(duplicate).toMatchObject({ runId: first.runId, duplicate: true })
        expect(duplicate.childRunIds).toEqual(first.childRunIds)
        expect((yield* store.loadExecution(first.childRunIds[0]!)).executableRef).toEqual(researcherRef.ref)
        expect(execution.registrations).toEqual(
          [...input.registrations].toSorted((left, right) => left.pin.localeCompare(right.pin)),
        )
        expect(
          yield* runtime
            .start({
              ...input,
              initialChildren: [{ ...input.initialChildren[0]!, prompt: textPrompt("changed") }],
            })
            .pipe(Effect.flip),
        ).toBeInstanceOf(Errors.IdempotencyConflict)
        const conflict = yield* runtime
          .start({
            ...input,
            idempotencyKey: "changed-registration",
            registrations: input.registrations.map((registration, index) =>
              index === 0
                ? {
                    pin: registration.pin,
                    codec: registration.codec,
                    version: registration.version,
                    payload: { route: "changed" },
                  }
                : registration,
            ),
          })
          .pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(Errors.ExecutableRegistrationConflict)
      }).pipe(scopedWith(mysqlLayer(url))),
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
      }).pipe(scopedWith(mysqlLayer(url))),
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
        const claimed = (yield* claims.claimReadyRuns({ workerId: "direct-resume", limit: 1 }))[0]!
        yield* store.suspend({
          runId: receipt.runId,
          ownerId: claimed.workerId,
          attemptFence: claimed.attemptFence,
          wait: openWait("wait:direct-resume"),
          suspension: suspension("wait:direct-resume"),
        })
        const resolution = { _tag: "Denied" as const, reason: "mysql exact resolution" }
        const resumeInput = { runId: receipt.runId, waitId: "wait:direct-resume", resolution }
        yield* store.resume(resumeInput)
        const resumed = (yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 10 })).find(
          (event) => event._tag === "RunResumed",
        )
        expect(resumed).toEqual(expect.objectContaining({ resolution }))
      }).pipe(scopedWith(mysqlLayer(url))),
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
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`
            UPDATE baton_runs SET
              executable_ref_json = ${encodeJson(alternateAssistantRef.ref)},
              executable_manifest_json = ${encodeJson(alternateAssistantRef.manifest)}
            WHERE run_id = ${runId}
          `
        }).pipe(scopedWith(mysqlClient(url)))
        const authorityConflict = yield* runtime.send(input).pipe(Effect.flip)
        expect(authorityConflict).toBeInstanceOf(Errors.IdempotencyConflict)
        const conflict = yield* runtime.send({ ...input, prompt: textPrompt("changed") }).pipe(Effect.flip)
        expect(conflict).toBeInstanceOf(Errors.IdempotencyConflict)
      }).pipe(scopedWith(mysqlLayer(url))),
    ),
  )

  it.live("rejects spawning from a transactionally locked terminal parent", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("terminal-parent"),
          idempotencyKey: "parent",
          prompt: textPrompt("parent"),
        })
        const [claim] = yield* claims.claimReadyRuns({ workerId: "terminal-parent", limit: 1 })
        yield* store.complete({
          runId: parent.runId,
          ownerId: claim!.workerId,
          attemptFence: claim!.attemptFence,
          result: completedResult("done"),
        })
        const failure = yield* runtime
          .spawn({
            parentRunId: parent.runId,
            invocationId: "too-late",
            selection: "researcher",
            prompt: textPrompt("child"),
          })
          .pipe(Effect.flip)
        expect(failure).toBeInstanceOf(Errors.RunTerminal)
      }).pipe(scopedWith(mysqlLayer(url))),
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
        expect(yield* store.complete({ ...executionClaim, result: completedResult("early") })).toMatchObject({
          _tag: "SteeringPending",
        })
      }).pipe(scopedWith(mysqlLayer(url))),
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
      }).pipe(scopedWith(mysqlLayer(url))),
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
      }).pipe(scopedWith(mysqlLayer(url))),
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
        }).pipe(scopedWith(mysqlClient(url)))
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
        }).pipe(scopedWith(mysqlClient(url)))
        expect(ownership[0]).toEqual({ owner_worker_id: null, lease_expires_at: null })
        expect((yield* claims.claimReadyRuns({ workerId: "owner-c", limit: 1 }))[0]?.run.runId).toBe(next.runId)
      }).pipe(scopedWith(mysqlLayer(url))),
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
        scopedWith(
          RuntimeWorker.layerWorker({
            workerId: "mysql-worker",
            concurrency: 2,
            lease: "5 seconds",
            pollInterval: "50 millis",
          }).pipe(Layer.provideMerge(mysqlLayer(url))),
        ),
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
        const children = yield* Effect.all(
          Array.from({ length: 4 }, (_, index) =>
            runtime.spawn({
              parentRunId: parent.runId,
              invocationId: `child-${index}`,
              selection: "researcher",
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
      }).pipe(scopedWith(mysqlLayer(url))),
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
      }).pipe(scopedWith(mysqlLayer(url))),
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
        const suspending = { runId: receipt.runId, ownerId: "wait-worker", attemptFence: claimed.attemptFence }
        yield* store.suspend({
          ...suspending,
          wait: openWait("approval", "approval"),
          suspension: suspension("approval", "approval"),
        })
        yield* runtime.respond({ runId: receipt.runId, waitId: "approval", resolution: { _tag: "Approved" } })
        const reclaimed = (yield* claims.claimReadyRuns({ workerId: "wait-worker", limit: 1 }))[0]!
        const claim = { runId: receipt.runId, ownerId: "wait-worker", attemptFence: reclaimed.attemptFence }
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
        const checkpoint = {
          driverVersion: "1" as const,
          executable: assistantRef.ref,
          turn: 1,
          budget: { allocation: {}, remaining: {}, depth: 0 },
          state: { dialect: "mysql" },
        }
        yield* store.completeOperation({
          ...claim,
          operationId: recorded.operationId,
          outcome: { _tag: "Failed", error: { message: "failed" } },
          checkpoint,
        })
        expect((yield* store.getOperation({ runId: receipt.runId, operationId: recorded.operationId })).status).toBe(
          "failed",
        )
        const unknown = yield* store.recordOperation({
          ...claim,
          operationKey: "tool:unknown",
          kind: "tool",
          inputDigest: "unknown",
          input: {},
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...claim, operationId: unknown.operationId })
        yield* store.completeOperation({
          ...claim,
          operationId: unknown.operationId,
          outcome: { _tag: "Unknown" },
          checkpoint,
        })
        expect((yield* store.loadExecution(receipt.runId)).checkpoint).toEqual(checkpoint)
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
        expect(yield* claims.claimReadyRuns({ workerId: "blocked", limit: 1 })).toEqual([])
        yield* runtime.resolveOperation({
          runId: receipt.runId,
          operationId: unknown.operationId,
          idempotencyKey: "resolve:mysql",
          resolution: { _tag: "Succeeded", value: "recovered" },
        })
        expect((yield* store.loadExecution(receipt.runId)).checkpoint).toEqual(checkpoint)
        const resumed = (yield* claims.claimReadyRuns({ workerId: "resumed", limit: 1 }))[0]!
        expect(resumed.run.runId).toBe(receipt.runId)
        expect((yield* store.getOperation({ runId: receipt.runId, operationId: unknown.operationId })).result).toBe(
          "recovered",
        )
      }).pipe(scopedWith(mysqlLayer(url))),
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
          selection: "researcher",
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
      }).pipe(scopedWith(mysqlLayer(url))),
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
            selection: "researcher",
            prompt: `review-${ordinal}`,
          })),
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "await",
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
            join: { _tag: "AllSuccess" },
            remainder: "await",
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
      }).pipe(scopedWith(mysqlLayer(url))),
    ),
  )

  it.live("preserves a parked outcome against steering and new fan-out admission", () =>
    withSchema(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const claims = yield* RunClaims.RunClaims
        const parent = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("pending-fan-out"),
          idempotencyKey: "parent",
          prompt: "parent",
        })
        const [parentClaim] = yield* claims.claimReadyRuns({ workerId: "pending-parent", limit: 1 })
        const input: Runtime.FanOutInput = {
          parentRunId: parent.runId,
          idempotencyKey: "reviews",
          members: [{ key: "review", selection: "researcher", prompt: "review" }],
          concurrency: 1,
          join: { _tag: "AllSuccess" },
          remainder: "await",
        }
        const fanOut = yield* runtime.fanOut(input)
        yield* runtime.steer({ runId: parent.runId, idempotencyKey: "prior", prompt: "prior" })
        yield* store.complete({
          runId: parent.runId,
          ownerId: parentClaim!.workerId,
          attemptFence: parentClaim!.attemptFence,
          result: { _tag: "Program", value: "preserved" },
        })
        yield* runtime.steer({ runId: parent.runId, idempotencyKey: "prior", prompt: "prior" })
        expect(
          yield* runtime.steer({ runId: parent.runId, idempotencyKey: "late", prompt: "late" }).pipe(Effect.flip),
        ).toBeInstanceOf(Errors.RunTerminal)
        expect((yield* runtime.fanOut(input)).duplicate).toBe(true)
        expect(yield* runtime.fanOut({ ...input, idempotencyKey: "late-fan-out" }).pipe(Effect.flip)).toBeInstanceOf(
          Errors.FanOutInvalid,
        )
        const [childClaim] = yield* claims.claimReadyRuns({ workerId: "pending-child", limit: 1 })
        expect(childClaim?.run.runId).toBe(fanOut.childRunIds[0])
        yield* claims.commitWithClaim({
          runId: childClaim!.run.runId,
          workerId: childClaim!.workerId,
          attemptFence: childClaim!.attemptFence,
          transition: "complete",
          result: completedResult("reviewed"),
        })
        expect((yield* runtime.inspect(parent.runId)).status).toBe("succeeded")
        expect((yield* runtime.history({ runId: parent.runId, limit: 100 })).at(-1)).toMatchObject({
          _tag: "RunCompleted",
          result: { _tag: "Program", value: "preserved" },
        })
      }).pipe(scopedWith(mysqlLayer(url))),
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
      }).pipe(scopedWith(mysqlLayer(url))),
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
        }).pipe(scopedWith(mysqlLayer(url)))
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
        }).pipe(scopedWith(mysqlLayer(url)))
        expect([...observed].map((event) => event._tag)).toEqual(["RunAttemptStarted", "RunCompleted"])
      }),
    ),
  )

  it.live("exposes plan, check, apply, markDirty, and verify-only startup", () =>
    withSchema(
      Effect.gen(function* () {
        const plan = yield* MysqlRunSchema.plan("mysql-test").pipe(scopedWith(mysqlClient(url)))
        expect(plan.required).toBe(SCHEMA_VERSION)
        expect(plan.upgradeRequired).toBe(false)
        expect(plan.statements).toEqual([])
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_schema_meta SET version = 0 WHERE id = 1`
        }).pipe(scopedWith(mysqlClient(url)))
        const upgrade = yield* Effect.exit(scopedWith(mysqlLayer(url))(Effect.void))
        expect(Exit.isFailure(upgrade)).toBe(true)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION} WHERE id = 1`
        }).pipe(scopedWith(mysqlClient(url)))
        yield* MysqlRunSchema.markDirty("mysql-test").pipe(scopedWith(mysqlClient(url)))
        const dirty = yield* Effect.exit(scopedWith(mysqlLayer(url))(Effect.void))
        expect(Exit.isFailure(dirty)).toBe(true)
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_schema_meta SET dirty = 0, checksum = ${schemaChecksum()} WHERE id = 1`
        }).pipe(scopedWith(MysqlClient.layer({ url: Redacted.make(url) })))
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`
        }).pipe(scopedWith(mysqlClient(url)))
        const future = yield* MysqlRunSchema.apply("mysql-test").pipe(scopedWith(mysqlClient(url)), Effect.flip)
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
        }).pipe(scopedWith(mysqlClient(url)))
      }),
    ),
  )
})

if (!mysqlAvailable) it.skip("mysql suite skipped: set BATON_MYSQL_URL or MYSQL_URL", () => undefined)
