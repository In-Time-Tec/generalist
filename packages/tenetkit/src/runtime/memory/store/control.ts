/* oxlint-disable no-accumulating-spread */
import { DateTime, Effect, Function, Option } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable, WaitNotOpen } from "../../errors.js"
import { isTerminal } from "../../run.js"
import type { CancelInput } from "../../service.js"
import type { EmittableAgentLoopEvent } from "../../execution/agent/event.js"
import type { ExecutionResult } from "../../execution/state.js"
import type { RunFailure } from "../../run/event.js"
import type { RunWait, WaitResolution } from "../../run/wait.js"
import { checkpointRef } from "../../executable/manifest.js"
import {
  appendAgentEvent,
  appendLifecycle,
  cancellationRequestedEvent,
  cancelledEvent,
  completedEvent,
  failedEvent,
  resumedEvent,
  waitingEvent,
  rejectIfTerminal,
} from "../append.js"
import { afterTerminal } from "../lanes.js"
import type { MemoryState, StoredRun } from "../state.js"
import { reconcileFanOut } from "./fan-out/service.js"
import { ProgramCapabilities } from "../../../core/index.js"
import { groupIdFromSuspension, resultFromInspection } from "../../child/group.js"
import { hasUnsettledChild, reconcileChildWait, settleParentChild } from "./child/settlement.js"
import { hasPendingOperationCancellation, markOperationCancellations } from "./operation/cancellation.js"

type SignalResult = Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable>
type CancelResult = Effect.Effect<MemoryState, RunNotFound | RuntimeUnavailable>
type SuspendInput = import("../../run/store.js").ExecutionClaim & {
  readonly wait: RunWait
  readonly suspension: import("../../execution/state.js").ExecutionSuspension
  readonly checkpoint?: import("../../execution/state.js").ExecutionCheckpoint
  readonly continuation?: import("../../run/steering.js").ExecutionContinuation | null
}
type ResumeInput = { readonly runId: string; readonly waitId: string; readonly resolution: WaitResolution }
type ResumeResult = Effect.Effect<MemoryState, RunNotFound | WaitNotOpen | RunTerminal | RuntimeUnavailable>

const getRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const hasRunningOwnedFanOut = (state: MemoryState, runId: string): boolean =>
  [...state.fanOuts.values()].some((fanOut) => fanOut.parentRunId === runId && fanOut.status === "running")

const reconcileProgramCancellation = (state: MemoryState, runId: string, reason?: string): MemoryState => {
  const programOperations = new Map(state.programOperations)
  const failure = ProgramCapabilities.ProgramCancelled.make({ reason: reason ?? "Program Run cancelled" })
  for (const [key, operation] of programOperations) {
    if (operation.runId === runId && ["reserved", "running", "waiting"].includes(operation.status)) {
      programOperations.set(key, { ...operation, status: "failed", error: failure })
    }
  }
  const programStates = new Map(state.programStates)
  const programState = programStates.get(runId)
  if (programState !== undefined) programStates.set(runId, { ...programState, activeSlots: 0 })
  const runs = new Map(state.runs)
  const run = runs.get(runId)
  if (run?.wait?.status === "open") {
    runs.set(runId, { ...run, wait: { ...run.wait, status: "cancelled" } })
  }
  return { ...state, runs, programOperations, programStates }
}

const finalizeCancellingParent = (state: MemoryState, runId: string): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = state.runs.get(runId)
    if (
      run === undefined ||
      run.status !== "cancelling" ||
      run.ownerId !== undefined ||
      hasRunningOwnedFanOut(state, runId) ||
      hasPendingOperationCancellation(state, runId) ||
      hasUnsettledChild(state, runId)
    ) {
      return state
    }
    const reconciled = reconcileProgramCancellation(state, runId, run.cancelReason)
    const [event, cancelled] = yield* appendLifecycle(reconciled, runId, cancelledEvent(run.cancelReason), "cancelled")
    let next = cancelled
    const settled = next.runs.get(runId)!
    next = yield* settleParentChild(next, settled, event.eventId)
    next = yield* reconcileFanOut(next, settled, event, settlePendingOutcome)
    next = yield* afterTerminal(next, settled)
    return settled.parentRunId === undefined ? next : yield* finalizeCancellingParent(next, settled.parentRunId)
  })

