/* oxlint-disable no-accumulating-spread */
import { DateTime, Effect, Equal, Function, Option } from "effect"
import { ResponseConflict, RunNotFound, RunTerminal, RuntimeUnavailable, WaitNotOpen } from "../errors.js"
import { isTerminal } from "../run.js"
import type { CancelInput, RespondInput, SignalInput } from "../runtime.js"
import type { EmittableAgentLoopEvent } from "../agent-event.js"
import type { ExecutionResult } from "../execution-state.js"
import type { RunFailure } from "../run-event.js"
import type { RunWait, WaitResolution } from "../run-wait.js"
import { checkpointRef } from "../executable-manifest.js"
import {
  appendAgentEvent,
  appendLifecycle,
  makeCancellationRequested,
  makeCancelled,
  makeChildSettled,
  makeCompleted,
  makeFailed,
  makeAttemptStarted,
  makeResumed,
  makeWaiting,
  rejectIfTerminal,
} from "./append.js"
import { afterTerminal } from "./lanes.js"
import type { MemoryState, StoredRun } from "./state.js"
import { reconcileFanOut } from "./store-fan-out.js"
import { ProgramCapabilities } from "@batonfx/core"
import { groupIdFromSuspension, resultFromInspection } from "../child-group.js"
import { admitChildSettlement } from "./store-directory.js"

type RespondResult = Effect.Effect<
  MemoryState,
  RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable
>
type SignalResult = Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable>
type CancelResult = Effect.Effect<MemoryState, RunNotFound | RuntimeUnavailable>
type SuspendInput = import("../run-store.js").ExecutionClaim & {
  readonly wait: RunWait
  readonly suspension: import("../execution-state.js").ExecutionSuspension
  readonly checkpoint?: import("../execution-state.js").ExecutionCheckpoint
  readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
  readonly continuation?: import("../steering.js").ExecutionContinuation | null
}
type ResumeInput = { readonly runId: string; readonly waitId: string; readonly resolution: WaitResolution }
type ResumeResult = Effect.Effect<MemoryState, RunNotFound | WaitNotOpen | RunTerminal | RuntimeUnavailable>

const getRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const settleParentChild = (
  state: MemoryState,
  child: StoredRun,
  terminalEventId: string,
): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    if (child.parentRunId === undefined) return state
    const parent = state.runs.get(child.parentRunId)
    if (parent === undefined) return state
    const terminalEvent = child.events.find((event) => event.eventId === terminalEventId)
    const notified =
      terminalEvent === undefined ? state : yield* admitChildSettlement(state, { parent, child, event: terminalEvent })
    if (isTerminal(parent.status)) return notified
    const already = parent.events.some((event) => event._tag === "ChildSettled" && event.childRunId === child.runId)
    if (already) return notified
    const [, next] = yield* appendLifecycle(notified, parent.runId, makeChildSettled(child.runId, terminalEventId))
    const currentParent = next.runs.get(parent.runId)
    if (currentParent?.status !== "queued" || hasUnsettledChild(next, parent.runId)) return next
    const [, started] = yield* appendLifecycle(
      next,
      parent.runId,
      makeAttemptStarted(currentParent.attempt + 1),
      "running",
    )
    return started
  })

const hasRunningOwnedFanOut = (state: MemoryState, runId: string): boolean =>
  [...state.fanOuts.values()].some((fanOut) => fanOut.parentRunId === runId && fanOut.status === "running")

/** A Run stays non-terminal while it still owns unsettled work. */
const hasUnsettledChild = (state: MemoryState, runId: string): boolean => {
  const run = state.runs.get(runId)
  if (run === undefined) return false
  return run.children.some((childRunId) => {
    const child = state.runs.get(childRunId)
    return child !== undefined && !isTerminal(child.status)
  })
}

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
      hasUnsettledChild(state, runId)
    ) {
      return state
    }
    const reconciled = reconcileProgramCancellation(state, runId, run.cancelReason)
    const [event, cancelled] = yield* appendLifecycle(reconciled, runId, makeCancelled(run.cancelReason), "cancelled")
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
        ? yield* appendLifecycle(state, run.runId, makeCompleted(pending.result), "succeeded")
        : yield* appendLifecycle(state, run.runId, makeFailed(pending.error), "failed")
    let next = terminal
    const settled = next.runs.get(run.runId)!
    next = yield* settleParentChild(next, settled, event.eventId)
    next = yield* reconcileFanOut(next, settled, event, settlePendingOutcome)
    if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
    return yield* afterTerminal(next, settled)
  })

export const respond: {
  (input: RespondInput): (state: MemoryState) => RespondResult
  (state: MemoryState, input: RespondInput): RespondResult
} = Function.dual(2, (state: MemoryState, input: RespondInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.respondedWaitIds.has(input.waitId)) {
      if (run.wait?.resolution !== undefined && Equal.equals(run.wait.resolution, input.resolution)) return state
      return yield* ResponseConflict.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.cancellationRequested) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.activeWaitId !== input.waitId) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const responded = new Set(run.respondedWaitIds)
    responded.add(input.waitId)
    const runs = new Map(state.runs)
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const resolution: WaitResolution = input.resolution
    runs.set(run.runId, {
      ...run,
      respondedWaitIds: responded,
      wait: { ...run.wait!, status: "responded", resolution, closedAt },
    })
    const programOperations = new Map(state.programOperations)
    for (const [key, operation] of programOperations) {
      if (operation.runId === run.runId && operation.waitId === input.waitId && operation.status === "waiting") {
        programOperations.set(key, { ...operation, status: "reserved" })
      }
    }
    const withResponse: MemoryState = { ...state, runs, programOperations }
    const [, resumed] = yield* appendLifecycle(
      withResponse,
      run.runId,
      makeResumed(input.waitId, resolution),
      "running",
    )
    return resumed
  }),
)

