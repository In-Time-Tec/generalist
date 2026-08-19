import { Effect, Equal } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  ApprovalMismatch,
  ApprovalStale,
  ResponseConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  WaitNotOpen,
} from "../errors.js"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { EmittableAgentLoopEvent } from "../agent-event.js"
import { ExecutionCheckpoint, ExecutionSuspension, type ExecutionResult } from "../execution-state.js"
import type { CancelInput, RespondInput, SignalInput } from "../runtime.js"
import type { RespondInput as RespondApprovalInput } from "../approval.js"
import { isTerminal } from "../run.js"
import type { RunFailure } from "../run-event.js"
import { encodeReason, WaitResolution } from "../run-wait.js"
import { checkpointRef } from "../executable-manifest.js"
import { StringArray, encodeExecutableRef, encodeJson } from "./codecs.js"
import { encodeContinuation } from "../steering.js"
import { afterTerminal, appendEvent, loadRun, loadRunWait, nowIso, settleParent } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"
import type { DecodedRun } from "./rows.js"
import { reconcileProgramCancellation } from "./store-program.js"
import { PendingRunOutcome } from "../run-store.js"
import { groupIdFromSuspension, resultFromInspection } from "../child-group.js"
import { inspectFanOut } from "./store-fan-out.js"
import { approvalResponse } from "./respond-approval.js"
import { hasUnsettledChild, loadTerminalEvent, reconcileChildWaitWith } from "./store-child-settlement.js"

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
type SuspendInput = Parameters<import("../run-store.js").Interface["suspend"]>[0]

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
        { _tag: "RunCancellationRequested", ...(reason === undefined ? {} : { reason }) },
        needsResolution ? "needs-resolution" : "cancelling",
      )
      current = (yield* loadRun(run.runId))!
    }
    if (!terminal) yield* reconcileProgramCancellation(run.runId, reason ?? current.cancelReason)
    yield* sql`UPDATE baton_external_child_placements SET cancel_requested = 1
      WHERE parent_run_id = ${run.runId} AND settlement_id IS NULL`
    yield* sql`
      UPDATE baton_run_waits SET status = 'cancelled', closed_at = ${yield* nowIso}
      WHERE run_id = ${run.runId} AND status = 'open'
    `
    const linked = yield* sql<{ child_run_id: string }>`
      SELECT l.child_run_id FROM baton_run_links l
      LEFT JOIN baton_fan_out_members m ON m.child_run_id = l.child_run_id
      WHERE l.parent_run_id = ${run.runId} AND m.child_run_id IS NULL
      ORDER BY l.child_run_id ASC
    `
    for (const link of linked) {
      const child = yield* loadRun(link.child_run_id)
      if (child !== undefined && !isTerminal(child.status)) yield* cancelRun(hub, child, reason ?? "parent cancelled")
    }
    if (linked.length > 0) current = (yield* loadRun(run.runId))!
    const owned = yield* sql<{ fan_out_id: string; child_run_id: string }>`
      SELECT f.fan_out_id, m.child_run_id
      FROM baton_fan_outs f JOIN baton_fan_out_members m ON m.fan_out_id = f.fan_out_id
      WHERE f.parent_run_id = ${run.runId} AND f.status = 'running'
      ORDER BY m.ordinal ASC
    `
    if (owned.length > 0) {
      for (const member of owned) {
        const child = yield* loadRun(member.child_run_id)
        if (child !== undefined && !isTerminal(child.status)) yield* cancelRun(hub, child, reason ?? "parent cancelled")
      }
      current = (yield* loadRun(run.runId))!
    }
    if (terminal) return
    if (executing) return
    if (isTerminal(current.status)) return
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) return
    if (yield* hasUnsettledChild(run.runId)) return
    const event = yield* appendEvent(
      hub,
      current,
      { _tag: "RunCancelled", ...(reason === undefined ? {} : { reason }) },
      "cancelled",
    )
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  })

