import { DateTime, Effect, Function } from "effect"
import { AckBeyondCommitted, AckInvalid, RunNotFound, RuntimeUnavailable } from "../errors.js"
import type { AckPoint } from "../run-store.js"
import type { MemoryState, StoredRun } from "./state.js"
import { validateBoundary, validateRange } from "../acknowledgement.js"

type AckResult = Effect.Effect<MemoryState, RunNotFound | AckInvalid | AckBeyondCommitted | RuntimeUnavailable>

const getRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

/**
 * Durably record the host's processed-through point for a Run.
 *
 * Idempotent and monotonic: an ack can only move the recorded point forward; an older ack is a
 * no-op. Acking beyond the last committed `TurnCompleted` boundary fails `AckBeyondCommitted`;
 * a sequence below the cursor origin fails `AckInvalid`.
 */
export const acknowledge: {
  (input: { readonly runId: string; readonly sequence: number }): (state: MemoryState) => AckResult
  (state: MemoryState, input: { readonly runId: string; readonly sequence: number }): AckResult
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly sequence: number }) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    yield* validateRange({
      runId: input.runId,
      sequence: input.sequence,
      lastCommittedSequence: run.lastCommittedSequence,
    })
    yield* validateBoundary({
      runId: input.runId,
      sequence: input.sequence,
      committed: run.events.some((event) => event.sequence === input.sequence && event._tag === "TurnCompleted"),
    })
    const acks = new Map(state.acks)
    const current = acks.get(input.runId)
    if (current === undefined || input.sequence > current.sequence) {
      const acknowledgedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
      acks.set(input.runId, { runId: input.runId, sequence: input.sequence, acknowledgedAt })
    }
    return { ...state, acks }
  }),
)

/** Read the durable host-acknowledged point; the origin (-1) when nothing is acknowledged. */
export const loadAcknowledged: {
  (runId: string): (state: MemoryState) => Effect.Effect<AckPoint, RunNotFound | RuntimeUnavailable>
  (state: MemoryState, runId: string): Effect.Effect<AckPoint, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, runId: string) =>
  Effect.gen(function* () {
    yield* getRun(state, runId)
    const ack = state.acks.get(runId)
    return ack === undefined ? { runId, sequence: -1 } : ack
  }),
)
