import { Clock, Effect, Ref } from "effect"
import type { LooseServerFrameType, SessionStatus } from "./wire.js"
import { coordination } from "./session-coordination.js"
import type { RegistryState } from "./session-registry-runtime.js"
import type { SessionError } from "./session-registry-errors.js"

export const setSessionStatus = (input: {
  readonly state: Ref.Ref<RegistryState>
  readonly publish: (
    sessionId: string,
    frame: { readonly _tag: "SessionStatus"; readonly status: SessionStatus },
  ) => Effect.Effect<LooseServerFrameType, SessionError>
  readonly sessionId: string
  readonly runId: number
  readonly status: SessionStatus
}): Effect.Effect<void, SessionError> =>
  Clock.currentTimeMillis.pipe(
    Effect.flatMap((now) =>
      Ref.modify(input.state, (current): readonly [boolean, RegistryState] => {
        const session = current.sessions.get(input.sessionId)
        if (session === undefined) return [false, current]
        const [updated, nextCoordination] = coordination.setStatus(session.coordination, input.runId, input.status, now)
        if (!updated) return [false, current]
        const sessions = new Map(current.sessions)
        sessions.set(input.sessionId, { ...session, coordination: nextCoordination })
        return [true, { ...current, sessions }]
      }),
    ),
    Effect.flatMap((updated) =>
      updated
        ? input.publish(input.sessionId, { _tag: "SessionStatus", status: input.status }).pipe(Effect.asVoid)
        : Effect.void,
    ),
  )
