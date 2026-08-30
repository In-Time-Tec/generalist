import { Effect, Option } from "effect"
import { listRuns } from "tenetkit/runtime/driver/sql/store/list"
import { SqlClient } from "effect/unstable/sql"
import {
  claimExecution,
  loadExecution,
  releaseExecution,
  requireExecutionClaim,
  retryExecution,
  saveExecution,
} from "tenetkit/runtime/driver/sql/store/execution"
import { PgClient } from "@effect/sql-pg"
import {
  ApprovalStale,
  ChildSelectionMissing,
  IdempotencyConflict,
  ResponseConflict,
  RunTerminal,
  RuntimeUnavailable,
  WaitNotOpen,
} from "tenetkit/runtime/driver/errors"
import { childDigest } from "tenetkit/runtime/driver/memory/digest"
import { enforceChildAdmission } from "tenetkit/runtime/driver/sql/store/admit-send"
import { equals, resolveChild } from "tenetkit/runtime/driver/executable/manifest"
import { isTerminal } from "tenetkit/runtime/driver/run"
import { PendingRunOutcome, RunStore } from "tenetkit/runtime/driver/run/store"
import {
  admitSteering,
  readSteering,
  saveCompletionContinuation,
} from "tenetkit/runtime/driver/sql/store/steering/service"
import { messagingStoreMethods } from "./messaging.js"
import type { RunRow } from "tenetkit/runtime/driver/sql/codec/rows"
import { withSql } from "tenetkit/runtime/driver/sql/effect"
import { make as makeEventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { check as checkSchema } from "../run-schema.js"
import "../schema.js"
import { transactionRunner, nextId } from "../events/transaction-events.js"
import { eventStream } from "../events/event-stream.js"
import { postgresClaims } from "./claims.js"
import { postgresOperations, type RunFn } from "./ops.js"
import { hasAdmission, loadRunWait, nowIso, transitionRunWait } from "tenetkit/runtime/driver/sql/store/statements"
import { classifyResponse, WaitResolution } from "tenetkit/runtime/driver/run/wait"
import { fanOutStoreMethods } from "./fan-out.js"
import { deferCancelledFanOutParent, cancelRunFor } from "./cancel.js"
import "tenetkit/runtime/driver/sql/tree-replay"
import "tenetkit/runtime/driver/sql/inspection/service"
import { withConsistentSnapshot } from "tenetkit/runtime/driver/sql/inspection/transaction"
import { decodePinnedEffect, decodeStoredPinnedEffect, encodeJson } from "tenetkit/runtime/driver/sql/codec/codecs"
import { suspend } from "./suspend.js"
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
} from "./runtime.js"
import type { Options } from "../runtime-layer.js"
import { lockMailbox, lockRun, lockRunHierarchy, lockSpawnParent } from "../runs/locks.js"
import { inspectionStoreMethods } from "./inspection.js"
import { programStoreMethods } from "./program.js"
import { admitStart as admitExactStart } from "tenetkit/runtime/driver/sql/store/admit"
import { activateRoot } from "tenetkit/runtime/driver/sql/store/activate"
import { admitSend } from "./admit.js"
import { associateRegistrations, loadRegistrations } from "tenetkit/runtime/driver/sql/executable/registrations"
import { narrow } from "tenetkit/runtime/driver/executable/registration"
import { approvalResponse } from "tenetkit/runtime/driver/sql/respond-approval"
import { settlementNotifications } from "tenetkit/runtime/driver/sql/settlement-notifications"
import { reconcileCancellationRequested } from "tenetkit/runtime/driver/sql/session/lifecycle"
import { cancelSessionRuns } from "../sessions/session-cancellation.js"
import { postgresSessionStore } from "../sessions/session-store.js"
import { postgresSessionReader } from "../sessions/session-reader.js"
import { readinessForAdmission } from "tenetkit/runtime/driver/sql/store/child/capacity"
import {
  hasPendingOperationCancellation,
  hasUnknownOperation,
} from "tenetkit/runtime/driver/sql/store/child/settlement"
import { revokeExecutionSessionWriteClaim } from "tenetkit/runtime/driver/sql/session/claim"
import { acknowledge, loadAcknowledged } from "tenetkit/runtime/driver/sql/acknowledgement"

