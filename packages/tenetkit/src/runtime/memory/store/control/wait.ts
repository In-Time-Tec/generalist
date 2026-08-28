import { DateTime, Effect, Equal, Function, Option } from "effect"
import { ResponseConflict, RunNotFound, RunTerminal, RuntimeUnavailable, WaitNotOpen } from "../../../errors.js"
import type { RespondInput, SignalInput } from "../../../service.js"
import type { WaitResolution } from "../../../run/wait.js"
import { appendLifecycle, rejectIfTerminal, resumedEvent } from "../../append.js"
import type { MemoryState, StoredRun } from "../../state.js"

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
    if (run.cancellationRequested || run.activeWaitId !== input.waitId) {
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
    const [, resumed] = yield* appendLifecycle(
      { ...state, runs, programOperations },
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
    if (run.cancellationRequested || run.activeWaitId === undefined || run.activeWaitId !== input.name) return state
    const waitId = run.activeWaitId
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const resolution: WaitResolution = { _tag: "Signal", name: input.name, payload: input.payload }
    const runs = new Map(state.runs)
    runs.set(run.runId, { ...run, wait: { ...run.wait!, status: "signaled", resolution, closedAt } })
    const [, resumed] = yield* appendLifecycle(
      { ...state, runs },
      run.runId,
      resumedEvent(waitId, resolution),
      "running",
    )
    return resumed
  }),
)
