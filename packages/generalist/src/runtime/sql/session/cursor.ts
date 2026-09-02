import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunEvent } from "../../run/event.js"
import { decodeSqlInteger } from "../codec/codecs.js"
import type { EventHub } from "../subscribers.js"

interface HostSessionCursorRow {
  readonly session_id: string
  readonly next_event_sequence: number | string | bigint
}

export interface HostSessionCursor {
  readonly sessionId: string
  readonly cursor: number
}

/** Claim the next product Session cursor in the event append transaction. */
export const claim = (rootRunId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const query = sql<HostSessionCursorRow>`
      SELECT session.session_id, session.next_event_sequence
      FROM generalist_host_sessions session
      JOIN generalist_runs root ON root.session_id = session.session_id
      WHERE root.run_id = ${rootRunId}
    `
    const rows = yield* sql.onDialectOrElse({
      pg: () => sql<HostSessionCursorRow>`${query} FOR UPDATE`,
      mysql: () => sql<HostSessionCursorRow>`${query} FOR UPDATE`,
      orElse: () => query,
    })
    const row = rows[0]
    if (row === undefined) return undefined
    const cursor = decodeSqlInteger(row.next_event_sequence)
    yield* sql`
      UPDATE generalist_host_sessions
      SET next_event_sequence = ${cursor + 1}
      WHERE session_id = ${row.session_id} AND next_event_sequence = ${cursor}
    `
    return { sessionId: row.session_id, cursor }
  })

/** Queue a claimed Session event for publication after commit. */
export const publish = (input: {
  readonly hub: EventHub
  readonly claimed: HostSessionCursor | undefined
  readonly event: RunEvent
}): Effect.Effect<void> => {
  if (input.claimed === undefined) return Effect.void
  return input.hub.publishHostSession(input.claimed.sessionId, {
    cursor: input.claimed.cursor,
    event: input.event,
  })
}
