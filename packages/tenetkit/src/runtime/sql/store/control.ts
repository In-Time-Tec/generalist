import { Effect, Equal, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  ApprovalMismatch,
  ApprovalStale,
  ResponseConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  WaitNotOpen,
} from "../../errors.js"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { EmittableAgentLoopEvent } from "../../execution/agent/event.js"
import { ExecutionCheckpoint, ExecutionSuspension, type ExecutionResult } from "../../execution/state.js"
import type { CancelInput, RespondInput, SignalInput } from "../../service.js"
import type { RespondInput as RespondApprovalInput } from "../../operation/approval.js"
import { isTerminal } from "../../run.js"
import type { RunFailure } from "../../run/event.js"
import { encodeReason, WaitResolution } from "../../run/wait.js"
import { checkpointRef } from "../../executable/manifest.js"
import { StringArray, encodeExecutableRef, encodeJson } from "../codec/codecs.js"
import { encodeContinuation } from "../../run/steering.js"
import { afterTerminal, appendEvent, loadRun, loadRunWait, nowIso, settleParent } from "./statements.js"
import type { EventHub } from "../subscribers.js"
import type { DecodedRun } from "../codec/rows.js"
import { reconcileProgramCancellation } from "./program.js"
import { PendingRunOutcome } from "../../run/store.js"
import { groupIdFromSuspension, resultFromInspection } from "../../child/group.js"
import { inspectFanOut } from "./fan-out/service.js"
import { approvalResponse } from "../respond-approval.js"
import { hasPendingCancellationWork, loadTerminalEvent, reconcileChildWaitWith } from "./child/settlement.js"
import { markOperationCancellations } from "./operation/operations.js"

const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((run) => (run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run))),
  )

type UndefinedEffect = Effect.Effect<
  undefined,
  RunNotFound | RunTerminal | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>
type ConflictEffect = Effect.Effect<
  undefined,
  ResponseConflict | RunNotFound | RunTerminal | RuntimeUnavailable | SqlError | WaitNotOpen,
  SqlClient.SqlClient
>
type VoidEffect = Effect.Effect<void, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient>
type ApprovalEffect = Effect.Effect<
  void | undefined,
  ApprovalMismatch | ApprovalStale | RunNotFound | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>
type ResumeEffect = Effect.Effect<
  undefined,
  ResponseConflict | RunNotFound | RunTerminal | RuntimeUnavailable | SqlError | WaitNotOpen,
  SqlClient.SqlClient
>
type CompleteInput = { readonly runId: string; readonly result: ExecutionResult }
type FailInput = { readonly runId: string; readonly error: RunFailure }
type ResumeInput = { readonly runId: string; readonly waitId: string; readonly resolution: WaitResolution }
type AgentEventInput = { readonly runId: string; readonly event: EmittableAgentLoopEvent }
type SuspendInput = Parameters<import("../../run/store.js").Interface["suspend"]>[0]

const cancellationEvent = (reason: string | undefined) =>
  reason === undefined ? { _tag: "RunCancelled" as const } : { _tag: "RunCancelled" as const, reason }

function cancelDescendants(
  hub: EventHub,
  runId: string,
  reason: string | undefined,
): Effect.Effect<boolean, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient> {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const linked = yield* sql<{ child_run_id: string }>`
      SELECT l.child_run_id FROM tenetkit_run_links l
      LEFT JOIN tenetkit_fan_out_members m ON m.child_run_id = l.child_run_id
      WHERE l.parent_run_id = ${runId} AND m.child_run_id IS NULL
      ORDER BY l.child_run_id ASC
    `
    for (const link of linked) {
      const child = yield* loadRun(link.child_run_id)
      if (child !== undefined && !isTerminal(child.status)) yield* cancelRun(hub, child, reason ?? "parent cancelled")
    }
    const owned = yield* sql<{ child_run_id: string }>`
      SELECT m.child_run_id
      FROM tenetkit_fan_outs f JOIN tenetkit_fan_out_members m ON m.fan_out_id = f.fan_out_id
      WHERE f.parent_run_id = ${runId} AND f.status = 'running'
      ORDER BY m.ordinal ASC
    `
    for (const member of owned) {
      const child = yield* loadRun(member.child_run_id)
      if (child !== undefined && !isTerminal(child.status)) yield* cancelRun(hub, child, reason ?? "parent cancelled")
    }
    return linked.length > 0 || owned.length > 0
  })
}

const finishCancellation = (
  hub: EventHub,
  run: DecodedRun,
  current: DecodedRun,
  executing: boolean,
  reason: string | undefined,
): Effect.Effect<void, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    if (isTerminal(run.status) || executing || isTerminal(current.status)) return
    const sql = yield* SqlClient.SqlClient
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0 || (yield* hasPendingCancellationWork(run.runId))) return
    const event = yield* appendEvent(hub, current, cancellationEvent(reason), "cancelled")
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  })

