import { Effect, Schema } from "effect"
import { SessionNotFound } from "../../../session/host.js"
import { SessionPageInvalid } from "../../../session/page.js"
import { SessionFamilyInput, type SessionFamilyPage, type RetainedSession } from "../../../session/retained.js"
import { RuntimeUnavailable } from "../../../errors.js"
import type { RuntimeState } from "../../projection.js"
import { retainedSession } from "../events.js"
import type { RunEvent } from "../../../run/event.js"

const selectFamily = ({
  state,
  sessionId,
  input,
}: {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly input: SessionFamilyInput
}) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    if (!state.hostSessions.has(sessionId)) return yield* SessionNotFound.make({ sessionId })
    const rootSessionId = state.sessions.get(sessionId)?.family?.rootSessionId ?? sessionId
    const root = state.hostSessions.get(rootSessionId)
    if (root === undefined) return yield* SessionNotFound.make({ sessionId: rootSessionId })
    if (!Schema.is(SessionFamilyInput)(input)) return yield* SessionPageInvalid.make({ sessionId })
    const at = input.at ?? root.lastCursor
    if (at > root.lastCursor || (input.before !== undefined && (input.at === undefined || input.before > at + 1)))
      return yield* SessionPageInvalid.make({ sessionId })
    return { root, rootSessionId, at }
  })

const isAdmission = (event: RunEvent) =>
  event._tag === "RunAccepted" || (event._tag === "RunForked" && event.role !== "source")

export const page = (request: Parameters<typeof selectFamily>[0]) =>
  Effect.gen(function* () {
    const { state, input } = request
    const { root, rootSessionId, at } = yield* selectFamily(request)
    const sessions: Array<RetainedSession> = []
    let index = input.before === undefined ? at : input.before - 1
    let scanned = 0
    while (index >= 0 && scanned < 256 && sessions.length < input.limit) {
      const item = root.events[index]
      if (item === undefined || item.cursor !== index)
        return yield* RuntimeUnavailable.make({ message: "Session event cursor does not match retained position" })
      index--
      scanned++
      if (item._tag !== "Run") continue
      const event = item.event
      if (!isAdmission(event)) continue
      const run = state.runs.get(event.runId)
      if (run === undefined) return yield* RuntimeUnavailable.make({ message: "Session Run does not exist" })
      const member = retainedSession({ state, sessionId: run.message.sessionId }).retainedSession
      if (member === undefined || member.rootSessionId !== rootSessionId || member.initialRunId !== run.runId) continue
      sessions.push(member)
    }
    return {
      rootSessionId,
      at,
      sessions: sessions.toReversed(),
      nextBefore: index < 0 ? null : index + 1,
    } satisfies SessionFamilyPage
  })
