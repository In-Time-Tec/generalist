import { Effect } from "effect"
import type { ControlInput } from "../../../session/queue.js"
import { SessionNotFound } from "../../../session/host.js"
import { RuntimeUnavailable } from "../../../errors.js"
import { isTerminal } from "../../../run.js"
import type { RuntimeState } from "../../projection.js"
import { cancel } from "../control.js"
import { promote } from "./queue.js"

export const control = ({ state, input }: { readonly state: RuntimeState; readonly input: ControlInput }) =>
  Effect.gen(function* () {
    const stored = state.hostSessions.get(input.sessionId)
    if (stored === undefined) return yield* SessionNotFound.make({ sessionId: input.sessionId })
    if (stored.session.lifecycle === "closed" && input.action !== "resume") return [undefined, state] as const
    if (stored.session.lifecycle === "closed" && input.action === "resume")
      return yield* RuntimeUnavailable.make({ message: "A closed Session cannot be resumed" })
    const { lifecycle: _, ...session } = stored.session
    if (input.action !== "resume")
      Object.assign(session, { lifecycle: input.action === "close" ? "closed" : "stopped" })
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(input.sessionId, {
      ...stored,
      session,
    })
    let next: RuntimeState = { ...state, hostSessions }
    if (input.action === "close") {
      const runtimeSession = next.sessions.get(input.sessionId)
      if (runtimeSession?.continuation !== undefined) {
        const sessions = new Map(next.sessions)
        sessions.set(input.sessionId, {
          ...runtimeSession,
          continuation: { ...runtimeSession.continuation, closed: true },
        })
        next = { ...next, sessions }
      }
    }
    if (input.action === "resume")
      return [undefined, yield* promote({ state: next, sessionId: input.sessionId })] as const
    for (const run of state.runs.values()) {
      if (run.message.sessionId !== input.sessionId || isTerminal(run.status)) continue
      next = yield* cancel(next, { runId: run.runId, reason: `Session ${input.action}` }).pipe(
        Effect.mapError((error) => RuntimeUnavailable.make({ message: error._tag })),
      )
    }
    return [undefined, next] as const
  })
