import type { RunEvent } from "../../../run/event.js"
import type { HostSessionEvent } from "../../../session/host.js"
import type { RuntimeState, StoredRun, HostSessionPublication } from "../../projection.js"

export const append = ({
  state,
  run,
  event,
}: {
  readonly state: RuntimeState
  readonly run: StoredRun
  readonly event: RunEvent
}) => {
  const hostSessions = new Map(state.hostSessions)
  const rootRun = state.runs.get(run.rootRunId)
  const family = state.sessions.get(run.message.sessionId)?.family
  const retainsSession = run.executableManifest.entries.some(
    (entry) => entry.pin === run.executableRef.active && (entry._tag === "Agent" || entry._tag === "Program"),
  )
  if (
    family !== undefined &&
    retainsSession &&
    run.parentRunId !== undefined &&
    !hostSessions.has(run.message.sessionId)
  ) {
    hostSessions.set(run.message.sessionId, {
      session: {
        id: run.message.sessionId,
        sponsorRunId: run.parentRunId,
        activeRunId: run.runId,
        createdAt: event.occurredAt,
        queue: [],
        selection: {
          executableRef: run.executableRef,
          executableManifest: run.executableManifest,
          registrations: run.registrations,
          treePolicy: run.treePolicy,
          budget: family.budget,
        },
      },
      lastCursor: -1,
      events: [],
      subscribers: new Map(),
    })
  }
  const publications: Array<HostSessionPublication> = []
  const sessionIds = new Set([run.message.sessionId, ...(rootRun === undefined ? [] : [rootRun.message.sessionId])])
  for (const sessionId of sessionIds) {
    const hostSession = hostSessions.get(sessionId)
    if (hostSession === undefined) continue
    const cursor = hostSession.lastCursor + 1
    const entry: HostSessionEvent = { _tag: "Run", cursor, event }
    hostSessions.set(hostSession.session.id, {
      ...hostSession,
      lastCursor: cursor,
      events: [...hostSession.events, entry],
    })
    publications.push({
      sessionId: hostSession.session.id,
      entry,
      lastDeliveredCursor: hostSession.lastCursor,
      subscribers: hostSession.subscribers,
    })
  }
  return { hostSessions, publications }
}
