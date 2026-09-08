import type { PreparedObservation } from "../../observation.js"
import { Effect, Function } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import type { RuntimeState, StoredRun } from "../../projection.js"
import { promote } from "../host-session/queue.js"
import { removeFromLane, promoteHead } from "./lanes.js"

export const afterTerminal: {
  (run: StoredRun): (state: RuntimeState) => Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
  (state: RuntimeState, run: StoredRun): Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
} = Function.dual(2, (state: RuntimeState, run: StoredRun) =>
  Effect.gen(function* () {
    let without = removeFromLane(state, run.message.sessionId, run.runId)
    const stored = without.hostSessions.get(run.message.sessionId)
    if (stored?.session.activeRunId === run.runId) {
      const { activeRunId: _, ...session } = stored.session
      const hostSessions = new Map(without.hostSessions)
      hostSessions.set(run.message.sessionId, { ...stored, session })
      without = { ...without, hostSessions }
    }
    return yield* promoteHead(without, run.message.sessionId).pipe(
      Effect.flatMap((next) => promote({ state: next, sessionId: run.message.sessionId })),
    )
  }),
)