export const respond: {
  (hub: EventHub, input: RespondInput): ConflictEffect
  (input: RespondInput): (hub: EventHub) => ConflictEffect
} = (hubOrInput: EventHub | RespondInput, maybeInput?: RespondInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => respond(hub, hubOrInput as RespondInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
  return Effect.gen(function* () {
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
      UPDATE baton_run_waits SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${updated}
      WHERE run_id = ${run.runId} AND wait_id = ${input.waitId} AND status = 'open'
    `
    yield* sql`
      UPDATE baton_runs SET responded_wait_ids_json = ${encodeJson(StringArray, responded)}, updated_at = ${updated}
      WHERE run_id = ${run.runId}
    `
    yield* sql`
      UPDATE baton_program_operations SET status = 'reserved'
      WHERE run_id = ${run.runId} AND wait_id = ${input.waitId} AND status = 'waiting'
    `
    const current = (yield* loadRun(run.runId))!
    yield* appendEvent(hub, current, { _tag: "RunResumed", waitId: input.waitId, resolution }, "running")
  })
}

export const respondApproval: {
  (hub: EventHub, input: RespondApprovalInput): ApprovalEffect
  (input: RespondApprovalInput): (hub: EventHub) => ApprovalEffect
} = (hubOrInput: EventHub | RespondApprovalInput, maybeInput?: RespondApprovalInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => respondApproval(hub, hubOrInput as RespondApprovalInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
  return approvalResponse(input).pipe(
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
  )
}
export const signal: {
  (hub: EventHub, input: SignalInput): UndefinedEffect
  (input: SignalInput): (hub: EventHub) => UndefinedEffect
} = (hubOrInput: EventHub | SignalInput, maybeInput?: SignalInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => signal(hub, hubOrInput as SignalInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) return
    if (run.activeWaitId === undefined) return
    if (run.activeWaitId !== input.name) return
    const updated = yield* nowIso
    const resolution: WaitResolution = {
      _tag: "Signal",
      name: input.name,
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    }
    yield* sql`
      UPDATE baton_run_waits SET status = 'signaled', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${updated}
      WHERE run_id = ${run.runId} AND wait_id = ${run.activeWaitId} AND status = 'open'
    `
    yield* appendEvent(hub, run, { _tag: "RunResumed", waitId: run.activeWaitId, resolution }, "running")
  })
}
export const cancel: {
  (hub: EventHub, input: CancelInput): VoidEffect
  (input: CancelInput): (hub: EventHub) => VoidEffect
} = (hubOrInput: EventHub | CancelInput, maybeInput?: CancelInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => cancel(hub, hubOrInput as CancelInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
  return Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    yield* cancelRun(hub, run, input.reason)
  })
}
/** Settle a cancellation that was admitted while an unknown operation still needed resolution. */
export const settleAdmittedCancellation: {
  (hub: EventHub, runId: string): VoidEffect
  (runId: string): (hub: EventHub) => VoidEffect
} = (hubOrRunId: EventHub | string, maybeRunId?: string): any => {
  if (maybeRunId === undefined) return (hub: EventHub) => settleAdmittedCancellation(hub, hubOrRunId as string)
  const hub = hubOrRunId as EventHub
  const runId = maybeRunId as string
  return Effect.gen(function* () {
    const run = yield* loadRun(runId)
    if (run === undefined || !run.cancellationRequested || isTerminal(run.status)) return
    yield* cancelRun(hub, run, run.cancelReason)
  })
}
export const complete: {
  (hub: EventHub, input: CompleteInput): UndefinedEffect
  (input: CompleteInput): (hub: EventHub) => UndefinedEffect
} = (hubOrInput: EventHub | CompleteInput, maybeInput?: CompleteInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => complete(hub, hubOrInput as CompleteInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      const running = yield* sql<{ fan_out_id: string }>`
        SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
      `
      if (running.length > 0 || (yield* hasUnsettledChild(run.runId))) {
        yield* sql`UPDATE baton_runs SET owner_worker_id = NULL WHERE run_id = ${run.runId}`
        return
      }
      const event = yield* appendEvent(
        hub,
        run,
        { _tag: "RunCancelled", ...(run.cancelReason === undefined ? {} : { reason: run.cancelReason }) },
        "cancelled",
      )
      const settled = (yield* loadRun(run.runId))!
      yield* settleParent(hub, settled, event.eventId)
      yield* afterTerminal(hub, settled)
      return
    }
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) {
      yield* sql`
        UPDATE baton_runs SET status = 'waiting', owner_worker_id = NULL, suspension_json = NULL,
          pending_outcome_json = ${encodeJson(PendingRunOutcome, { _tag: "Completed", result: input.result })}
        WHERE run_id = ${run.runId}
      `
      return
    }
    const event = yield* appendEvent(hub, run, { _tag: "RunCompleted", result: input.result }, "succeeded")
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  })
}
export const fail: {
  (hub: EventHub, input: FailInput): UndefinedEffect
  (input: FailInput): (hub: EventHub) => UndefinedEffect
} = (hubOrInput: EventHub | FailInput, maybeInput?: FailInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => fail(hub, hubOrInput as FailInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      const running = yield* sql<{ fan_out_id: string }>`
        SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
      `
      if (running.length > 0 || (yield* hasUnsettledChild(run.runId))) {
        yield* sql`UPDATE baton_runs SET owner_worker_id = NULL WHERE run_id = ${run.runId}`
        return
      }
      const event = yield* appendEvent(
        hub,
        run,
        { _tag: "RunCancelled", ...(run.cancelReason === undefined ? {} : { reason: run.cancelReason }) },
        "cancelled",
      )
      const settled = (yield* loadRun(run.runId))!
      yield* settleParent(hub, settled, event.eventId)
      yield* afterTerminal(hub, settled)
      return
    }
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) {
      yield* sql`
        UPDATE baton_runs SET status = 'waiting', owner_worker_id = NULL, suspension_json = NULL,
          pending_outcome_json = ${encodeJson(PendingRunOutcome, { _tag: "Failed", error: input.error })}
        WHERE run_id = ${run.runId}
      `
      return
    }
    const event = yield* appendEvent(hub, run, { _tag: "RunFailed", error: input.error }, "failed")
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  })
}
export const suspend: {
  (hub: EventHub, input: SuspendInput): UndefinedEffect
  (input: SuspendInput): (hub: EventHub) => UndefinedEffect
} = (hubOrInput: EventHub | SuspendInput, maybeInput?: SuspendInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => suspend(hub, hubOrInput as SuspendInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
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
      UPDATE baton_runs SET
        driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)}, driver_checkpoint_json),
        executable_ref_json = ${encodeExecutableRef(executableRef)},
        suspension_json = ${encodeJson(ExecutionSuspension, input.suspension)},
        continuation_json = CASE WHEN ${input.continuation === undefined ? 0 : 1} = 1
          THEN ${input.continuation === null || input.continuation === undefined ? null : encodeContinuation(input.continuation)}
          ELSE continuation_json END,
        updated_at = ${opened}
      WHERE run_id = ${input.runId}
    `
    yield* sql`
      INSERT INTO baton_run_waits (run_id, wait_id, reason, status, response_json, opened_at, closed_at)
      VALUES (${run.runId}, ${input.wait.waitId}, ${encodeReason(input.wait.reason)}, 'open', NULL, ${opened}, NULL)
      ON CONFLICT(run_id, wait_id) DO UPDATE SET
        status = 'open',
        reason = excluded.reason,
        opened_at = excluded.opened_at,
        closed_at = NULL
    `
    yield* appendEvent(hub, run, { _tag: "RunWaiting", wait: { ...input.wait, openedAt: opened } }, "waiting")
    const child = typeof input.suspension.token === "string" ? yield* loadRun(input.suspension.token) : undefined
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
        SELECT parent_run_id, status FROM baton_fan_outs WHERE fan_out_id = ${groupId}
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
          UPDATE baton_run_waits SET status = 'signaled', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${closed}
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
    yield* sql`UPDATE baton_runs SET owner_worker_id = NULL WHERE run_id = ${run.runId}`
  })
}
export const resume: {
  (hub: EventHub, input: ResumeInput): ResumeEffect
  (input: ResumeInput): (hub: EventHub) => ResumeEffect
} = (hubOrInput: EventHub | ResumeInput, maybeInput?: ResumeInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => resume(hub, hubOrInput as ResumeInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
  return Effect.gen(function* () {
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
      UPDATE baton_run_waits SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${updated}
      WHERE run_id = ${run.runId} AND wait_id = ${input.waitId} AND status = 'open'
    `
    yield* sql`
      UPDATE baton_runs SET responded_wait_ids_json = ${encodeJson(StringArray, responded)}, updated_at = ${updated}
      WHERE run_id = ${run.runId}
    `
    const current = (yield* loadRun(run.runId))!
    yield* appendEvent(hub, current, { _tag: "RunResumed", waitId: input.waitId, resolution }, "running")
  })
}
export const emitAgentEvent: {
  (hub: EventHub, input: AgentEventInput): UndefinedEffect
  (input: AgentEventInput): (hub: EventHub) => UndefinedEffect
} = (hubOrInput: EventHub | AgentEventInput, maybeInput?: AgentEventInput): any => {
  if (maybeInput === undefined) return (hub: EventHub) => emitAgentEvent(hub, hubOrInput as AgentEventInput)
  const hub = hubOrInput as EventHub
  const input = maybeInput
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    yield* appendEvent(hub, run, input.event as { readonly _tag: string } & Record<string, unknown>)
    if (input.event._tag === "TurnCompleted") {
      yield* sql`
        UPDATE baton_runs SET continuation_json = NULL WHERE run_id = ${run.runId}
      `
    }
  })
}
