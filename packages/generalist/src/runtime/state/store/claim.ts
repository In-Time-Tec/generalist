import { Effect, Function } from "effect"
import type { ExecutionClaim, SessionWriteClaim } from "../../run/store.js"
import { StaleClaim, StaleSessionClaim } from "../../run/ownership-errors.js"
import type { RuntimeState } from "../projection.js"

const matchesSessionWriter = (state: RuntimeState, claim: SessionWriteClaim): boolean => {
  const session = state.sessions.get(claim.sessionId)
  return (
    session !== undefined &&
    session.writerEpoch.toString() === claim.epoch &&
    session.writer?.runId === claim.runId &&
    session.writer.ownerId === claim.ownerId &&
    session.writer.runAttemptFence === claim.runAttemptFence
  )
}

export const requireExecutionClaim: {
  (input: ExecutionClaim): (state: RuntimeState) => Effect.Effect<void, StaleClaim | StaleSessionClaim>
  (state: RuntimeState, input: ExecutionClaim): Effect.Effect<void, StaleClaim | StaleSessionClaim>
} = Function.dual(2, (state: RuntimeState, input: ExecutionClaim) => {
  const run = state.runs.get(input.runId)
  if (run === undefined || run.ownerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
    return StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
  }
  if (run.executableManifest.entries.some((entry) => entry.pin === run.executableRef.active && entry._tag === "Tool"))
    return input.session === undefined
      ? Effect.void
      : StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
  if (input.session === undefined)
    return StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
  if (
    input.session.runId === input.runId &&
    input.session.ownerId === input.ownerId &&
    input.session.runAttemptFence === input.attemptFence &&
    matchesSessionWriter(state, input.session)
  )
    return Effect.void
  return StaleSessionClaim.make(input.session)
})
