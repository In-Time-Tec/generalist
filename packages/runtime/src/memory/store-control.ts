/* oxlint-disable no-accumulating-spread */
import { DateTime, Effect, Equal, Option } from "effect"
import { ResponseConflict, RunNotFound, RunTerminal, RuntimeUnavailable, WaitNotOpen } from "../errors.js"
import { isTerminal } from "../run.js"
import type { CancelInput, RespondInput, SignalInput } from "../runtime.js"
import type { AgentLoopEvent, AgentResult } from "../agent-event.js"
import type { RunFailure } from "../run-event.js"
import type { RunWait, WaitResolution } from "../run-wait.js"
import {
  appendAgentEvent,
  appendLifecycle,
  makeCancellationRequested,
  makeCancelled,
  makeChildSettled,
  makeCompleted,
  makeFailed,
  makeResumed,
  makeUnknown,
  makeWaiting,
  rejectIfTerminal,
} from "./append.js"
import { afterTerminal } from "./lanes.js"
import type { MemoryState, StoredRun } from "./state.js"
import { reconcileFanOut } from "./store-fan-out.js"

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
    if (parent === undefined || isTerminal(parent.status)) return state
    const already = parent.events.some((event) => event._tag === "ChildSettled" && event.childRunId === child.runId)
    if (already) return state
    const [, next] = yield* appendLifecycle(state, parent.runId, makeChildSettled(child.runId, terminalEventId))
    return next
  })

const hasRunningOwnedFanOut = (state: MemoryState, runId: string): boolean =>
  [...state.fanOuts.values()].some((fanOut) => fanOut.parentRunId === runId && fanOut.status === "running")

const finalizeCancellingParent = (state: MemoryState, runId: string): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = state.runs.get(runId)
    if (
      run === undefined ||
      run.status !== "cancelling" ||
      run.ownerId !== undefined ||
      hasRunningOwnedFanOut(state, runId)
    ) {
      return state
    }
    const [event, cancelled] = yield* appendLifecycle(state, runId, makeCancelled(run.cancelReason), "cancelled")
    let next = cancelled
    const settled = next.runs.get(runId)!
    next = yield* settleParentChild(next, settled, event.eventId)
    next = yield* reconcileFanOut(next, settled, event)
    next = yield* afterTerminal(next, settled)
    return settled.parentRunId === undefined ? next : yield* finalizeCancellingParent(next, settled.parentRunId)
  })

export const respond = (
  state: MemoryState,
  input: RespondInput,
): Effect.Effect<MemoryState, RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.respondedWaitIds.has(input.waitId)) {
      if (run.wait?.resolution !== undefined && Equal.equals(run.wait.resolution, input.resolution)) return state
      return yield* ResponseConflict.make({ runId: run.runId, waitId: input.waitId })
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
    const withResponse: MemoryState = { ...state, runs }
    const [, resumed] = yield* appendLifecycle(
      withResponse,
      run.runId,
      makeResumed(input.waitId, resolution),
      "running",
    )
    return resumed
  })

export const signal = (
  state: MemoryState,
  input: SignalInput,
): Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
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
  })

export const cancel = (
  state: MemoryState,
  input: CancelInput,
): Effect.Effect<MemoryState, RunNotFound | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    if (isTerminal(run.status)) return state
    let next = state
    if (!run.cancellationRequested) {
      const [, requested] = yield* appendLifecycle(
        next,
        run.runId,
        makeCancellationRequested(input.reason),
        "cancelling",
      )
      next = requested
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
    if (run.ownerId !== undefined && (run.status === "running" || run.status === "cancelling")) return next
    const current = next.runs.get(run.runId)
    if (current === undefined || isTerminal(current.status) || hasRunningOwnedFanOut(next, run.runId)) return next
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
      next = yield* reconcileFanOut(next, settled, event)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
    }
    if (settled !== undefined) {
      next = yield* afterTerminal(next, settled)
    }
    return next
  })

