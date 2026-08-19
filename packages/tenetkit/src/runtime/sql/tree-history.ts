import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, TreeCursorExpired, TreeCursorInvalid } from "../errors.js"
import { makeCursor } from "../tree-cursor.js"
import { projectTreeEvent } from "../tree-event.js"
import { decodeEvent } from "./codecs.js"

interface TreeRow {
  readonly position: number
  readonly event_json: string
  readonly root_run_id: string
  readonly parent_run_id: string | null
  readonly invocation_id: string | null
}

export const loadTreeHistory = (input: {
  readonly rootRunId: string
  readonly position: number
  readonly limit: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const roots = yield* sql<{ earliest_position: number; last_position: number }>`
      SELECT earliest_position, last_position FROM tenetkit_tree_roots WHERE root_run_id = ${input.rootRunId}
    `
    const root = roots[0]
    if (root === undefined) return yield* RunNotFound.make({ runId: input.rootRunId })
    const earliest = Number(root.earliest_position)
    const last = Number(root.last_position)
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000) {
      return yield* TreeCursorInvalid.make({
        rootRunId: input.rootRunId,
        cursor: makeCursor(input.rootRunId, input.position),
        message: "tree history limit must be an integer between 1 and 1000",
      })
    }
    if (input.position > last) {
      return yield* TreeCursorInvalid.make({
        rootRunId: input.rootRunId,
        cursor: makeCursor(input.rootRunId, input.position),
        message: "tree cursor position is in the future",
      })
    }
    if (input.position < earliest - 1) {
      return yield* TreeCursorExpired.make({
        rootRunId: input.rootRunId,
        cursor: makeCursor(input.rootRunId, input.position),
        earliestCursor: makeCursor(input.rootRunId, earliest - 1),
      })
    }
    const rows = yield* sql<TreeRow>`
      SELECT i.position, e.event_json, r.root_run_id, r.parent_run_id, r.invocation_id
      FROM tenetkit_tree_event_index i
      JOIN tenetkit_run_events e ON e.run_id = i.run_id AND e.sequence = i.run_sequence
      JOIN tenetkit_runs r ON r.run_id = i.run_id
      WHERE i.root_run_id = ${input.rootRunId} AND i.position > ${input.position}
      ORDER BY i.position ASC LIMIT ${sql.literal(String(Math.max(0, Math.floor(input.limit)) + 1))}
    `
    const selected = rows.slice(0, input.limit)
    const events = selected.map((row) =>
      projectTreeEvent(decodeEvent(row.event_json), Number(row.position), {
        rootRunId: row.root_run_id,
        ...(row.parent_run_id === null ? {} : { parentRunId: row.parent_run_id }),
        ...(row.invocation_id === null ? {} : { invocationId: row.invocation_id }),
      }),
    )
    const position = selected.length === 0 ? input.position : Number(selected.at(-1)!.position)
    return { events, cursor: makeCursor(input.rootRunId, position), hasMore: rows.length > input.limit }
  })