const cancelRun = (
  hub: EventHub,
  run: DecodedRun,
  reason: string | undefined,
): Effect.Effect<void, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const terminal = isTerminal(run.status)
    const executing = run.ownerWorkerId !== undefined && (run.status === "running" || run.status === "cancelling")
    const needsResolution = run.status === "needs-resolution"
    let current = run
    if (!terminal && !current.cancellationRequested) {
      yield* appendEvent(
        hub,
        current,
        reason === undefined ? { _tag: "RunCancellationRequested" } : { _tag: "RunCancellationRequested", reason },
        needsResolution ? "needs-resolution" : "cancelling",
      )
      current = (yield* loadRun(run.runId))!
    }
    const marked = terminal ? 0 : yield* markOperationCancellations(run.runId)
    if (marked > 0 && current.status === "needs-resolution") {
      yield* sql`UPDATE tenetkit_runs SET status = 'cancelling' WHERE run_id = ${run.runId}`
      current = (yield* loadRun(run.runId))!
    }
    if (!terminal) yield* reconcileProgramCancellation(run.runId, reason ?? current.cancelReason)
    const cancellationRequested = sql.onDialectOrElse({
      pg: () => true,
      mysql: () => 1,
      orElse: () => 1,
    })
    yield* sql`UPDATE tenetkit_external_child_placements SET cancel_requested = ${cancellationRequested}
      WHERE parent_run_id = ${run.runId} AND settlement_id IS NULL`
    yield* sql`
      UPDATE tenetkit_run_waits SET status = 'cancelled', closed_at = ${yield* nowIso}
      WHERE run_id = ${run.runId} AND status = 'open'
    `
    if (yield* cancelDescendants(hub, run.runId, reason)) current = (yield* loadRun(run.runId))!
    yield* finishCancellation(hub, run, current, executing, reason)
  })

export const respond: {
  (hub: EventHub, input: RespondInput): ConflictEffect
  (input: RespondInput): (hub: EventHub) => ConflictEffect
} = Function.dual(2, (hub: EventHub, input: RespondInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.respondedWaitIds.has(input.waitId)) {
      const prior = yield* loadRunWait(run.runId, input.waitId)
      if (prior?.resolution !== undefined && Equal.equals(prior.resolution, input.resolution)) return
      return yield* ResponseConflict.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.cancellationRequested) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.activeWaitId !== input.waitId) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const responded = [...run.respondedWaitIds, input.waitId]
    const updated = yield* nowIso
    const resolution: WaitResolution = input.resolution
    yield* sql`
      UPDATE tenetkit_run_waits SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${updated}
      WHERE run_id = ${run.runId} AND wait_id = ${input.waitId} AND status = 'open'
    `
    yield* sql`
      UPDATE tenetkit_runs SET responded_wait_ids_json = ${encodeJson(StringArray, responded)}, updated_at = ${updated}
      WHERE run_id = ${run.runId}
    `
    yield* sql`
      UPDATE tenetkit_program_operations SET status = 'reserved'
      WHERE run_id = ${run.runId} AND wait_id = ${input.waitId} AND status = 'waiting'
    `
    const current = (yield* loadRun(run.runId))!
    yield* appendEvent(hub, current, { _tag: "RunResumed", waitId: input.waitId, resolution }, "running")
  }),
)

