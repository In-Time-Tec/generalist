import { Effect, Schema } from "effect"
import { Session } from "@batonfx/core"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { type EntryRow, type SessionRow, SessionStorage } from "../session-store.js"

const { encodePayload, entryPayloadEquivalence, storeError, toEntry } = SessionStorage

const lockSession = (
  sessionId: string,
): Effect.Effect<SessionRow, Session.SessionStoreError | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO baton_sessions (session_id, leaf_id, next_seq, owner_token, updated_at)
      VALUES (${sessionId}, NULL, 0, NULL, NOW())
      ON CONFLICT (session_id) DO NOTHING
    `
    const rows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, owner_token FROM baton_sessions
      WHERE session_id = ${sessionId}
      FOR UPDATE
    `
    const row = rows[0]
    return row === undefined ? yield* storeError(`Session ${sessionId} could not be initialized`) : row
  })

const loadEntries = (sessionId: string): Effect.Effect<ReadonlyArray<EntryRow>, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
      WHERE session_id = ${sessionId} ORDER BY seq
    `
  })

const pathFromRows = (
  rows: ReadonlyArray<EntryRow>,
  leaf: string | null,
): ReadonlyArray<Session.Entry> | Session.SessionStoreError => {
  if (leaf === null) return []
  const byId = new Map(rows.map((row) => [row.entry_id, row] as const))
  const walked: Array<Session.Entry> = []
  let cursor: string | null = leaf
  while (cursor !== null) {
    if (walked.length > rows.length) return storeError(`Session path for leaf ${leaf} contains a cycle`)
    const row = byId.get(cursor)
    if (row === undefined) return storeError(`Session entry ${cursor} does not exist`)
    walked.push(toEntry(row))
    cursor = row.parent_id
  }
  return walked.toReversed()
}

const requireActive = (
  rows: ReadonlyArray<EntryRow>,
  leaf: string | null,
  entryId: string,
  reason: "stale-leaf" | "checkpoint-not-on-active-path" = "stale-leaf",
): Session.SessionConflict | undefined => {
  const path = pathFromRows(rows, leaf)
  if (Schema.is(Session.SessionStoreError)(path)) {
    return Session.SessionConflict.make({ reason, message: path.message })
  }
  return path.some((entry) => entry.id === entryId)
    ? undefined
    : Session.SessionConflict.make({
        reason,
        message: `Session entry id ${entryId} is not on the active path from ${String(leaf)}`,
      })
}

const insertEntry = (input: {
  readonly sessionId: string
  readonly id: string
  readonly parentId: string | null
  readonly seq: number
  readonly tag: string
  readonly payload: Session.EntryPayload
}): Effect.Effect<void, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO baton_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${input.sessionId}, ${input.id}, ${input.parentId}, ${input.seq}, ${input.tag},
        ${encodePayload(input.payload)}, NOW())
    `
  })

const advanceSession = (input: {
  readonly sessionId: string
  readonly leafId: string | null
  readonly nextSeq: number
  readonly ownerToken?: string
}): Effect.Effect<void, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (input.ownerToken === undefined) {
      yield* sql`
        UPDATE baton_sessions SET leaf_id = ${input.leafId}, next_seq = ${input.nextSeq}, updated_at = NOW()
        WHERE session_id = ${input.sessionId}
      `
    } else {
      yield* sql`
        UPDATE baton_sessions SET leaf_id = ${input.leafId}, next_seq = ${input.nextSeq},
          owner_token = ${input.ownerToken}, updated_at = NOW()
        WHERE session_id = ${input.sessionId}
      `
    }
  })

export const PostgresSessionStorage: {
  readonly encodePayload: (payload: Session.EntryPayload) => string
  readonly entryPayloadEquivalence: (self: Session.EntryPayload, that: Session.EntryPayload) => boolean
  readonly storeError: (message: string) => Session.SessionStoreError
  readonly toEntry: (row: EntryRow) => Session.Entry
  readonly lockSession: (
    sessionId: string,
  ) => Effect.Effect<SessionRow, Session.SessionStoreError | SqlError, SqlClient.SqlClient>
  readonly loadEntries: (sessionId: string) => Effect.Effect<ReadonlyArray<EntryRow>, SqlError, SqlClient.SqlClient>
  readonly pathFromRows: (
    rows: ReadonlyArray<EntryRow>,
    leaf: string | null,
  ) => ReadonlyArray<Session.Entry> | Session.SessionStoreError
  readonly requireActive: (
    rows: ReadonlyArray<EntryRow>,
    leaf: string | null,
    entryId: string,
    reason?: "stale-leaf" | "checkpoint-not-on-active-path",
  ) => Session.SessionConflict | undefined
  readonly insertEntry: typeof insertEntry
  readonly advanceSession: typeof advanceSession
} = {
  encodePayload,
  entryPayloadEquivalence,
  storeError,
  toEntry,
  lockSession,
  loadEntries,
  pathFromRows,
  requireActive,
  insertEntry,
  advanceSession,
}