export const signal: {
  (input: SignalInput): (state: MemoryState) => SignalResult
  (state: MemoryState, input: SignalInput): SignalResult
} = Function.dual(2, (state: MemoryState, input: SignalInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.cancellationRequested) return state
    if (run.activeWaitId === undefined) return state
    if (run.activeWaitId !== input.name) {
      return state
    }
    const waitId = run.activeWaitId
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const resolution: WaitResolution = {
      _tag: "Signal",
      name: input.name,
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    }
    const runs = new Map(state.runs)
    runs.set(run.runId, { ...run, wait: { ...run.wait!, status: "signaled", resolution, closedAt } })
    const [, resumed] = yield* appendLifecycle(
      { ...state, runs },
      run.runId,
      makeResumed(waitId, resolution),
      "running",
    )
    return resumed
  }),
)

export const cancel: {
  (input: CancelInput): (state: MemoryState) => CancelResult
  (state: MemoryState, input: CancelInput): CancelResult
} = Function.dual(2, (state: MemoryState, input: CancelInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = isTerminal(run.status)
    const needsResolution = run.status === "needs-resolution"
    let next = state
    if (!terminal && !run.cancellationRequested) {
      const [, requested] = yield* appendLifecycle(
        next,
        run.runId,
        makeCancellationRequested(input.reason),
        needsResolution ? "needs-resolution" : "cancelling",
      )
      next = requested
    }
    if (!terminal) next = reconcileProgramCancellation(next, run.runId, input.reason ?? run.cancelReason)
    for (const childRunId of run.children) {
      const fanOutChild = [...next.fanOuts.values()].some((fanOut) =>
        fanOut.members.some((member) => member.childRunId === childRunId),
      )
      if (fanOutChild) continue
      const child = next.runs.get(childRunId)
      if (child !== undefined && !isTerminal(child.status)) {
        next = yield* cancel(next, { runId: childRunId, reason: input.reason ?? "parent cancelled" })
      }
    }
    for (const fanOut of next.fanOuts.values()) {
      if (fanOut.parentRunId !== run.runId || fanOut.status !== "running") continue
      for (const member of fanOut.members) {
        if (member.status === "abandoned") continue
        const child = next.runs.get(member.childRunId)
        if (child !== undefined && !isTerminal(child.status)) {
          next = yield* cancel(next, { runId: child.runId, reason: input.reason ?? "parent cancelled" })
        }
      }
    }
    if (terminal || needsResolution) return next
    if (run.ownerId !== undefined && (run.status === "running" || run.status === "cancelling")) return next
    const current = next.runs.get(run.runId)
    if (
      current === undefined ||
      isTerminal(current.status) ||
      hasRunningOwnedFanOut(next, run.runId) ||
      hasUnsettledChild(next, run.runId)
    ) {
      return next
    }
    const [event, cancelled] = yield* appendLifecycle(
      next,
      run.runId,
      makeCancelled(input.reason ?? current.cancelReason),
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
      if (hasRunningOwnedFanOut(state, run.runId) || hasUnsettledChild(state, run.runId)) {
        const runs = new Map(state.runs)
        const { ownerId: _, ...released } = run
        runs.set(run.runId, released)
        return { ...state, runs }
      }
      const reconciled = reconcileProgramCancellation(state, run.runId, run.cancelReason)
      const [event, cancelled] = yield* appendLifecycle(
        reconciled,
        run.runId,
        makeCancelled(run.cancelReason),
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
      const { ownerId: _, ...released } = run
      runs.set(run.runId, {
        ...released,
        status: "waiting",
        pendingOutcome: { _tag: "Completed", result: input.result },
      })
      return { ...state, runs }
    }
    const [event, completed] = yield* appendLifecycle(state, run.runId, makeCompleted(input.result), "succeeded")
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
      if (hasRunningOwnedFanOut(state, run.runId) || hasUnsettledChild(state, run.runId)) {
        const runs = new Map(state.runs)
        const { ownerId: _, ...released } = run
        runs.set(run.runId, released)
        return { ...state, runs }
      }
      const reconciled = reconcileProgramCancellation(state, run.runId, run.cancelReason)
      const [event, cancelled] = yield* appendLifecycle(
        reconciled,
        run.runId,
        makeCancelled(run.cancelReason),
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
      const { ownerId: _, continuation: __, ...released } = run
      runs.set(run.runId, { ...released, status: "waiting", pendingOutcome: { _tag: "Failed", error: input.error } })
      return { ...state, runs }
    }
    const [event, failed] = yield* appendLifecycle(state, run.runId, makeFailed(input.error), "failed")
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
    const updated = {
      ...run,
      executableRef,
      wait: input.wait,
      suspension: input.suspension,
      ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
      ...(input.continuation === undefined || input.continuation === null ? {} : { continuation: input.continuation }),
    }
    if (input.continuation === null) {
      const { continuation: _, ...withoutContinuation } = updated
      runs.set(run.runId, withoutContinuation)
    } else runs.set(run.runId, updated)
    const [, next] = yield* appendLifecycle({ ...state, runs }, run.runId, makeWaiting(input.wait), "waiting")
    const waitingRuns = new Map(next.runs)
    const { ownerId: _, ...waiting } = waitingRuns.get(run.runId)!
    waitingRuns.set(run.runId, waiting)
    const released = { ...next, runs: waitingRuns }
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
      makeResumed(input.wait.waitId, resolution),
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
      makeResumed(input.waitId, input.resolution),
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
