import { DateTime, Effect, Function } from "effect"
import { type Point, validateBoundary, validateRange } from "../../acknowledgement.js"
import { AckBeyondCommitted, AckInvalid, RunNotFound, RuntimeUnavailable } from "../../errors.js"
import type { MemoryState, StoredRun } from "../state.js"

const getRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
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
    state: MemoryState,
  ) => Effect.Effect<MemoryState, RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable>
  (
    state: MemoryState,
    input: { readonly runId: string; readonly sequence: number },
  ): Effect.Effect<MemoryState, RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly sequence: number }) =>
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
    const acknowledgedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const acknowledgements = new Map(state.acknowledgements)
    acknowledgements.set(input.runId, { runId: input.runId, sequence: input.sequence, acknowledgedAt })
    return { ...state, acknowledgements }
  }),
)

/** @internal */
export const loadAcknowledged: {
  (runId: string): (state: MemoryState) => Effect.Effect<Point, RunNotFound | RuntimeUnavailable>
  (state: MemoryState, runId: string): Effect.Effect<Point, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, runId: string) =>
  Effect.gen(function* () {
    yield* getRun(state, runId)
    return state.acknowledgements.get(runId) ?? { runId, sequence: -1 }
  }),
)
