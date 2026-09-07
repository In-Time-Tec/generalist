import { type PreparedObservation, occurredAt as preparedOccurredAt } from "../../observation.js"
import { Effect, Function, Option } from "effect"
import { ResponseConflict, RunNotFound, RunTerminal, RuntimeUnavailable, WaitNotOpen } from "../../../errors.js"
import type { RespondInput, SignalInput as SignalCommand } from "../../../service.js"
import type { RunWait, WaitResolution } from "../../../run/wait.js"
import { classifyResponse } from "../../../run/wait-internal.js"
import { appendLifecycle, rejectIfTerminal, resumedEvent } from "../../append.js"
import { waitMapKey, type RuntimeState, type StoredRun } from "../../projection.js"

type RespondResult = Effect.Effect<
  RuntimeState,
  RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable,
  PreparedObservation
>
type SignalResult = Effect.Effect<RuntimeState, RunNotFound | RunTerminal | RuntimeUnavailable, PreparedObservation>
type SignalInput = Pick<SignalCommand, "runId" | "name" | "payload">

const getRun = (state: RuntimeState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
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
  readonly state: RuntimeState
  readonly affected: 0 | 1
}

export const closeWait: {
  (input: CloseWaitInput): (state: RuntimeState) => CloseWaitResult
  (state: RuntimeState, input: CloseWaitInput): CloseWaitResult
} = Function.dual(2, (state: RuntimeState, input: CloseWaitInput): CloseWaitResult => {
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
  (input: RespondInput): (state: RuntimeState) => RespondResult
  (state: RuntimeState, input: RespondInput): RespondResult
} = Function.dual(2, (state: RuntimeState, input: RespondInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const prior = state.waits.get(waitMapKey(run.runId, input.waitId))
    const classification = classifyResponse(prior, input.resolution)
    if (classification === "duplicate-identical") return state
    if (classification === "duplicate-conflict") {
      return yield* ResponseConflict.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.cancellationRequested || classification !== "open") {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const closedAt = yield* preparedOccurredAt
    const resolution: WaitResolution = input.resolution
    const transitioned = closeWait(state, {
      runId: run.runId,
      waitId: input.waitId,
      status: "responded",
      resolution,
      closedAt,
    })
    if (transitioned.affected !== 1) {
      const current = transitioned.state.waits.get(waitMapKey(run.runId, input.waitId))
      const outcome = classifyResponse(current, resolution)
      if (outcome === "duplicate-identical") return transitioned.state
      if (outcome === "duplicate-conflict") {
        return yield* ResponseConflict.make({ runId: run.runId, waitId: input.waitId })
      }
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
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
  (input: SignalInput): (state: RuntimeState) => SignalResult
  (state: RuntimeState, input: SignalInput): SignalResult
} = Function.dual(2, (state: RuntimeState, input: SignalInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const wait = state.waits.get(waitMapKey(run.runId, input.name))
    if (run.cancellationRequested || wait?.status !== "open") return state
    const waitId = wait.waitId
    const closedAt = yield* preparedOccurredAt
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
