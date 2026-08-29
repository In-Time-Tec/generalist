import { Effect } from "effect"
import { Session } from "tenetkit"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { type EntryRow, type SessionRow, SessionStorage } from "tenetkit/runtime/driver/sql/session/storage"
import type { SessionWriteClaim } from "tenetkit/runtime/driver/run/store"
import { StaleSessionClaim } from "tenetkit/runtime/driver/sql/errors"

const { encodePayload, entryPayloadEquivalence, pathFromRows, requireActive, storeError, toEntry } = SessionStorage

const lockSession = (
  sessionId: string,
): Effect.Effect<SessionRow, Session.SessionStoreError | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
      FROM tenetkit_sessions
      WHERE session_id = ${sessionId}
      FOR UPDATE
    `
    const row = rows[0]
    return row === undefined ? yield* storeError(`Session ${sessionId} could not be initialized`) : row
  })

const lockClaimedSession = (
  claim: SessionWriteClaim,
): Effect.Effect<SessionRow, StaleSessionClaim | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
      FROM tenetkit_sessions
      WHERE session_id = ${claim.sessionId}
        AND writer_epoch = ${claim.epoch}
        AND writer_run_id = ${claim.runId}
        AND writer_owner_id = ${claim.ownerId}
        AND writer_attempt_fence = ${claim.runAttemptFence}
      FOR UPDATE
    `
    return rows[0] ?? (yield* StaleSessionClaim.make(claim))
  })

const loadEntries = (sessionId: string): Effect.Effect<ReadonlyArray<EntryRow>, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
      WHERE session_id = ${sessionId} ORDER BY seq
    `
  })

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
      INSERT INTO tenetkit_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${input.sessionId}, ${input.id}, ${input.parentId}, ${input.seq}, ${input.tag},
        ${encodePayload(input.payload)}, NOW())
    `
  })

const advanceSession = (input: {
  readonly sessionId: string
  readonly leafId: string | null
  readonly nextSeq: number
}): Effect.Effect<void, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE tenetkit_sessions SET leaf_id = ${input.leafId}, next_seq = ${input.nextSeq}, updated_at = NOW()
      WHERE session_id = ${input.sessionId}
    `
  })

interface PostgresSessionStorage {
  readonly encodePayload: (payload: Session.EntryPayload) => string
  readonly entryPayloadEquivalence: (self: Session.EntryPayload, that: Session.EntryPayload) => boolean
  readonly storeError: (message: string) => Session.SessionStoreError
  readonly toEntry: (row: EntryRow) => Session.Entry
  readonly lockSession: (
    sessionId: string,
  ) => Effect.Effect<SessionRow, Session.SessionStoreError | SqlError, SqlClient.SqlClient>
  readonly lockClaimedSession: (
    claim: SessionWriteClaim,
  ) => Effect.Effect<SessionRow, StaleSessionClaim | SqlError, SqlClient.SqlClient>
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
}

export const PostgresSessionStorage: PostgresSessionStorage = {
  encodePayload,
  entryPayloadEquivalence,
  storeError,
  toEntry,
  lockSession,
  lockClaimedSession,
  loadEntries,
  pathFromRows,
  requireActive,
  insertEntry,
  advanceSession,
}
