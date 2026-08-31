import { DateTime, Effect } from "effect"
import {
  type AppendInput,
  type Entry,
  type HandoffEntry,
  SessionConflict,
  type SessionStoreError,
} from "../../../core/context/session.js"
import { SqlClient } from "effect/unstable/sql"
import type { CompletedSessionEntry } from "../../execution/model-response/commit.js"
import { handoffPayload, type HandoffSessionEntry } from "../../session/handoff.js"
import { type EntryRow, type SessionRow, SessionStorage } from "../session/storage.js"

const { encodePayload, entryPayloadEquivalence, storeError, toEntry } = SessionStorage

const completedPayload = (input: CompletedSessionEntry): AppendInput => ({
  _tag: "ModelResponse",
  content: input.content,
  metadata: { modelResponseDigest: input.digest },
})

export const verifyCompletedSessionEntry = (
  input: CompletedSessionEntry,
): Effect.Effect<
  void,
  SessionConflict | SessionStoreError | import("effect/unstable/sql/SqlError").SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sessions = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
      FROM generalist_sessions WHERE session_id = ${input.sessionId}
    `
    const rows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = rows[0]
    const entry = existing === undefined ? undefined : toEntry(existing)
    if (
      sessions[0] === undefined ||
      existing === undefined ||
      existing.parent_id !== input.parentId ||
      entry?._tag !== "ModelResponse" ||
      entry.metadata?.modelResponseDigest !== input.digest
    ) {
      return yield* SessionConflict.make({
        reason: "entry-id-reused",
        message: `Session entry id ${input.entryId} does not match the completed response`,
      })
    }
    const all = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
      WHERE session_id = ${input.sessionId} ORDER BY seq
    `
    const byId = new Map(all.map((row) => [row.entry_id, row] as const))
    let cursor = sessions[0].leaf_id
    for (let count = 0; cursor !== null && count <= all.length; count += 1) {
      if (cursor === input.entryId) return
      cursor = byId.get(cursor)?.parent_id ?? null
    }
    return yield* SessionConflict.make({
      reason: "stale-leaf",
      message: `Session entry id ${input.entryId} is not on the active path`,
    })
  })

/** Append or verify one exact completed assistant projection inside the caller's SQL transaction. */
export const appendCompletedSessionEntry = (
  input: CompletedSessionEntry,
): Effect.Effect<
  Entry,
  SessionConflict | SessionStoreError | import("effect/unstable/sql/SqlError").SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const created = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const sessionRows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
      FROM generalist_sessions WHERE session_id = ${input.sessionId}
    `
    const session = sessionRows[0]
    if (session === undefined) return yield* storeError(`Session ${input.sessionId} could not be initialized`)
    const existingRows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = existingRows[0]
    if (existing !== undefined) {
      yield* verifyCompletedSessionEntry(input)
      return toEntry(existing)
    }
    if (session.leaf_id !== input.parentId) {
      return yield* SessionConflict.make({
        reason: "stale-leaf",
        message: `Expected Session leaf ${String(input.parentId)} but found ${String(session.leaf_id)}`,
      })
    }
    const payload = completedPayload(input)
    yield* sql`
      INSERT INTO generalist_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${input.sessionId}, ${input.entryId}, ${input.parentId}, ${session.next_seq}, 'ModelResponse',
        ${encodePayload(payload)}, ${created})
    `
    yield* sql`
      UPDATE generalist_sessions SET leaf_id = ${input.entryId}, next_seq = ${session.next_seq + 1}, updated_at = ${created}
      WHERE session_id = ${input.sessionId}
    `
    return { ...payload, id: input.entryId, parentId: input.parentId }
  })

export const verifyHandoffSessionEntry = (
  input: HandoffSessionEntry,
): Effect.Effect<
  void,
  SessionConflict | SessionStoreError | import("effect/unstable/sql/SqlError").SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sessions = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
      FROM generalist_sessions WHERE session_id = ${input.sessionId}
    `
    const rows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = rows[0]
    if (
      sessions[0] === undefined ||
      existing === undefined ||
      existing.parent_id !== input.parentId ||
      !entryPayloadEquivalence(toEntry(existing), handoffPayload(input))
    ) {
      return yield* SessionConflict.make({
        reason: "entry-id-reused",
        message: `Session entry id ${input.entryId} does not match the handoff projection`,
      })
    }
    const all = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
      WHERE session_id = ${input.sessionId} ORDER BY seq
    `
    const byId = new Map(all.map((row) => [row.entry_id, row] as const))
    let cursor = sessions[0].leaf_id
    for (let count = 0; cursor !== null && count <= all.length; count += 1) {
      if (cursor === input.entryId) return
      cursor = byId.get(cursor)?.parent_id ?? null
    }
    return yield* SessionConflict.make({
      reason: "stale-leaf",
      message: `Session entry id ${input.entryId} is not on the active path`,
    })
  })

/** Append or verify one exact handoff projection inside the caller's SQL transaction. */
export const appendHandoffSessionEntry = (
  input: HandoffSessionEntry,
): Effect.Effect<
  HandoffEntry,
  SessionConflict | SessionStoreError | import("effect/unstable/sql/SqlError").SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const created = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const sessionRows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
      FROM generalist_sessions WHERE session_id = ${input.sessionId}
    `
    const session = sessionRows[0]
    if (session === undefined) return yield* storeError(`Session ${input.sessionId} could not be initialized`)
    const existingRows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = existingRows[0]
    if (existing !== undefined) {
      yield* verifyHandoffSessionEntry(input)
      const entry = toEntry(existing)
      if (entry._tag !== "Handoff") {
        return yield* SessionConflict.make({
          reason: "entry-id-reused",
          message: `Session entry id ${input.entryId} is not a handoff projection`,
        })
      }
      return entry
    }
    if (session.leaf_id !== input.parentId) {
      return yield* SessionConflict.make({
        reason: "stale-leaf",
        message: `Expected Session leaf ${String(input.parentId)} but found ${String(session.leaf_id)}`,
      })
    }
    const payload = handoffPayload(input)
    yield* sql`
      INSERT INTO generalist_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${input.sessionId}, ${input.entryId}, ${input.parentId}, ${session.next_seq}, 'Handoff',
        ${encodePayload(payload)}, ${created})
    `
    yield* sql`
      UPDATE generalist_sessions SET leaf_id = ${input.entryId}, next_seq = ${session.next_seq + 1}, updated_at = ${created}
      WHERE session_id = ${input.sessionId}
    `
    return { ...payload, id: input.entryId, parentId: input.parentId }
  })
