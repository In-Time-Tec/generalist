import { Effect, Schema } from "effect"
import { Cursor } from "../cursor.js"
import { AckBeyondCommitted, AckInvalid } from "../errors.js"
import { RunId } from "../run.js"

/** One durable host processed-through point on the Run event sequence. */
export const Point = Schema.Struct({
  runId: RunId,
  sequence: Cursor,
  acknowledgedAt: Schema.optionalKey(Schema.String),
})

/** One durable host processed-through point on the Run event sequence. */
export type Point = typeof Point.Type

/** @internal */
export const validateRange = (input: {
  readonly runId: string
  readonly sequence: number
  readonly lastTurnCompletedSequence: number
}): Effect.Effect<void, AckInvalid | AckBeyondCommitted> => {
  if (!Schema.is(Cursor)(input.sequence)) {
    return Effect.fail(
      AckInvalid.make({
        runId: input.runId,
        sequence: input.sequence,
        message: "acknowledged sequence must be -1 or a safe integer",
      }),
    )
  }
  if (input.sequence > input.lastTurnCompletedSequence) {
    return Effect.fail(
      AckBeyondCommitted.make({
        runId: input.runId,
        sequence: input.sequence,
        lastCommittedSequence: input.lastTurnCompletedSequence,
      }),
    )
  }
  return Effect.void
}

/** @internal */
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
