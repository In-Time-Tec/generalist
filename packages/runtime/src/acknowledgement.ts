import { Effect, Schema } from "effect"
import { AckBeyondCommitted, AckInvalid } from "./errors.js"
import { Sequence } from "./run-event.js"

const AckSequence = Schema.Union([Schema.Literal(-1), Sequence])

interface Input {
  readonly runId: string
  readonly sequence: number
  readonly lastCommittedSequence: number
}

export const validateRange = (input: Input): Effect.Effect<void, AckInvalid | AckBeyondCommitted> => {
  if (!Schema.is(AckSequence)(input.sequence)) {
    return Effect.fail(
      AckInvalid.make({
        runId: input.runId,
        sequence: input.sequence,
        message: "acknowledged sequence must be -1 or a safe integer",
      }),
    )
  }
  if (input.sequence > input.lastCommittedSequence) {
    return Effect.fail(
      AckBeyondCommitted.make({
        runId: input.runId,
        sequence: input.sequence,
        lastCommittedSequence: input.lastCommittedSequence,
      }),
    )
  }
  return Effect.void
}

export const validateBoundary = (input: {
  readonly runId: string
  readonly sequence: number
  readonly committed: boolean
}): Effect.Effect<void, AckInvalid> => {
  if (input.sequence === -1 || input.committed) return Effect.void
  return Effect.fail(
    AckInvalid.make({
      runId: input.runId,
      sequence: input.sequence,
      message: "acknowledged sequence must identify a committed TurnCompleted event",
    }),
  )
}
