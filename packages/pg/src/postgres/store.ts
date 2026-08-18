import { Effect, Equal, Option } from "effect"
import { listRuns } from "tenetkit/runtime/driver/sql/store-list"
import { SqlClient } from "effect/unstable/sql"
import {
  claimExecution,
  loadExecution,
  requireExecutionClaim,
  retryExecution,
  saveExecution,
} from "tenetkit/runtime/driver/sql/store-execution"
import { PgClient } from "@effect/sql-pg"
import { ApprovalStale, IdempotencyConflict, ResponseConflict } from "tenetkit/runtime/driver/errors"
import { ChildSelectionMissing, RunTerminal, RuntimeUnavailable, WaitNotOpen } from "tenetkit/runtime/driver/errors"
import { childDigest } from "tenetkit/runtime/driver/memory/digest"
import { enforceChildAdmission } from "tenetkit/runtime/driver/sql/store-admit-send"
import { equals, resolveChild } from "tenetkit/runtime/driver/executable-manifest"
import { isTerminal } from "tenetkit/runtime/driver/run"
import { PendingRunOutcome, RunStore } from "tenetkit/runtime/driver/run-store"
import { admitSteering, readSteering, saveCompletionContinuation } from "tenetkit/runtime/driver/sql/store-steering"
import { messagingStoreMethods } from "./store-messaging.js"
import type { RunRow } from "tenetkit/runtime/driver/sql/rows"
import { withSql } from "tenetkit/runtime/driver/sql/sql-effect"
import { makeEventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { check as checkSchema } from "./run-schema.js"
import {} from "./schema.js"
import { makeTransactionRunner, nextId } from "./transaction-events.js"
import { makeEventStream } from "./event-stream.js"
import { makePostgresClaims } from "./store-claims.js"
import { postgresOperations, type RunFn } from "./store-ops.js"
import { releaseLeasedExecution as releaseExecution } from "tenetkit/runtime/driver/sql/store-release-leased"
import { hasAdmission, loadRunWait } from "tenetkit/runtime/driver/sql/store-helpers"
import { WaitResolution } from "tenetkit/runtime/driver/run-wait"
import { fanOutStoreMethods } from "./store-fan-out.js"
import { deferCancelledFanOutParent, makeCancelRun } from "./store-cancel.js"
import {} from "tenetkit/runtime/driver/sql/tree-history"
import {} from "tenetkit/runtime/driver/sql/inspection"
import { withConsistentSnapshot } from "tenetkit/runtime/driver/sql/inspection-transaction"
import {
  StringArray,
  decodePinnedEffect,
  decodeStoredPinnedEffect,
  encodeJson,
} from "tenetkit/runtime/driver/sql/codecs"
import { suspend } from "./store-suspend.js"
import {
  afterTerminal,
  appendEvent,
  completeRun,
  emitAgentEvent,
  insertRun,
  loadEventsAfter,
  loadRun,
  requireRun,
  settleParent,
} from "./pg-helpers.js"
import type { PostgresStoreOptions } from "./runtime-layer.js"
import { lockMailbox, lockRun, lockRunHierarchy, lockSpawnParent } from "./locks.js"
import { inspectionStoreMethods } from "./store-inspection.js"
import { programStoreMethods } from "./store-program.js"
import { admitStart as admitExactStart } from "tenetkit/runtime/driver/sql/store-admit"
import { admitSend } from "./store-admit.js"
import { associateRegistrations, loadRegistrations } from "tenetkit/runtime/driver/sql/executable-registrations"
import { narrow } from "tenetkit/runtime/driver/executable-registration"
import { approvalResponse } from "tenetkit/runtime/driver/sql/respond-approval"
import { settlementNotifications } from "tenetkit/runtime/driver/sql/settlement-notifications"
import { reconcileCancellationRequested } from "tenetkit/runtime/driver/sql/session-lifecycle"
import { cancelSessionRuns } from "./session-cancellation.js"
import { makePostgresSessionStore } from "./session-store.js"
import { readinessForAdmission } from "tenetkit/runtime/driver/sql/store-child-capacity"
export const makePostgresServices = (options: PostgresStoreOptions) =>
  Effect.gen(function* () {
    const source = options.source ?? "postgres"
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    yield* checkSchema(source)
    const hub = yield* makeEventHub
    yield* Effect.addFinalizer(() => hub.shutdown)
    const capacity = options.subscriberQueueCapacity ?? 64
    const sql = yield* SqlClient.SqlClient
    yield* reconcileCancellationRequested
    const pg = yield* PgClient.PgClient
    const { run, runNoTxn, transactionHub } = makeTransactionRunner({ sql, pg, hub })
    const runInspection: RunFn = (effect) =>
      withSql(sql, withConsistentSnapshot(sql, "postgres", effect.pipe(Effect.provideService(PgClient.PgClient, pg))))
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
      sessionStore: (sessionId) => Effect.succeed(Option.some(makePostgresSessionStore({ sessionId, run, runNoTxn }))),
      hasAdmission: (input) => runNoTxn(hasAdmission(input)),
      admitSend: (input) => run(admitSend(transactionHub, addressBindings, nextId, input)),
      admitStart: (input) =>
        run(
          sql`SELECT pg_advisory_xact_lock(hashtext('tenetkit:executable-registrations'))`.pipe(
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
            const digest = childDigest(input.message, executableRef, {
              parentRunId: parent.runId,
              invocationId: input.invocationId,
              ...(input.label === undefined ? {} : { label: input.label }),
              ...(input.origin === undefined ? {} : { origin: input.origin }),
            })
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
            yield* enforceChildAdmission(parent, 1)
            const childReadiness = yield* readinessForAdmission(parent)
            yield* insertRun({
              runId,
              status: "queued",
              message: input.message,
              digest,
              executableRef,
              executableManifest: parent.executableManifest,
              rootRunId: parent.rootRunId,
              depth: parent.depth + 1,
              treePolicy: parent.treePolicy,
              parentRunId: parent.runId,
              invocationId: input.invocationId,
              acceptedSequence: 0,
            })
            yield* associateRegistrations(runId, registrations)
            yield* sql`
              INSERT INTO baton_run_links (parent_run_id, child_run_id, invocation_id, readiness, terminal_event_id, created_at, settled_at)
              VALUES (${parent.runId}, ${runId}, ${input.invocationId}, ${childReadiness}, NULL, NOW(), NULL)
            `
            yield* appendEvent(transactionHub, parent, {
              _tag: "ChildLinked",
              childRunId: runId,
              invocationId: input.invocationId,
              selection: input.selection,
              prompt: input.message.prompt,
              childDepth: parent.depth + 1,
              readiness: childReadiness,
              ...(input.label === undefined ? {} : { label: input.label }),
              ...(input.origin === undefined ? {} : { origin: input.origin }),
            })
            const child = (yield* loadRun(runId))!
            yield* appendEvent(
              transactionHub,
              child,
              { _tag: "RunAccepted", messageId: input.message.id, address: input.message.to },
              "queued",
            )
            if (childReadiness !== "ready") {
              return { runId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
            }
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
        makeEventStream({
          hub,
          pg,
          runId: input.runId,
          cursor: input.cursor,
          capacity,
          loadReplay: runNoTxn(
            Effect.gen(function* () {
              const loaded = yield* requireRun(input.runId)
              const replay = yield* loadEventsAfter(input.runId, input.cursor)
              return { replay, lastSequence: loaded.lastSequence }
            }),
          ),
          loadAfter: (cursor) => runNoTxn(loadEventsAfter(input.runId, cursor)),
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
              UPDATE baton_run_waits SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = NOW()
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
              SET responded_wait_ids_json = ${encodeJson(StringArray, responded)}, updated_at = NOW()
              WHERE run_id = ${loaded.runId}
            `
            yield* sql`
              UPDATE baton_program_operations SET status = 'reserved'
              WHERE run_id = ${loaded.runId} AND wait_id = ${input.waitId} AND status = 'waiting'
            `
            const current = (yield* loadRun(loaded.runId))!
            yield* appendEvent(
              transactionHub,
              current,
              { _tag: "RunResumed", waitId: input.waitId, resolution },
              "running",
            )
          }),
        ),
      respondApproval: (input) =>
        run(
          Effect.gen(function* () {
            yield* lockRun(input.runId)
            const response = yield* approvalResponse(input)
            if (response._tag === "Duplicate") return
            const loaded = yield* requireRun(input.runId)
            const responded = [...loaded.respondedWaitIds, response.waitId]
            const resolution: WaitResolution = input.decision
            const closed = yield* sql<{ wait_id: string }>`
              UPDATE baton_run_waits SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = NOW()
              WHERE run_id = ${loaded.runId} AND wait_id = ${response.waitId} AND status = 'open'
              RETURNING wait_id
            `
            if (closed.length === 0) {
              return yield* ApprovalStale.make({ runId: loaded.runId, approvalId: input.approvalId })
            }
            yield* sql`
              UPDATE baton_runs
              SET responded_wait_ids_json = ${encodeJson(StringArray, responded)}, updated_at = NOW()
              WHERE run_id = ${loaded.runId}
            `
            yield* sql`
              UPDATE baton_program_operations SET status = 'reserved'
              WHERE run_id = ${loaded.runId} AND wait_id = ${response.waitId} AND status = 'waiting'
            `
            const current = (yield* loadRun(loaded.runId))!
            yield* appendEvent(
              transactionHub,
              current,
              { _tag: "RunResumed", waitId: response.waitId, resolution },
              "running",
            )
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
              UPDATE baton_run_waits SET status = 'signaled', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = NOW()
              WHERE run_id = ${loaded.runId} AND wait_id = ${loaded.activeWaitId} AND status = 'open'
            `
            yield* appendEvent(
              transactionHub,
              loaded,
              { _tag: "RunResumed", waitId: loaded.activeWaitId, resolution },
              "running",
            )
          }),
        ),
      cancel: (input) => run(lockRunHierarchy(input.runId).pipe(Effect.andThen(cancelRun(input.runId, input.reason)))),
      cancelSession: (input) => run(cancelSessionRuns({ lockRun, cancelRun, ...input })),
      admitSteering: (input) => run(lockRun(input.runId).pipe(Effect.andThen(admitSteering(transactionHub, input)))),
      readSteering: (input) => run(requireExecutionClaim(input).pipe(Effect.andThen(readSteering(input)))),
      ...messagingStoreMethods({ run, runNoTxn, hub: transactionHub, lockRun, lockMailbox }),
      settlementNotifications: (input) => runNoTxn(settlementNotifications(input)),
      ...inspectionStoreMethods({ hub, pg, run, runNoTxn, runInspection }),
      list: (input) => runNoTxn(listRuns(input)),
      complete: (input) =>
        run(
          Effect.gen(function* () {
            yield* lockRunHierarchy(input.runId)
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
            yield* lockRunHierarchy(input.runId)
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
                  suspension_json = NULL,
                  pending_outcome_json = ${encodeJson(PendingRunOutcome, { _tag: "Failed", error: input.error })}
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
              UPDATE baton_run_waits SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = NOW()
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
              SET responded_wait_ids_json = ${encodeJson(StringArray, responded)}, updated_at = NOW()
              WHERE run_id = ${loaded.runId}
            `
            yield* sql`
              UPDATE baton_program_operations SET status = 'reserved'
              WHERE run_id = ${loaded.runId} AND wait_id = ${input.waitId} AND status = 'waiting'
            `
            const current = (yield* loadRun(loaded.runId))!
            yield* appendEvent(
              transactionHub,
              current,
              { _tag: "RunResumed", waitId: input.waitId, resolution },
              "running",
            )
          }),
        ),
      emitAgentEvent: (input) => run(emitAgentEvent(transactionHub, input)),
      claimExecution: (input) => run(claimExecution(transactionHub, input)),
      loadExecution: (runId) => run(loadExecution(runId)),
      releaseExecution: (input) => run(releaseExecution(input)),
      saveExecution: (input) => run(saveExecution(input)),
      retryExecution: (input) => run(lockRun(input.runId).pipe(Effect.andThen(retryExecution(transactionHub, input)))),
      ...fanOutStoreMethods({ sql, pg, hub: transactionHub, run, runNoTxn }),
      ...operations,
      ...programStoreMethods({ sql, hub: transactionHub, run, runNoTxn, lockRunHierarchy }),
    })
    const claims = makePostgresClaims({ sql, hub: transactionHub, run, cancelRun })
    return { store, claims }
  })