export const respondApproval: {
  (hub: EventHub, input: RespondApprovalInput): ApprovalEffect
  (input: RespondApprovalInput): (hub: EventHub) => ApprovalEffect
} = Function.dual(2, (hub: EventHub, input: RespondApprovalInput) =>
  approvalResponse(input).pipe(
    Effect.flatMap((response) =>
      response._tag === "Duplicate"
        ? Effect.void
        : respond(hub, { runId: input.runId, waitId: response.waitId, resolution: input.decision }),
    ),
    Effect.mapError((error) =>
      error._tag === "tenetkit/runtime/ResponseConflict" ||
      error._tag === "tenetkit/runtime/WaitNotOpen" ||
      error._tag === "tenetkit/runtime/RunTerminal"
        ? ApprovalStale.make({ runId: input.runId, approvalId: input.approvalId })
        : error,
    ),
  ),
)
export const signal: {
  (hub: EventHub, input: SignalInput): UndefinedEffect
  (input: SignalInput): (hub: EventHub) => UndefinedEffect
} = Function.dual(2, (hub: EventHub, input: SignalInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) return
    if (run.activeWaitId === undefined) return
    if (run.activeWaitId !== input.name) return
    const updated = yield* nowIso
    const resolution: WaitResolution =
      input.payload === undefined
        ? { _tag: "Signal", name: input.name }
        : { _tag: "Signal", name: input.name, payload: input.payload }
    yield* sql`
      UPDATE tenetkit_run_waits SET status = 'signaled', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${updated}
      WHERE run_id = ${run.runId} AND wait_id = ${run.activeWaitId} AND status = 'open'
    `
    yield* appendEvent(hub, run, { _tag: "RunResumed", waitId: run.activeWaitId, resolution }, "running")
  }),
)
export const cancel: {
  (hub: EventHub, input: CancelInput): VoidEffect
  (input: CancelInput): (hub: EventHub) => VoidEffect
} = Function.dual(2, (hub: EventHub, input: CancelInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    yield* cancelRun(hub, run, input.reason)
  }),
)
/** Settle a cancellation that was admitted while an unknown operation still needed resolution. */
export const settleAdmittedCancellation: {
  (hub: EventHub, runId: string): VoidEffect
  (runId: string): (hub: EventHub) => VoidEffect
} = Function.dual(2, (hub: EventHub, runId: string) =>
  Effect.gen(function* () {
    const run = yield* loadRun(runId)
    if (run === undefined || !run.cancellationRequested || isTerminal(run.status)) return
    yield* cancelRun(hub, run, run.cancelReason)
  }),
)
export const complete: {
  (hub: EventHub, input: CompleteInput): UndefinedEffect
  (input: CompleteInput): (hub: EventHub) => UndefinedEffect
} = Function.dual(2, (hub: EventHub, input: CompleteInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      const running = yield* sql<{ fan_out_id: string }>`
        SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
      `
      if (running.length > 0 || (yield* hasPendingCancellationWork(run.runId))) {
        yield* sql`UPDATE tenetkit_runs SET owner_worker_id = NULL WHERE run_id = ${run.runId}`
        return
      }
      const event = yield* appendEvent(
        hub,
        run,
        run.cancelReason === undefined ? { _tag: "RunCancelled" } : { _tag: "RunCancelled", reason: run.cancelReason },
        "cancelled",
      )
      const settled = (yield* loadRun(run.runId))!
      yield* settleParent(hub, settled, event.eventId)
      yield* afterTerminal(hub, settled)
      return
    }
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) {
      yield* sql`
        UPDATE tenetkit_runs SET status = 'waiting', owner_worker_id = NULL, suspension_json = NULL,
          pending_outcome_json = ${encodeJson(PendingRunOutcome, { _tag: "Completed", result: input.result })}
        WHERE run_id = ${run.runId}
      `
      return
    }
    const event = yield* appendEvent(hub, run, { _tag: "RunCompleted", result: input.result }, "succeeded")
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  }),
)
export const fail: {
  (hub: EventHub, input: FailInput): UndefinedEffect
  (input: FailInput): (hub: EventHub) => UndefinedEffect
} = Function.dual(2, (hub: EventHub, input: FailInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      const running = yield* sql<{ fan_out_id: string }>`
        SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
      `
      if (running.length > 0 || (yield* hasPendingCancellationWork(run.runId))) {
        yield* sql`UPDATE tenetkit_runs SET owner_worker_id = NULL WHERE run_id = ${run.runId}`
        return
      }
      const event = yield* appendEvent(
        hub,
        run,
        run.cancelReason === undefined ? { _tag: "RunCancelled" } : { _tag: "RunCancelled", reason: run.cancelReason },
        "cancelled",
      )
      const settled = (yield* loadRun(run.runId))!
      yield* settleParent(hub, settled, event.eventId)
      yield* afterTerminal(hub, settled)
      return
    }
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) {
      yield* sql`
        UPDATE tenetkit_runs SET status = 'waiting', owner_worker_id = NULL, suspension_json = NULL,
          pending_outcome_json = ${encodeJson(PendingRunOutcome, { _tag: "Failed", error: input.error })}
        WHERE run_id = ${run.runId}
      `
      return
    }
    const event = yield* appendEvent(hub, run, { _tag: "RunFailed", error: input.error }, "failed")
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  }),
)
export const suspend: {
  (hub: EventHub, input: SuspendInput): UndefinedEffect
  (input: SuspendInput): (hub: EventHub) => UndefinedEffect
} = Function.dual(2, (hub: EventHub, input: SuspendInput) => {
  const checkpoint = input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)
  const continuationChanged = input.continuation === undefined ? 0 : 1
  const continuation =
    input.continuation === null || input.continuation === undefined ? null : encodeContinuation(input.continuation)
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const opened = yield* nowIso
    yield* sql`
      UPDATE tenetkit_runs SET
        driver_checkpoint_json = COALESCE(${checkpoint}, driver_checkpoint_json),
        executable_ref_json = ${encodeExecutableRef(executableRef)},
        suspension_json = ${encodeJson(ExecutionSuspension, input.suspension)},
        continuation_json = CASE WHEN ${continuationChanged} = 1
          THEN ${continuation}
          ELSE continuation_json END,
        updated_at = ${opened}
      WHERE run_id = ${input.runId}
    `
    yield* sql`
      INSERT INTO tenetkit_run_waits (run_id, wait_id, reason, status, response_json, opened_at, closed_at)
      VALUES (${run.runId}, ${input.wait.waitId}, ${encodeReason(input.wait.reason)}, 'open', NULL, ${opened}, NULL)
      ON CONFLICT(run_id, wait_id) DO UPDATE SET
        status = 'open',
        reason = excluded.reason,
        opened_at = excluded.opened_at,
        closed_at = NULL
    `
    yield* appendEvent(hub, run, { _tag: "RunWaiting", wait: { ...input.wait, openedAt: opened } }, "waiting")
    const child = input.suspension.token === undefined ? undefined : yield* loadRun(input.suspension.token)
    const terminalEvent =
      child?.terminalEventId === undefined ? undefined : yield* loadTerminalEvent(child.terminalEventId)
    if (child !== undefined && terminalEvent !== undefined) {
      yield* reconcileChildWaitWith({
        hub,
        parent: (yield* loadRun(run.runId))!,
        child,
        event: terminalEvent,
        append: appendEvent,
      })
    }
    const groupId = groupIdFromSuspension(input.suspension)
    if (groupId !== undefined) {
      const rows = yield* sql<{ parent_run_id: string; status: string }>`
        SELECT parent_run_id, status FROM tenetkit_fan_outs WHERE fan_out_id = ${groupId}
      `
      const group = rows[0]
      if (group?.parent_run_id === run.runId && group.status !== "running") {
        const resolution = {
          _tag: "Signal" as const,
          name: input.wait.waitId,
          payload: resultFromInspection(
            yield* inspectFanOut(groupId).pipe(
              Effect.mapError(() => RuntimeUnavailable.make({ message: `child group ${groupId} disappeared` })),
            ),
          ),
        }
        const closed = yield* nowIso
        yield* sql`
          UPDATE tenetkit_run_waits SET status = 'signaled', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${closed}
          WHERE run_id = ${run.runId} AND wait_id = ${input.wait.waitId} AND status = 'open'
        `
        yield* appendEvent(
          hub,
          (yield* loadRun(run.runId))!,
          { _tag: "RunResumed", waitId: input.wait.waitId, resolution },
          "running",
        )
      }
    }
    yield* sql`UPDATE tenetkit_runs SET owner_worker_id = NULL WHERE run_id = ${run.runId}`
  })
})
export const resume: {
  (hub: EventHub, input: ResumeInput): ResumeEffect
  (input: ResumeInput): (hub: EventHub) => ResumeEffect
} = Function.dual(2, (hub: EventHub, input: ResumeInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.respondedWaitIds.has(input.waitId)) {
      const prior = yield* loadRunWait(run.runId, input.waitId)
      if (prior?.resolution !== undefined && Equal.equals(prior.resolution, input.resolution)) return
      return yield* ResponseConflict.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.activeWaitId !== input.waitId) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const responded = [...run.respondedWaitIds, input.waitId]
    const resolution: WaitResolution = input.resolution
    const updated = yield* nowIso
    yield* sql`
      UPDATE tenetkit_run_waits SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${updated}
      WHERE run_id = ${run.runId} AND wait_id = ${input.waitId} AND status = 'open'
    `
    yield* sql`
      UPDATE tenetkit_runs SET responded_wait_ids_json = ${encodeJson(StringArray, responded)}, updated_at = ${updated}
      WHERE run_id = ${run.runId}
    `
    const current = (yield* loadRun(run.runId))!
    yield* appendEvent(hub, current, { _tag: "RunResumed", waitId: input.waitId, resolution }, "running")
  }),
)
export const emitAgentEvent: {
  (hub: EventHub, input: AgentEventInput): UndefinedEffect
  (input: AgentEventInput): (hub: EventHub) => UndefinedEffect
} = Function.dual(2, (hub: EventHub, input: AgentEventInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    yield* appendEvent(hub, run, input.event)
    if (input.event._tag === "TurnCompleted") {
      yield* sql`
        UPDATE tenetkit_runs SET continuation_json = NULL WHERE run_id = ${run.runId}
      `
    }
  }),
)
