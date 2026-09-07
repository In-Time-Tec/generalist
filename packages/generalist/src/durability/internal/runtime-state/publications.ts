import { Effect } from "effect"
import type { RuntimeState, RuntimePublication } from "../../../runtime/state/projection.js"
import { publish } from "../../../runtime/state/store/event/publications.js"
import { publish as publishArtifact } from "../../../runtime/state/store/artifact/index.js"
import { publish as publishSession } from "../../../runtime/state/store/host-session/index.js"
import { detach } from "./cache.js"

export interface Changes {
  readonly runs: ReadonlyArray<{ readonly id: string; readonly after: number }>
  readonly sessions: ReadonlyArray<{ readonly id: string; readonly after: number }>
  readonly artifacts: ReadonlyArray<{ readonly id: string; readonly after: number }>
}

const runPublications = (
  previous: RuntimeState,
  next: RuntimeState,
  changes: Changes,
  copy: ReturnType<typeof detach>,
): Array<RuntimePublication> => {
  const publications: Array<RuntimePublication> = []
  for (const { id: runId, after } of changes.runs) {
    const run = next.runs.get(runId)!
    const old = previous.runs.get(runId)
    for (const event of run.events.slice(after + 1)) {
      publications.push({
        runId,
        event: copy(event),
        lastDeliveredSequence: event.sequence - 1,
        subscribers: old?.subscribers ?? new Map(),
        treeSubscribers: previous.treeRoots.get(run.rootRunId)?.subscribers ?? new Map(),
      })
    }
  }
  return publications
}

const publishSessions = (
  previous: RuntimeState,
  next: RuntimeState,
  initial: RuntimeState,
  changes: Changes,
  copy: ReturnType<typeof detach>,
) =>
  Effect.gen(function* () {
    let delivered = initial
    for (const { id: sessionId, after } of changes.sessions) {
      const session = next.hostSessions.get(sessionId)!
      const old = previous.hostSessions.get(sessionId)
      for (const entry of session.events.slice(after)) {
        delivered = yield* publishSession({
          state: delivered,
          publication: {
            sessionId,
            entry: copy(entry),
            lastDeliveredCursor: entry.cursor - 1,
            subscribers: old?.subscribers ?? new Map(),
          },
        })
      }
    }
    return delivered
  })

const publishArtifacts = (
  previous: RuntimeState,
  next: RuntimeState,
  initial: RuntimeState,
  changes: Changes,
  copy: ReturnType<typeof detach>,
) =>
  Effect.gen(function* () {
    let delivered = initial
    for (const { id: key, after } of changes.artifacts) {
      const artifact = next.artifacts.get(key)!
      const old = previous.artifacts.get(key)
      for (const update of artifact.updates.slice(after)) {
        delivered = yield* publishArtifact({
          state: delivered,
          publication: { key, update: copy(update), subscribers: old?.subscribers ?? new Map() },
        })
      }
    }
    return delivered
  })

export const publishChanges = ({
  previous,
  next,
  changes,
}: {
  readonly previous: RuntimeState
  readonly next: RuntimeState
  readonly changes: Changes
}) =>
  Effect.gen(function* () {
    const copy = detach()
    const runs = yield* publish({
      initial: { ...next, publications: [], artifactPublications: [] },
      publications: runPublications(previous, next, changes, copy),
    })
    const sessions = yield* publishSessions(previous, next, runs, changes, copy)
    return yield* publishArtifacts(previous, next, sessions, changes, copy)
  })
