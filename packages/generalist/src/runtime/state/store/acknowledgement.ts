import { type PreparedObservation, occurredAt as preparedOccurredAt } from "../observation.js"
import { Effect, Function } from "effect"
import { type Point, validateBoundary, validateRange } from "../../run/acknowledgement.js"
import { AckBeyondCommitted, AckInvalid, RunNotFound, RuntimeUnavailable } from "../../errors.js"
import type { RuntimeState, StoredRun } from "../projection.js"

const getRun = (state: RuntimeState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

/** @internal */
export const acknowledge: {
  (input: {
    readonly runId: string
    readonly sequence: number
  }): (
    state: RuntimeState,
  ) => Effect.Effect<
    RuntimeState,
    RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable,
    PreparedObservation
  >
  (
    state: RuntimeState,
    input: { readonly runId: string; readonly sequence: number },
  ): Effect.Effect<
    RuntimeState,
    RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable,
    PreparedObservation
  >
} = Function.dual(2, (state: RuntimeState, input: { readonly runId: string; readonly sequence: number }) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    yield* validateRange({
      runId: input.runId,
      sequence: input.sequence,
      lastTurnCompletedSequence: run.lastTurnCompletedSequence,
    })
    yield* validateBoundary({
      runId: input.runId,
      sequence: input.sequence,
      committed: run.events.some((event) => event.sequence === input.sequence && event._tag === "TurnCompleted"),
    })
    const current = state.acknowledgements.get(input.runId)
    if (current !== undefined && input.sequence <= current.sequence) return state
    const acknowledgedAt = yield* preparedOccurredAt
    const acknowledgements = new Map(state.acknowledgements)
    acknowledgements.set(input.runId, { runId: input.runId, sequence: input.sequence, acknowledgedAt })
    return { ...state, acknowledgements }
  }),
)

/** @internal */
export const loadAcknowledged: {
  (runId: string): (state: RuntimeState) => Effect.Effect<Point, RunNotFound | RuntimeUnavailable>
  (state: RuntimeState, runId: string): Effect.Effect<Point, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: RuntimeState, runId: string) =>
  Effect.gen(function* () {
    yield* getRun(state, runId)
    return state.acknowledgements.get(runId) ?? { runId, sequence: -1 }
  }),
)
