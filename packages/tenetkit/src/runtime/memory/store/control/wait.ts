import { DateTime, Effect, Equal, Function, Option } from "effect"
import { ResponseConflict, RunNotFound, RunTerminal, RuntimeUnavailable, WaitNotOpen } from "../../../errors.js"
import type { RespondInput, SignalInput } from "../../../service.js"
import type { RunWait, WaitResolution } from "../../../run/wait.js"
import { appendLifecycle, rejectIfTerminal, resumedEvent } from "../../append.js"
import { waitMapKey, type MemoryState, type StoredRun } from "../../state.js"

type RespondResult = Effect.Effect<
  MemoryState,
  RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable
>
type SignalResult = Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable>

const getRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

/** The one memory affected-row primitive for exact open -> terminal wait transitions. */
interface CloseWaitInput {
  readonly runId: string
  readonly waitId: string
  readonly status: Exclude<RunWait["status"], "open">
  readonly resolution?: WaitResolution
  readonly closedAt: string
}
interface CloseWaitResult {
  readonly state: MemoryState
  readonly affected: 0 | 1
}

export const closeWait: {
  (input: CloseWaitInput): (state: MemoryState) => CloseWaitResult
  (state: MemoryState, input: CloseWaitInput): CloseWaitResult
} = Function.dual(2, (state: MemoryState, input: CloseWaitInput): CloseWaitResult => {
  const key = waitMapKey(input.runId, input.waitId)
  const wait = state.waits.get(key)
  if (wait?.status !== "open") return { state, affected: 0 }
  const waits = new Map(state.waits)
  waits.set(
    key,
    Object.assign(
      { ...wait, status: input.status, closedAt: input.closedAt },
      input.resolution === undefined ? undefined : { resolution: input.resolution },
    ),
  )
  return { state: { ...state, waits }, affected: 1 }
})

export const respond: {
  (input: RespondInput): (state: MemoryState) => RespondResult
  (state: MemoryState, input: RespondInput): RespondResult
} = Function.dual(2, (state: MemoryState, input: RespondInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    if (run.cancellationRequested) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const prior = state.waits.get(waitMapKey(run.runId, input.waitId))
    if (prior !== undefined && prior.status !== "open") {
      if (prior.resolution !== undefined && Equal.equals(prior.resolution, input.resolution)) return state
      return yield* ResponseConflict.make({ runId: run.runId, waitId: input.waitId })
    }
    if (prior === undefined) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const resolution: WaitResolution = input.resolution
    const transitioned = closeWait(state, {
      runId: run.runId,
      waitId: input.waitId,
      status: "responded",
      resolution,
      closedAt,
    })
    if (transitioned.affected !== 1) return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    const programOperations = new Map(state.programOperations)
    for (const [key, operation] of programOperations) {
      if (operation.runId === run.runId && operation.waitId === input.waitId && operation.status === "waiting") {
        programOperations.set(key, { ...operation, status: "reserved" })
      }
    }
    const [, resumed] = yield* appendLifecycle(
      { ...transitioned.state, programOperations },
      run.runId,
      resumedEvent(input.waitId, resolution),
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
    const wait = state.waits.get(waitMapKey(run.runId, input.name))
    if (run.cancellationRequested || wait?.status !== "open") return state
    const waitId = wait.waitId
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const resolution: WaitResolution = { _tag: "Signal", name: input.name, payload: input.payload }
    const transitioned = closeWait(state, { runId: run.runId, waitId, status: "signaled", resolution, closedAt })
    if (transitioned.affected !== 1) return state
    const [, resumed] = yield* appendLifecycle(
      transitioned.state,
      run.runId,
      resumedEvent(waitId, resolution),
      "running",
    )
    return resumed
  }),
)
