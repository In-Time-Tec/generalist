import { Fiber, Option } from "effect"
import type { Prompt } from "effect/unstable/ai"
import type { SessionStatus } from "../transport/wire.js"

export interface PendingRun {
  readonly prompt: Prompt.RawInput
}

export interface CoordinationState {
  readonly status: SessionStatus
  readonly runFiber: Option.Option<Fiber.Fiber<void>>
  readonly interruptRequested: boolean
  readonly idleSince: Option.Option<number>
  readonly pendingRuns: ReadonlyArray<PendingRun>
  readonly runId: number
}

export type RunReservation =
  | { readonly _tag: "Busy" }
  | { readonly _tag: "Reserved"; readonly state: CoordinationState }

export type CoordinationSubmission = RunReservation | { readonly _tag: "Enqueued" } | { readonly _tag: "Full" }

export type InterruptAction =
  | { readonly _tag: "Ignore" }
  | { readonly _tag: "Requested" }
  | { readonly _tag: "Stop"; readonly fiber: Fiber.Fiber<void>; readonly runId: number }

export interface CloseOwnership {
  readonly runFiber: Option.Option<Fiber.Fiber<void>>
  readonly droppedRuns: number
}

const makeCoordination = (now: number): CoordinationState => ({
  status: { _tag: "Idle" },
  runFiber: Option.none(),
  interruptRequested: false,
  idleSince: Option.some(now),
  pendingRuns: [],
  runId: 0,
})

const reserve = (state: CoordinationState): CoordinationState => ({
  ...state,
  runId: state.runId + 1,
  status: { _tag: "Running", turn: 0 },
  runFiber: Option.none(),
  interruptRequested: false,
  idleSince: Option.none(),
})

const reserveCoordinationRun = (
  state: CoordinationState,
  resume: boolean,
): readonly [RunReservation, CoordinationState] => {
  if (state.status._tag === "Running" || (state.status._tag === "Suspended" && !resume)) {
    return [{ _tag: "Busy" }, state]
  }
  const updated = reserve(state)
  return [{ _tag: "Reserved", state: updated }, updated]
}

const submitRun = (
  state: CoordinationState,
  prompt: Prompt.RawInput,
  enqueue: boolean,
  capacity: number,
): readonly [CoordinationSubmission, CoordinationState] => {
  const busy = state.status._tag === "Running" || state.status._tag === "Suspended" || state.pendingRuns.length > 0
  if (!busy) {
    const updated = reserve(state)
    return [{ _tag: "Reserved", state: updated }, updated]
  }
  if (!enqueue) return [{ _tag: "Busy" }, state]
  if (state.pendingRuns.length >= capacity) return [{ _tag: "Full" }, state]
  return [{ _tag: "Enqueued" }, { ...state, pendingRuns: [...state.pendingRuns, { prompt }] }]
}

const reserveNextCoordinationRun = (
  state: CoordinationState,
  completedRunId: number,
): readonly [Option.Option<readonly [CoordinationState, PendingRun]>, CoordinationState] => {
  if (
    state.runId !== completedRunId ||
    state.status._tag === "Running" ||
    state.status._tag === "Suspended" ||
    state.pendingRuns.length === 0
  ) {
    return [Option.none(), state]
  }
  const [next, ...pendingRuns] = state.pendingRuns
  if (next === undefined) return [Option.none(), state]
  const updated = { ...reserve(state), pendingRuns }
  return [Option.some([updated, next] as const), updated]
}

const recordRunFiber = (
  state: CoordinationState,
  runId: number,
  fiber: Fiber.Fiber<void>,
): readonly [boolean, CoordinationState] => {
  if (state.runId !== runId || state.status._tag !== "Running") return [false, state]
  return [
    state.interruptRequested,
    { ...state, runFiber: Option.some(fiber), interruptRequested: false, idleSince: Option.none() },
  ]
}

const setCoordinationStatus = (
  state: CoordinationState,
  runId: number,
  status: SessionStatus,
  now: number,
): readonly [boolean, CoordinationState] => {
  if (state.runId !== runId || state.status._tag !== "Running") return [false, state]
  return [true, { ...state, status, idleSince: status._tag === "Running" ? Option.none() : Option.some(now) }]
}

const finalizeCoordinationRun = (
  state: CoordinationState,
  runId: number,
  status: SessionStatus,
  now: number,
): readonly [boolean, CoordinationState] => {
  if (state.runId !== runId || state.status._tag !== "Running") return [false, state]
  return [true, { ...state, status, runFiber: Option.none(), idleSince: Option.some(now) }]
}

const interruptRun = (state: CoordinationState): readonly [InterruptAction, CoordinationState] => {
  if (Option.isSome(state.runFiber)) {
    return [{ _tag: "Stop", fiber: state.runFiber.value, runId: state.runId }, state]
  }
  if (state.status._tag !== "Running") return [{ _tag: "Ignore" }, state]
  return [{ _tag: "Requested" }, { ...state, interruptRequested: true }]
}

const closeCoordination = (state: CoordinationState): CloseOwnership => ({
  runFiber: state.runFiber,
  droppedRuns: state.pendingRuns.length,
})

const isEvictable = (state: CoordinationState, now: number, idleTimeoutMillis: number): boolean =>
  state.status._tag !== "Running" &&
  state.pendingRuns.length === 0 &&
  Option.isSome(state.idleSince) &&
  now - state.idleSince.value >= idleTimeoutMillis

export const coordination = {
  close: closeCoordination,
  finalizeRun: finalizeCoordinationRun,
  interruptRun,
  isEvictable,
  make: makeCoordination,
  recordRunFiber,
  reserveNextRun: reserveNextCoordinationRun,
  reserveRun: reserveCoordinationRun,
  setStatus: setCoordinationStatus,
  submitRun,
}
