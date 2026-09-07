import { Effect, Function } from "effect"
import type { ExecutionClaim } from "../../run/store.js"
import { StaleClaim, StaleSessionClaim } from "../../run/ownership-errors.js"
import type { RuntimeState } from "../projection.js"

export const requireExecutionClaim: {
  (input: ExecutionClaim): (state: RuntimeState) => Effect.Effect<void, StaleClaim | StaleSessionClaim>
  (state: RuntimeState, input: ExecutionClaim): Effect.Effect<void, StaleClaim | StaleSessionClaim>
} = Function.dual(2, (state: RuntimeState, input: ExecutionClaim) => {
  const run = state.runs.get(input.runId)
  if (run === undefined || run.ownerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
    return StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
  }
  const session = state.sessions.get(input.session.sessionId)
  if (
    session !== undefined &&
    input.session.runId === input.runId &&
    input.session.ownerId === input.ownerId &&
    input.session.runAttemptFence === input.attemptFence &&
    session.writerEpoch.toString() === input.session.epoch &&
    session.writer?.runId === input.runId &&
    session.writer.ownerId === input.ownerId &&
    session.writer.runAttemptFence === input.attemptFence
  )
    return Effect.void
  return StaleSessionClaim.make(input.session)
})