const settlePendingOutcome = (state: MemoryState, run: StoredRun): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    if (run.pendingOutcome === undefined || isTerminal(run.status)) return state
    const pending = run.pendingOutcome
    const [event, terminal] =
      pending._tag === "Completed"
        ? yield* appendLifecycle(state, run.runId, completedEvent(pending.result), "succeeded")
        : yield* appendLifecycle(state, run.runId, failedEvent(pending.error), "failed")
    let next = terminal
    const settled = next.runs.get(run.runId)!
    next = yield* settleParentChild(next, settled, event.eventId)
    next = yield* reconcileFanOut(next, settled, event, settlePendingOutcome)
    if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
    return yield* afterTerminal(next, settled)
  })

const requestExternalChildCancellation = (state: MemoryState, runId: string): MemoryState => {
  const externalChildPlacements = new Map(state.externalChildPlacements)
  for (const [placementId, placement] of externalChildPlacements) {
    if (placement.parentRunId === runId && !placement.settled && !placement.cancelRequested) {
      externalChildPlacements.set(placementId, { ...placement, cancelRequested: true })
    }
  }
  return { ...state, externalChildPlacements }
}

const cancelDescendants = (state: MemoryState, run: StoredRun, reason?: string): CancelResult =>
  Effect.gen(function* () {
    let next = state
    const fanOutChildren = new Set(
      [...next.fanOuts.values()].flatMap((fanOut) => fanOut.members.map((member) => member.childRunId)),
    )
    for (const childRunId of run.children) {
      if (fanOutChildren.has(childRunId)) continue
      const child = next.runs.get(childRunId)
      if (child !== undefined && !isTerminal(child.status)) {
        next = yield* cancel(next, { runId: childRunId, reason: reason ?? "parent cancelled" })
      }
    }
    for (const fanOut of next.fanOuts.values()) {
      if (fanOut.parentRunId !== run.runId || fanOut.status !== "running") continue
      for (const member of fanOut.members) {
        if (member.status === "abandoned") continue
        const child = next.runs.get(member.childRunId)
        if (child !== undefined && !isTerminal(child.status)) {
          next = yield* cancel(next, { runId: child.runId, reason: reason ?? "parent cancelled" })
        }
      }
    }
    return next
  })

const cancellationMustWait = (state: MemoryState, run: StoredRun): boolean =>
  hasRunningOwnedFanOut(state, run.runId) ||
  hasPendingOperationCancellation(state, run.runId) ||
  hasUnsettledChild(state, run.runId)

const completeCancellation = (state: MemoryState, run: StoredRun): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    if (cancellationMustWait(state, run)) {
      const runs = new Map(state.runs)
      const { ownerId: _, ...released } = run
      runs.set(run.runId, released)
      return { ...state, runs }
    }
    const reconciled = reconcileProgramCancellation(state, run.runId, run.cancelReason)
    const [event, cancelled] = yield* appendLifecycle(
      reconciled,
      run.runId,
      cancelledEvent(run.cancelReason),
      "cancelled",
    )
    let next = cancelled
    const settled = next.runs.get(run.runId)!
    next = yield* settleParentChild(next, settled, event.eventId)
    next = yield* reconcileFanOut(next, settled, event, settlePendingOutcome)
    if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
    return yield* afterTerminal(next, settled)
  })

const ownerStillControlsCancellation = (run: StoredRun): boolean =>
  run.ownerId !== undefined && (run.status === "running" || run.status === "cancelling")

const cancellationStopsBeforeFinalize = (run: StoredRun, terminal: boolean): boolean =>
  terminal || ownerStillControlsCancellation(run)

const cancellationCannotFinalize = (state: MemoryState, run: StoredRun, runId: string): boolean =>
  isTerminal(run.status) ||
  hasRunningOwnedFanOut(state, runId) ||
  hasPendingOperationCancellation(state, runId) ||
  hasUnsettledChild(state, runId)

export { respond, signal } from "./control/wait.js"