export const complete = (
  state: MemoryState,
  input: { readonly runId: string; readonly result: AgentResult },
): Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.cancellationRequested) {
      if (hasRunningOwnedFanOut(state, run.runId)) {
        const runs = new Map(state.runs)
        const { ownerId: _, ...released } = run
        runs.set(run.runId, released)
        return { ...state, runs }
      }
      const [event, cancelled] = yield* appendLifecycle(state, run.runId, makeCancelled(run.cancelReason), "cancelled")
      let next = cancelled
      const settled = next.runs.get(run.runId)!
      next = yield* settleParentChild(next, settled, event.eventId)
      next = yield* reconcileFanOut(next, settled, event)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
      return yield* afterTerminal(next, settled)
    }
    const [event, completed] = yield* appendLifecycle(state, run.runId, makeCompleted(input.result), "succeeded")
    let next = completed
    const settled = next.runs.get(run.runId)
    if (settled !== undefined) {
      next = yield* settleParentChild(next, settled, event.eventId)
      next = yield* reconcileFanOut(next, settled, event)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
      next = yield* afterTerminal(next, settled)
    }
    return next
  })

export const fail = (
  state: MemoryState,
  input: { readonly runId: string; readonly error: RunFailure },
): Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.cancellationRequested) {
      if (hasRunningOwnedFanOut(state, run.runId)) {
        const runs = new Map(state.runs)
        const { ownerId: _, ...released } = run
        runs.set(run.runId, released)
        return { ...state, runs }
      }
      const [event, cancelled] = yield* appendLifecycle(state, run.runId, makeCancelled(run.cancelReason), "cancelled")
      let next = cancelled
      const settled = next.runs.get(run.runId)!
      next = yield* settleParentChild(next, settled, event.eventId)
      next = yield* reconcileFanOut(next, settled, event)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
      return yield* afterTerminal(next, settled)
    }
    const [event, failed] = yield* appendLifecycle(state, run.runId, makeFailed(input.error), "failed")
    let next = failed
    const settled = next.runs.get(run.runId)
    if (settled !== undefined) {
      next = yield* settleParentChild(next, settled, event.eventId)
      next = yield* reconcileFanOut(next, settled, event)
      if (settled.parentRunId !== undefined) next = yield* finalizeCancellingParent(next, settled.parentRunId)
      next = yield* afterTerminal(next, settled)
    }
    return next
  })

export const wait = (
  state: MemoryState,
  input: { readonly runId: string; readonly wait: RunWait },
): Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const runs = new Map(state.runs)
    runs.set(run.runId, { ...run, wait: input.wait })
    const [, next] = yield* appendLifecycle({ ...state, runs }, run.runId, makeWaiting(input.wait), "waiting")
    return next
  })

export const resume = (
  state: MemoryState,
  input: { readonly runId: string; readonly waitId: string },
): Effect.Effect<MemoryState, RunNotFound | WaitNotOpen | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.activeWaitId !== input.waitId) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const resolution = run.wait?.resolution
    if (resolution === undefined) return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    const [, next] = yield* appendLifecycle(state, run.runId, makeResumed(input.waitId, resolution), "running")
    return next
  })

export const emitAgentEvent = (
  state: MemoryState,
  input: { readonly runId: string; readonly event: AgentLoopEvent },
): Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const [, next] = yield* appendAgentEvent(state, run.runId, input.event)
    if (input.event._tag !== "TurnCompleted") return next
    const runs = new Map(next.runs)
    const { continuation: _, ...withoutContinuation } = next.runs.get(run.runId)!
    runs.set(run.runId, { ...withoutContinuation, transcript: input.event.transcript })
    return { ...next, runs }
  })

export const markOperationUnknown = (
  state: MemoryState,
  input: { readonly runId: string; readonly operationId: string },
): Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const [, next] = yield* appendLifecycle(state, run.runId, makeUnknown(input.operationId), "needs-resolution")
    return next
  })
