import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, TreeCursorExpired, TreeCursorFuture, TreeReplayLimitInvalid } from "../errors.js"
import { make as makeTreeCursor } from "../tree/cursor.js"
import { projectTreeEvent } from "../tree/event.js"
import { decodeEvent, decodeSqlInteger } from "./codec/codecs.js"

interface TreeRow {
  readonly position: number | string | bigint
  readonly event_json: string
  readonly root_run_id: string
  readonly parent_run_id: string | null
  readonly invocation_id: string | null
}

export const loadTreeReplay = (input: {
  readonly rootRunId: string
  readonly position: number
  readonly limit: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const roots = yield* sql<{
      earliest_position: number | string | bigint
      last_position: number | string | bigint
    }>`
      SELECT earliest_position, last_position FROM generalist_tree_roots WHERE root_run_id = ${input.rootRunId}
    `
    const root = roots[0]
    if (root === undefined) return yield* RunNotFound.make({ runId: input.rootRunId })
    const earliest = decodeSqlInteger(root.earliest_position)
    const last = decodeSqlInteger(root.last_position)
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1000) {
      return yield* TreeReplayLimitInvalid.make({
        received: String(input.limit),
        minimum: 1,
        maximum: 1000,
      })
    }
    if (input.position > last) {
      return yield* TreeCursorFuture.make({
        rootRunId: input.rootRunId,
        cursor: makeTreeCursor(input.rootRunId, input.position),
        latestCursor: makeTreeCursor(input.rootRunId, last),
      })
    }
    if (input.position < earliest - 1) {
      return yield* TreeCursorExpired.make({
        rootRunId: input.rootRunId,
        cursor: makeTreeCursor(input.rootRunId, input.position),
        earliestCursor: makeTreeCursor(input.rootRunId, earliest - 1),
      })
    }
    const rows = yield* sql<TreeRow>`
      SELECT i.position, e.event_json, r.root_run_id, r.parent_run_id, r.invocation_id
      FROM generalist_tree_event_index i
      JOIN generalist_run_events e ON e.run_id = i.run_id AND e.sequence = i.run_sequence
      JOIN generalist_runs r ON r.run_id = i.run_id
      WHERE i.root_run_id = ${input.rootRunId} AND i.position > ${input.position}
      ORDER BY i.position ASC LIMIT ${sql.literal(String(Math.max(0, Math.floor(input.limit)) + 1))}
    `
    const selected = rows.slice(0, input.limit)
    const events = selected.map((row) => {
      const context = { rootRunId: row.root_run_id }
      if (row.parent_run_id !== null) Object.assign(context, { parentRunId: row.parent_run_id })
      if (row.invocation_id !== null) Object.assign(context, { invocationId: row.invocation_id })
      return projectTreeEvent(decodeEvent(row.event_json), decodeSqlInteger(row.position), context)
    })
    const finalRow = selected.at(-1)
    const position = finalRow === undefined ? input.position : decodeSqlInteger(finalRow.position)
    return { events, cursor: makeTreeCursor(input.rootRunId, position), hasMore: rows.length > input.limit }
  })