export const cancel: {
  (input: CancelInput): (state: MemoryState) => CancelResult
  (state: MemoryState, input: CancelInput): CancelResult
} = Function.dual(2, (state: MemoryState, input: CancelInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = isTerminal(run.status)
    const needsResolution = run.status === "needs-resolution"
    let next = requestExternalChildCancellation(state, run.runId)
    if (!terminal && !run.cancellationRequested) {
      const [, requested] = yield* appendLifecycle(
        next,
        run.runId,
        cancellationRequestedEvent(input.reason),
        needsResolution ? "needs-resolution" : "cancelling",
      )
      next = requested
    }
    if (!terminal) next = markOperationCancellations(next, run.runId)
    if (!terminal) next = reconcileProgramCancellation(next, run.runId, input.reason ?? run.cancelReason)
    next = yield* cancelDescendants(next, run, input.reason)
    if (cancellationStopsBeforeFinalize(run, terminal)) return next
    const current = next.runs.get(run.runId)
    if (current === undefined) return next
    if (cancellationCannotFinalize(next, current, run.runId)) return next
    const [event, cancelled] = yield* appendLifecycle(
      next,
      run.runId,
      cancelledEvent(input.reason ?? current.cancelReason),
      "cancelled",
    )
    next = cancelled
    const settled = next.runs.get(run.runId)
    if (settled?.terminalEventId !== undefined) {
      next = yield* settleParentChild(next, settled, settled.terminalEventId)
      next = yield* reconcileFanOut(next, settled, event, settlePendingOutcome)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
    }
    if (settled !== undefined) {
      next = yield* afterTerminal(next, settled)
    }
    return next
  }),
)

export const complete: {
  (input: { readonly runId: string; readonly result: ExecutionResult }): (state: MemoryState) => SignalResult
  (state: MemoryState, input: { readonly runId: string; readonly result: ExecutionResult }): SignalResult
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly result: ExecutionResult }) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.cancellationRequested) {
      return yield* completeCancellation(state, run)
    }
    if (hasRunningOwnedFanOut(state, run.runId)) {
      const runs = new Map(state.runs)
      const { ownerId: _, suspension: __, ...released } = run
      runs.set(run.runId, {
        ...released,
        status: "waiting",
        pendingOutcome: { _tag: "Completed", result: input.result },
      })
      return { ...state, runs }
    }
    const [event, completed] = yield* appendLifecycle(state, run.runId, completedEvent(input.result), "succeeded")
    let next = completed
    const settled = next.runs.get(run.runId)
    if (settled !== undefined) {
      next = yield* settleParentChild(next, settled, event.eventId)
      next = yield* reconcileFanOut(next, settled, event, settlePendingOutcome)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
      next = yield* afterTerminal(next, settled)
    }
    return next
  }),
)

export const fail: {
  (input: { readonly runId: string; readonly error: RunFailure }): (state: MemoryState) => SignalResult
  (state: MemoryState, input: { readonly runId: string; readonly error: RunFailure }): SignalResult
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly error: RunFailure }) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.cancellationRequested) {
      if (
        hasRunningOwnedFanOut(state, run.runId) ||
        hasPendingOperationCancellation(state, run.runId) ||
        hasUnsettledChild(state, run.runId)
      ) {
        const runs = new Map(state.runs)
        const { ownerId: _, ...released } = run
        runs.set(run.runId, released)
        return { ...state, runs }
      }
      const reconciled = reconcileProgramCancellation(state, run.runId, run.cancelReason)
      const [event, cancelled] = yield* appendLifecycle(
        reconciled,
        run.runId,
        cancelledEvent(run.cancelReason),
        "cancelled",
      )
      let next = cancelled
      const settled = next.runs.get(run.runId)!
      next = yield* settleParentChild(next, settled, event.eventId)
      next = yield* reconcileFanOut(next, settled, event, settlePendingOutcome)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
      return yield* afterTerminal(next, settled)
    }
    if (hasRunningOwnedFanOut(state, run.runId)) {
      const runs = new Map(state.runs)
      const { ownerId: _, continuation: __, suspension: ___, ...released } = run
      runs.set(run.runId, { ...released, status: "waiting", pendingOutcome: { _tag: "Failed", error: input.error } })
      return { ...state, runs }
    }
    const [event, failed] = yield* appendLifecycle(state, run.runId, failedEvent(input.error), "failed")
    let next = failed
    const settled = next.runs.get(run.runId)
    if (settled !== undefined) {
      next = yield* settleParentChild(next, settled, event.eventId)
      next = yield* reconcileFanOut(next, settled, event, settlePendingOutcome)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
      next = yield* afterTerminal(next, settled)
    }
    return next
  }),
)