export const postgresServices = (options: Options) =>
  Effect.gen(function* () {
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    yield* checkSchema(options.source ?? "postgres")
    const hub = yield* makeEventHub
    yield* Effect.addFinalizer(() => hub.shutdown)
    const sql = yield* SqlClient.SqlClient
    yield* reconcileCancellationRequested
    const pg = yield* PgClient.PgClient
    const { run, runNoTxn, transactionHub } = transactionRunner({ sql, pg, hub })
    const runInspection: RunFn = (effect) =>
      withSql(sql, withConsistentSnapshot(sql, "postgres", effect.pipe(Effect.provideService(PgClient.PgClient, pg))))
    const cancelRun = cancelRunFor({ sql, hub: transactionHub })
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
      sessionReader: (sessionId) => Effect.succeed(Option.some(postgresSessionReader({ sessionId, runNoTxn }))),
      claimedSessionStore: (claim) => Effect.succeed(Option.some(postgresSessionStore({ claim, run, runNoTxn }))),
      hasAdmission: (input) => runNoTxn(hasAdmission(input)),
      admitSend: (input) => run(admitSend(transactionHub, addressBindings, nextId, input)),
      admitStart: (input, startOptions) =>
        run(
          sql`SELECT pg_advisory_xact_lock(hashtext('tenetkit:executable-registrations'))`.pipe(
            Effect.andThen(admitExactStart(transactionHub, input, startOptions)),
          ),
        ),
      activate: (input) => run(lockRun(input.runId).pipe(Effect.andThen(activateRoot(transactionHub, input.runId)))),
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
              ...(input.label === undefined ? undefined : { label: input.label }),
              ...(input.origin === undefined ? undefined : { origin: input.origin }),
            })
            const executable = yield* decodePinnedEffect({
              ref: executableRef,
              manifest: parent.executableManifest,
            })
            const registrations = yield* narrow(executable, yield* loadRegistrations(parent.runId)).pipe(
              Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
            )
            const existing = yield* sql<RunRow>`
              SELECT * FROM tenetkit_runs
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
                acceptedSequence: prior.accepted_sequence,
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
              INSERT INTO tenetkit_run_links (parent_run_id, child_run_id, invocation_id, readiness, terminal_event_id, created_at, settled_at)
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
              ...(input.label === undefined ? undefined : { label: input.label }),
              ...(input.origin === undefined ? undefined : { origin: input.origin }),
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
            yield* sql`UPDATE tenetkit_runs SET attempt_fence = 1, attempt = 1, status = 'running' WHERE run_id = ${runId}`
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
        eventStream({
          hub,
          pg,
          runId: input.runId,
          cursor: input.cursor,
          capacity: options.subscriberQueueCapacity ?? 64,
          loadReplay: runNoTxn(
            Effect.gen(function* () {
              const loaded = yield* requireRun(input.runId)
              const replay = yield* loadEventsAfter(input.runId, input.cursor)
              return { replay, lastSequence: loaded.lastSequence }
            }),
          ),
          loadAfter: (cursor) => runNoTxn(loadEventsAfter(input.runId, cursor)),
        }),
      acknowledge: (input) => run(lockRun(input.runId).pipe(Effect.andThen(acknowledge(input)))),
      acknowledged: (runId) => runNoTxn(loadAcknowledged(runId)),
      respond: (input) =>
        run(
          Effect.gen(function* () {
            yield* lockRun(input.runId)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status))
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            const prior = yield* loadRunWait(loaded.runId, input.waitId)
            const classification = classifyResponse(prior, input.resolution)
            if (classification === "duplicate-identical") return
            if (classification === "duplicate-conflict") {
              return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
            }
            if (loaded.cancellationRequested || classification !== "open") {
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            const resolution: WaitResolution = input.resolution
            const closed = yield* transitionRunWait({
              runId: loaded.runId,
              waitId: input.waitId,
              status: "responded",
              resolution,
              closedAt: yield* nowIso,
            })
            if (closed !== 1) {
              const transitioned = yield* loadRunWait(loaded.runId, input.waitId)
              const outcome = classifyResponse(transitioned, resolution)
              if (outcome === "duplicate-identical") return
              if (outcome === "duplicate-conflict") {
                return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
              }
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            yield* sql`
              UPDATE tenetkit_program_operations SET status = 'reserved'
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
            const resolution: WaitResolution = input.decision
            const closed = yield* transitionRunWait({
              runId: loaded.runId,
              waitId: response.waitId,
              status: "responded",
              resolution,
              closedAt: yield* nowIso,
            })
            if (closed !== 1) {
              return yield* ApprovalStale.make({ runId: loaded.runId, approvalId: input.approvalId })
            }
            yield* sql`
              UPDATE tenetkit_program_operations SET status = 'reserved'
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
            const wait = yield* loadRunWait(loaded.runId, input.name)
            if (wait?.status !== "open") return
            const resolution: WaitResolution = {
              _tag: "Signal",
              name: input.name,
              ...(input.payload === undefined ? undefined : { payload: input.payload }),
            }
            const closed = yield* transitionRunWait({
              runId: loaded.runId,
              waitId: wait.waitId,
              status: "signaled",
              resolution,
              closedAt: yield* nowIso,
            })
            if (closed !== 1) return
            yield* appendEvent(
              transactionHub,
              loaded,
              { _tag: "RunResumed", waitId: wait.waitId, resolution },
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
            yield* revokeExecutionSessionWriteClaim(input)
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
              if (
                (yield* deferCancelledFanOutParent(sql, loaded.runId)) ||
                (yield* hasPendingOperationCancellation(loaded.runId)) ||
                (yield* hasUnknownOperation(loaded.runId))
              ) {
                yield* sql`
                  UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL
                  WHERE run_id = ${loaded.runId}
                `
                yield* revokeExecutionSessionWriteClaim(input)
                return
              }
              const event = yield* appendEvent(
                transactionHub,
                loaded,
                {
                  _tag: "RunCancelled",
                  ...(loaded.cancelReason === undefined ? undefined : { reason: loaded.cancelReason }),
                },
                "cancelled",
              )
              const settled = (yield* loadRun(loaded.runId))!
              yield* settleParent(transactionHub, settled, event.eventId)
              yield* afterTerminal(transactionHub, settled)
              yield* revokeExecutionSessionWriteClaim(input)
              return
            }
            const runningFanOut = yield* sql<{ fan_out_id: string }>`
              SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${loaded.runId} AND status = 'running' LIMIT 1
            `
            if (runningFanOut.length > 0) {
              yield* sql`
                UPDATE tenetkit_runs SET status = 'waiting', owner_worker_id = NULL, lease_expires_at = NULL,
                  suspension_json = NULL,
                  pending_outcome_json = ${encodeJson(PendingRunOutcome, { _tag: "Failed", error: input.error })}
                WHERE run_id = ${loaded.runId}
              `
              yield* revokeExecutionSessionWriteClaim(input)
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
            yield* revokeExecutionSessionWriteClaim(input)
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
            const prior = yield* loadRunWait(loaded.runId, input.waitId)
            const classification = classifyResponse(prior, input.resolution)
            if (classification === "duplicate-identical") return
            if (classification === "duplicate-conflict") {
              return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
            }
            if (loaded.cancellationRequested || classification !== "open") {
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            const resolution: WaitResolution = input.resolution
            const closed = yield* transitionRunWait({
              runId: loaded.runId,
              waitId: input.waitId,
              status: "responded",
              resolution,
              closedAt: yield* nowIso,
            })
            if (closed !== 1) {
              const transitioned = yield* loadRunWait(loaded.runId, input.waitId)
              const outcome = classifyResponse(transitioned, resolution)
              if (outcome === "duplicate-identical") return
              if (outcome === "duplicate-conflict") {
                return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
              }
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            yield* sql`
              UPDATE tenetkit_program_operations SET status = 'reserved'
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
      ...fanOutStoreMethods({ sql, hub: transactionHub, run, runNoTxn }),
      ...operations,
      ...programStoreMethods({ sql, hub: transactionHub, run, runNoTxn, lockRunHierarchy }),
    })
    const claims = postgresClaims({ pg, source: options.source ?? "postgres", hub: transactionHub, run, cancelRun })
    return { store, claims }
  })
