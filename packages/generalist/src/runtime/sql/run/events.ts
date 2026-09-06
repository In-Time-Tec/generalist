import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { EventRow } from "../codec/rows.js"
import { loadRun } from "../store/statements.js"
import { decodePersistedEvents } from "../codec/events.js"

/** Internal replay page bound shared by initial replay and notification catch-up. */
export const eventReplayPageSize = 128

/** Load one keyset page strictly after the supplied authoritative cursor. */
export const loadEventPageAfter = (input: {
  readonly runId: string
  readonly cursor: number
  readonly limit: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    if (run === undefined) return []
    const rows = yield* sql<Pick<EventRow, "event_id" | "event_json">>`
      SELECT event_id, event_json FROM generalist_run_events
      WHERE run_id = ${input.runId} AND sequence > ${input.cursor}
      ORDER BY sequence ASC
      LIMIT ${input.limit}
    `
    return yield* decodePersistedEvents({ rows, manifest: run.executableManifest })
  })