export const suspend: {
  (input: SuspendInput): (state: MemoryState) => SignalResult
  (state: MemoryState, input: SuspendInput): SignalResult
} = Function.dual(2, (state: MemoryState, input: SuspendInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const runs = new Map(state.runs)
    const { checkpoint: _previousCheckpoint, ...withoutCheckpoint } = run
    let updated: StoredRun = {
      ...withoutCheckpoint,
      executableRef,
      wait: input.wait,
      suspension: input.suspension,
    }
    if (input.checkpoint !== undefined) updated = { ...updated, checkpoint: input.checkpoint }
    if (input.continuation !== undefined && input.continuation !== null) {
      updated = { ...updated, continuation: input.continuation }
    }
    if (input.continuation === null) {
      const { continuation: _previousContinuation, ...withoutContinuation } = updated
      runs.set(run.runId, withoutContinuation)
    } else runs.set(run.runId, updated)
    const [, next] = yield* appendLifecycle({ ...state, runs }, run.runId, waitingEvent(input.wait), "waiting")
    const waitingRuns = new Map(next.runs)
    const { ownerId: _previousOwnerId, ...waiting } = waitingRuns.get(run.runId)!
    waitingRuns.set(run.runId, waiting)
    const released = { ...next, runs: waitingRuns }
    const child = Option.flatMap(Option.fromNullishOr(input.suspension.token), (token) =>
      Option.fromNullishOr(released.runs.get(token)),
    ).pipe(Option.getOrUndefined)
    const terminalEvent = child?.events.find(
      (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
    )
    if (child !== undefined && terminalEvent !== undefined) {
      const reconciled = yield* reconcileChildWait(released, released.runs.get(run.runId)!, child, terminalEvent)
      if (reconciled !== released) return reconciled
    }
    const groupId = groupIdFromSuspension(input.suspension)
    const group = groupId === undefined ? undefined : released.fanOuts.get(groupId)
    if (group === undefined || group.parentRunId !== run.runId || group.status === "running") return released
    const resolution = {
      _tag: "Signal" as const,
      name: input.wait.waitId,
      payload: resultFromInspection(group),
    }
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const resumedRuns = new Map(released.runs)
    resumedRuns.set(run.runId, {
      ...resumedRuns.get(run.runId)!,
      wait: { ...input.wait, status: "signaled", resolution, closedAt },
    })
    const [, resumed] = yield* appendLifecycle(
      { ...released, runs: resumedRuns },
      run.runId,
      resumedEvent(input.wait.waitId, resolution),
      "running",
    )
    return resumed
  }),
)

export const resume: {
  (input: ResumeInput): (state: MemoryState) => ResumeResult
  (state: MemoryState, input: ResumeInput): ResumeResult
} = Function.dual(2, (state: MemoryState, input: ResumeInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.cancellationRequested) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.activeWaitId !== input.waitId) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const runs = new Map(state.runs)
    runs.set(run.runId, {
      ...run,
      wait: { ...run.wait!, status: "responded", resolution: input.resolution, closedAt },
    })
    const [, next] = yield* appendLifecycle(
      { ...state, runs },
      run.runId,
      resumedEvent(input.waitId, input.resolution),
      "running",
    )
    return next
  }),
)

export const emitAgentEvent: {
  (input: { readonly runId: string; readonly event: EmittableAgentLoopEvent }): (state: MemoryState) => SignalResult
  (state: MemoryState, input: { readonly runId: string; readonly event: EmittableAgentLoopEvent }): SignalResult
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly event: EmittableAgentLoopEvent }) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const [, next] = yield* appendAgentEvent(state, run.runId, input.event)
    if (input.event._tag !== "TurnCompleted") return next
    const runs = new Map(next.runs)
    const { continuation: _, ...withoutContinuation } = next.runs.get(run.runId)!
    runs.set(run.runId, withoutContinuation)
    return { ...next, runs }
  }),
)
