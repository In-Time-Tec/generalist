import { Session } from "../../../core/context/public/session.js"
import { DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RuntimeUnavailable } from "../../errors.js"
import { terminalToolMessage, type RunTerminalOutcome, type ToolOperation } from "../../session/tool-results.js"
import { decodeEvent, decodeJsonValue } from "../codec/codecs.js"
import { RunFailure } from "../../run/event.js"
import type { DecodedRun, EventRow, OperationRow } from "../codec/rows.js"
import { type EntryRow, type SessionRow, SessionStorage } from "./store.js"

const { encodePayload, entryPayloadEquivalence, pathFromRows, requireActive, toEntry } = SessionStorage

const unavailable = (message: string) => RuntimeUnavailable.make({ message })

const toToolOperation = (row: OperationRow): ToolOperation => {
  const operation: ToolOperation = {
    operationId: row.operation_id,
    operationKey: row.operation_key,
    kind: row.kind,
    status: row.status,
    input: decodeJsonValue(row.input_json),
  }
  if (row.result_json !== null) Object.assign(operation, { result: decodeJsonValue(row.result_json) })
  if (row.error_json !== null) Object.assign(operation, { error: decodeJsonValue(row.error_json) })
  return operation
}

const TerminalEvent = Schema.Union([
  Schema.TaggedStruct("RunCancelled", { reason: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("RunFailed", { error: RunFailure }),
  Schema.TaggedStruct("RunCompleted", {}),
])

export const appendTerminalToolResults = (input: {
  readonly run: DecodedRun
  readonly terminal: RunTerminalOutcome
}): Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE tenetkit_sessions SET updated_at = updated_at WHERE session_id = ${input.run.sessionId}
    `
    const sessionRows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, owner_token FROM tenetkit_sessions WHERE session_id = ${input.run.sessionId}
    `
    const session = sessionRows[0]
    if (session === undefined) return
    const id = `${input.run.runId}:terminal-tool-results`
    const entries = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
      WHERE session_id = ${input.run.sessionId} ORDER BY seq
    `
    const existing = entries.find((entry) => entry.entry_id === id)
    const parentId = existing === undefined ? session.leaf_id : existing.parent_id
    const path = pathFromRows(entries, parentId)
    if (Schema.is(Session.SessionStoreError)(path)) return yield* unavailable(path.message)
    const eventRows = yield* sql<EventRow>`
      SELECT * FROM tenetkit_run_events WHERE run_id = ${input.run.runId} ORDER BY sequence
    `
    const events = yield* Effect.forEach(eventRows, (row) =>
      Effect.try({
        try: () => decodeEvent(row.event_json),
        catch: (error) => unavailable(`invalid persisted Run event ${row.event_id}: ${String(error)}`),
      }),
    )
    const operationRows = yield* sql<OperationRow>`
      SELECT * FROM tenetkit_run_operations WHERE run_id = ${input.run.runId}
    `
    const operations = yield* Effect.forEach(operationRows, (row) =>
      Effect.try({
        try: () => toToolOperation(row),
        catch: (error) => unavailable(`invalid persisted operation ${row.operation_id}: ${String(error)}`),
      }),
    )
    const message = yield* terminalToolMessage({
      runId: input.run.runId,
      path,
      events,
      operations,
      terminal: input.terminal,
    })
    if (message === undefined) return
    const payload: Session.AppendInput = {
      _tag: "Message",
      message,
      metadata: { terminalRunId: input.run.runId, terminalTag: input.terminal._tag },
    }
    if (existing !== undefined) {
      if (existing.parent_id !== parentId || !entryPayloadEquivalence(toEntry(existing), payload)) {
        return yield* unavailable(`Terminal Session entry ${id} conflicts with its retry`)
      }
      const conflict = requireActive(entries, session.leaf_id, id)
      if (conflict !== undefined) return yield* unavailable(conflict.message)
      return
    }
    const created = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    yield* sql`
      INSERT INTO tenetkit_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${input.run.sessionId}, ${id}, ${parentId}, ${session.next_seq}, 'Message',
        ${encodePayload(payload)}, ${created})
    `
    yield* sql`
      UPDATE tenetkit_sessions SET leaf_id = ${id}, next_seq = ${session.next_seq + 1}, updated_at = ${created}
      WHERE session_id = ${input.run.sessionId}
    `
  })

export const appendTerminalToolResultsForEvent = (input: {
  readonly run: DecodedRun
  readonly event: unknown
}): Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient> => {
  const decoded = Schema.decodeUnknownOption(TerminalEvent)(input.event)
  if (Option.isNone(decoded)) return Effect.void
  const event = decoded.value
  let terminal: RunTerminalOutcome
  if (event._tag === "RunCancelled") {
    terminal = { _tag: "RunCancelled" }
    if (event.reason !== undefined) Object.assign(terminal, { reason: event.reason })
  } else if (event._tag === "RunFailed") {
    terminal = { _tag: "RunFailed", error: event.error }
  } else {
    terminal = { _tag: "RunCompleted" }
  }
  return appendTerminalToolResults({ run: input.run, terminal })
}
