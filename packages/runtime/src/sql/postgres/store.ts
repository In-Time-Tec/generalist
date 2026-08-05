import { Effect, Equal, Schema, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { PgClient } from "@effect/sql-pg"
import {
  CursorExpired,
  IdempotencyConflict,
  ResponseConflict,
  RunTerminal,
  RuntimeUnavailable,
  WaitNotOpen,
  ChildSelectionMissing,
} from "../../errors.js"
import { childDigest } from "../../memory/digest.js"
import { equals, resolveChild } from "../../executable-manifest.js"
import { isTerminal } from "../../run.js"
import { RunStore } from "../../run-store.js"
import { admitSteering, readSteering, saveCompletionContinuation } from "../store-steering.js"
import type { RunRow } from "../rows.js"
import { withSql } from "../sql-effect.js"
import { makeEventHub } from "../subscribers.js"
import { check as checkSchema } from "./run-schema.js"
import { NOTIFY_CHANNEL } from "./schema.js"
import { makePostgresClaims } from "./store-claims.js"
import { postgresOperations } from "./store-ops.js"
import { claimExecution, loadExecution, requireExecutionClaim, saveExecution } from "../store-execution.js"
import { decodeRunEffect, hasAdmission, loadRunWait } from "../store-helpers.js"
import type { WaitResolution } from "../../run-wait.js"
import { fanOutStoreMethods } from "./store-fan-out.js"
import { deferCancelledFanOutParent, makeCancelRun } from "./store-cancel.js"
import { loadTreeHistory } from "../tree-history.js"
import { loadRunSnapshot, loadTreeInspection } from "../inspection.js"
import { withConsistentSnapshot } from "../inspection-transaction.js"
import { decodePinnedEffect, decodeStoredPinnedEffect } from "../codecs.js"
import { suspend } from "./store-suspend.js"
import {
  afterTerminal,
  appendEvent,
  completeRun,
  emitAgentEvent,
  insertRun,
  loadEventsAfter,
  lockRun,
  loadRun,
  lockSpawnParent,
  requireRun,
  settleParent,
} from "./pg-helpers.js"
import type { PostgresStoreOptions } from "./runtime-layer.js"
import { programStoreMethods } from "./store-program.js"
import { admitStart as admitExactStart } from "../store-admit.js"
import { admitSend } from "./store-admit.js"
import { associateRegistrations, loadRegistrations } from "../executable-registrations.js"
import { narrow } from "../../executable-registration.js"
import { PendingRunOutcome } from "../../run-store.js"
const nextId = (prefix: string) => Effect.sync(() => `${prefix}_${Math.random().toString(36).slice(2)}`)
export const makePostgresServices = (options: PostgresStoreOptions) =>
  Effect.gen(function* () {
    const source = options.source ?? "postgres"
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    yield* checkSchema(source)
    const hub = yield* makeEventHub()
    yield* Effect.addFinalizer(() => hub.shutdown)
    const transactionHub: typeof hub = { ...hub, publish: () => Effect.void }
    const capacity = options.subscriberQueueCapacity ?? 64
    const sql = yield* SqlClient.SqlClient
    const pg = yield* PgClient.PgClient
    const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | PgClient.PgClient>) =>
      withSql(sql, sql.withTransaction(effect.pipe(Effect.provideService(PgClient.PgClient, pg))))
    const runNoTxn = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | PgClient.PgClient>) =>
      withSql(sql, effect.pipe(Effect.provideService(PgClient.PgClient, pg)))
    const runInspection = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      withSql(sql, withConsistentSnapshot(sql, "postgres", effect))
    const cancelRun = makeCancelRun({ sql, hub: transactionHub })
    const operations = postgresOperations({
      sql,
      hub: transactionHub,
      run,
      runNoTxn,
      requireRun,
      requireClaim: requireExecutionClaim,
      nextId,
    })
    const store = RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "postgres", multiWorker: true }),
      hasAdmission: (input) => runNoTxn(hasAdmission(input)),
      admitSend: (input) => run(admitSend(transactionHub, addressBindings, nextId, input)),
      admitStart: (input) =>
        run(
          sql`SELECT pg_advisory_xact_lock(hashtext('baton:executable-registrations'))`.pipe(
            Effect.andThen(admitExactStart(transactionHub, input)),
          ),
        ),
      admitSpawn: (input) =>
        run(
          Effect.gen(function* () {
            const parent = yield* lockSpawnParent(input.parentRunId)
            const executableRef = resolveChild(parent.executableRef, parent.executableManifest, input.selection)
            if (executableRef === undefined) {
              return yield* ChildSelectionMissing.make({ parentRunId: parent.runId, selection: input.selection })
            }
            const digest = childDigest(input.message, executableRef)
            const executable = yield* decodePinnedEffect({
              ref: executableRef,
              manifest: parent.executableManifest,
            })
            const registrations = yield* narrow(executable, yield* loadRegistrations(parent.runId)).pipe(
              Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
            )
            const existing = yield* sql<RunRow>`
              SELECT * FROM baton_runs
              WHERE address = ${input.message.to}
                AND session_id = ${input.message.sessionId}
                AND idempotency_key = ${input.message.idempotencyKey}
            `
            const prior = existing[0]
            if (prior !== undefined) {
              const priorExecutable = yield* decodeStoredPinnedEffect(
                prior.executable_ref_json,
                prior.executable_manifest_json,
              )
              if (prior.message_digest !== digest || !equals(priorExecutable, executable)) {
                return yield* IdempotencyConflict.make({
                  address: input.message.to,
                  sessionId: input.message.sessionId,
                  idempotencyKey: input.message.idempotencyKey,
                  existingRunId: prior.run_id,
                })
              }
              return {
                runId: prior.run_id,
                messageId: prior.message_id,
                acceptedSequence: Number(prior.accepted_sequence),
                duplicate: true,
              }
            }
            const runId = yield* nextId("run")
            yield* insertRun({
              runId,
              status: "queued",
              message: input.message,
              digest,
              executableRef,
              executableManifest: parent.executableManifest,
              rootRunId: parent.rootRunId,
              parentRunId: parent.runId,
              invocationId: input.invocationId,
              acceptedSequence: 0,
            })
            yield* associateRegistrations(runId, registrations)
            yield* sql`
              INSERT INTO baton_run_links (parent_run_id, child_run_id, invocation_id, terminal_event_id, created_at, settled_at)
              VALUES (${parent.runId}, ${runId}, ${input.invocationId}, NULL, NOW(), NULL)
            `
            yield* appendEvent(hub, parent, {
              _tag: "ChildLinked",
              childRunId: runId,
              invocationId: input.invocationId,
            })
            const child = (yield* loadRun(runId))!
            yield* appendEvent(
              hub,
              child,
              { _tag: "RunAccepted", messageId: input.message.id, address: input.message.to },
              "queued",
            )
            const started = (yield* loadRun(runId))!
            yield* sql`UPDATE baton_runs SET attempt_fence = 1, attempt = 1, status = 'running' WHERE run_id = ${runId}`
            yield* appendEvent(
              transactionHub,
              { ...started, attempt: 1 },
              { _tag: "RunAttemptStarted", attempt: 1 },
              "running",
            )
            return { runId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
          }),
        ),
      events: (input) =>
        hub.subscribe({
          runId: input.runId,
          cursor: input.cursor,
          loadReplay: runNoTxn(
            Effect.gen(function* () {
              const loaded = yield* requireRun(input.runId)
              const replay = yield* loadEventsAfter(input.runId, input.cursor)
              return { replay, lastSequence: loaded.lastSequence }
            }),
          ),
          capacity,
          onSubscribed: pg.listen(NOTIFY_CHANNEL).pipe(
            Stream.runForEach((payload) => {
              if (payload !== input.runId) return Effect.void
              return runNoTxn(
                Effect.gen(function* () {
                  const latest = yield* requireRun(input.runId)
                  const events = yield* loadEventsAfter(input.runId, Math.max(input.cursor, latest.lastSequence - 8))
                  yield* Effect.forEach(events, (event) => hub.publish(input.runId, event), { discard: true })
                }),
              ).pipe(Effect.ignore)
            }),
            Effect.ignore,
          ),
        }),
      respond: (input) =>
        run(
          Effect.gen(function* () {
            yield* lockRun(input.runId)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status))
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            if (loaded.respondedWaitIds.has(input.waitId)) {
              const prior = yield* loadRunWait(loaded.runId, input.waitId)
              if (prior?.resolution !== undefined && Equal.equals(prior.resolution, input.resolution)) return
              return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
            }
            if (loaded.cancellationRequested) {
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            if (loaded.activeWaitId !== input.waitId) {
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            const responded = [...loaded.respondedWaitIds, input.waitId]
            const resolution: WaitResolution = input.resolution
            const closed = yield* sql<{ wait_id: string }>`
              UPDATE baton_run_waits SET status = 'responded', response_json = ${JSON.stringify(resolution)}, closed_at = NOW()
              WHERE run_id = ${loaded.runId} AND wait_id = ${input.waitId} AND status = 'open'
              RETURNING wait_id
            `
            if (closed.length === 0) {
              const prior = yield* loadRunWait(loaded.runId, input.waitId)
              if (prior?.resolution !== undefined && Equal.equals(prior.resolution, resolution)) return
              return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
            }
            yield* sql`
              UPDATE baton_runs
              SET responded_wait_ids_json = ${JSON.stringify(responded)}, updated_at = NOW()
              WHERE run_id = ${loaded.runId}
            `
            yield* sql`
              UPDATE baton_program_operations SET status = 'reserved'
              WHERE run_id = ${loaded.runId} AND wait_id = ${input.waitId} AND status = 'waiting'
            `
            const current = (yield* loadRun(loaded.runId))!
            yield* appendEvent(hub, current, { _tag: "RunResumed", waitId: input.waitId, resolution }, "running")
          }),
        ),
      signal: (input) =>
        run(
          Effect.gen(function* () {
            yield* lockRun(input.runId)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            if (loaded.cancellationRequested) return
            if (loaded.activeWaitId === undefined || loaded.activeWaitId !== input.name) return
            const resolution: WaitResolution = {
              _tag: "Signal",
              name: input.name,
              ...(input.payload === undefined ? {} : { payload: input.payload }),
            }
            yield* sql`
              UPDATE baton_run_waits SET status = 'signaled', response_json = ${JSON.stringify(resolution)}, closed_at = NOW()
              WHERE run_id = ${loaded.runId} AND wait_id = ${loaded.activeWaitId} AND status = 'open'
            `
            yield* appendEvent(hub, loaded, { _tag: "RunResumed", waitId: loaded.activeWaitId, resolution }, "running")
          }),
        ),
      cancel: (input) => run(lockRun(input.runId).pipe(Effect.andThen(cancelRun(input.runId, input.reason)))),
      admitSteering: (input) => run(lockRun(input.runId).pipe(Effect.andThen(admitSteering(input)))),
      readSteering: (input) => run(requireExecutionClaim(input).pipe(Effect.andThen(readSteering(input)))),
      inspect: (runId) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* requireRun(runId)
            const wait = yield* loadRunWait(runId, loaded.activeWaitId)
            return {
              runId: loaded.runId,
              status: loaded.status,
              executableRef: loaded.executableRef,
              executableManifest: loaded.executableManifest,
              lastSequence: loaded.lastSequence,
              durability: "durable" as const,
              ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
              ...(wait === undefined ? {} : { wait }),
            }
          }),
        ),
      snapshot: (runId) => runInspection(loadRunSnapshot(runId)),
      inspectTree: (rootRunId) => runInspection(loadTreeInspection(rootRunId)),
      history: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* requireRun(input.runId)
            if (input.cursor < -1 || input.cursor > loaded.lastSequence) {
              return yield* CursorExpired.make({ runId: input.runId, cursor: input.cursor, earliestSequence: 0 })
            }
            return (yield* loadEventsAfter(input.runId, input.cursor)).slice(0, input.limit)
          }),
        ),
      treeHistory: (input) => runNoTxn(loadTreeHistory(input)),
      list: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const rows =
              input.status === undefined
                ? yield* sql<RunRow>`SELECT * FROM baton_runs ORDER BY created_at DESC LIMIT ${input.limit}`
                : yield* sql<RunRow>`SELECT * FROM baton_runs WHERE status = ${input.status} ORDER BY created_at DESC LIMIT ${input.limit}`
            return yield* Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                const loaded = yield* decodeRunEffect(row)
                const wait = yield* loadRunWait(loaded.runId, loaded.activeWaitId)
                return {
                  runId: loaded.runId,
                  status: loaded.status,
                  executableRef: loaded.executableRef,
                  executableManifest: loaded.executableManifest,
                  lastSequence: loaded.lastSequence,
                  durability: "durable" as const,
                  ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
                  ...(wait === undefined ? {} : { wait }),
                }
              }),
            )
          }),
        ),
      complete: (input) =>
        run(
          Effect.gen(function* () {
            yield* lockRun(input.runId)
            yield* requireExecutionClaim(input)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            const continuation = yield* saveCompletionContinuation(input.runId, input.result)
            if (continuation !== undefined) return { _tag: "SteeringPending" as const, continuation }
            yield* completeRun(transactionHub, loaded, input.result)
            return { _tag: "Completed" as const }
          }),
        ),
      fail: (input) =>
        run(
          Effect.gen(function* () {
            yield* lockRun(input.runId)
            yield* requireExecutionClaim(input)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            if (loaded.cancellationRequested) {
              if (yield* deferCancelledFanOutParent(sql, loaded.runId)) return
              const event = yield* appendEvent(
                transactionHub,
                loaded,
                { _tag: "RunCancelled", ...(loaded.cancelReason === undefined ? {} : { reason: loaded.cancelReason }) },
                "cancelled",
              )
              const settled = (yield* loadRun(loaded.runId))!
              yield* settleParent(transactionHub, settled, event.eventId)
              yield* afterTerminal(transactionHub, settled)
              return
            }
            const runningFanOut = yield* sql<{ fan_out_id: string }>`
              SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${loaded.runId} AND status = 'running' LIMIT 1
            `
            if (runningFanOut.length > 0) {
              yield* sql`
                UPDATE baton_runs SET status = 'waiting', owner_worker_id = NULL, lease_expires_at = NULL,
                  pending_outcome_json = ${JSON.stringify(Schema.encodeSync(PendingRunOutcome)({ _tag: "Failed", error: input.error }))}
                WHERE run_id = ${loaded.runId}
              `
              return
            }
            const event = yield* appendEvent(
              transactionHub,
              loaded,
              { _tag: "RunFailed", error: input.error },
              "failed",
            )
            const settled = (yield* loadRun(loaded.runId))!
            yield* settleParent(transactionHub, settled, event.eventId)
            yield* afterTerminal(transactionHub, settled)
          }),
        ),
      suspend: (input) => run(suspend(transactionHub, input)),
      resume: (input) =>
        run(
          Effect.gen(function* () {
            yield* lockRun(input.runId)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            if (loaded.respondedWaitIds.has(input.waitId)) {
              const prior = yield* loadRunWait(loaded.runId, input.waitId)
              if (prior?.resolution !== undefined && Equal.equals(prior.resolution, input.resolution)) return
              return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
            }
            if (loaded.cancellationRequested) {
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            if (loaded.activeWaitId !== input.waitId) {
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            const responded = [...loaded.respondedWaitIds, input.waitId]
            const resolution: WaitResolution = input.resolution
            const closed = yield* sql<{ wait_id: string }>`
              UPDATE baton_run_waits SET status = 'responded', response_json = ${JSON.stringify(resolution)}, closed_at = NOW()
              WHERE run_id = ${loaded.runId} AND wait_id = ${input.waitId} AND status = 'open'
              RETURNING wait_id
            `
            if (closed.length === 0) {
              const prior = yield* loadRunWait(loaded.runId, input.waitId)
              if (prior?.resolution !== undefined && Equal.equals(prior.resolution, resolution)) return
              return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
            }
            yield* sql`
              UPDATE baton_runs
              SET responded_wait_ids_json = ${JSON.stringify(responded)}, updated_at = NOW()
              WHERE run_id = ${loaded.runId}
            `
            yield* sql`
              UPDATE baton_program_operations SET status = 'reserved'
              WHERE run_id = ${loaded.runId} AND wait_id = ${input.waitId} AND status = 'waiting'
            `
            const current = (yield* loadRun(loaded.runId))!
            yield* appendEvent(hub, current, { _tag: "RunResumed", waitId: input.waitId, resolution }, "running")
          }),
        ),
      emitAgentEvent: (input) => run(emitAgentEvent(transactionHub, input)),
      claimExecution: (input) => run(claimExecution(input)),
      loadExecution: (runId) => run(loadExecution(runId)),
      saveExecution: (input) => run(saveExecution(input)),
      ...fanOutStoreMethods({ sql, pg, hub: transactionHub, run, runNoTxn }),
      ...operations,
      ...programStoreMethods({ sql, hub: transactionHub, run, runNoTxn }),
    })
    const claims = makePostgresClaims({ sql, hub: transactionHub, run, cancelRun })
    return { store, claims }
  })
