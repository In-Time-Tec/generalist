import { Effect, Schema } from "effect"
import { Session } from "@batonfx/core"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { CompletedSessionEntry } from "../../model-response-commit.js"
import type { InterruptedSessionEntry } from "../../agent-event.js"
import { handoffPayload, type HandoffSessionEntry } from "../../handoff-session.js"
import type { RunFn } from "./store-ops.js"
import { type EntryRow, type SessionRow } from "../session-store.js"
import { PostgresSessionStorage } from "./session-storage.js"

const {
  advanceSession,
  entryPayloadEquivalence,
  insertEntry,
  loadEntries,
  lockSession,
  pathFromRows,
  requireActive,
  storeError,
  toEntry,
} = PostgresSessionStorage

type Entry = Session.Entry
type EntryId = Session.EntryId
type AppendInput = Session.AppendInput
type AppendOptions = Session.AppendOptions
type CheckpointAppend = Session.CheckpointAppend
type CompactionEntry = Session.CompactionEntry

const appendMatches = (entry: Entry, input: AppendInput, parentId: EntryId | null): boolean =>
  entry.parentId === parentId && entryPayloadEquivalence(entry as Session.EntryPayload, input as Session.EntryPayload)

const completedPayload = (input: CompletedSessionEntry): Session.AppendInput => ({
  _tag: "Message",
  message: input.message,
  metadata: { modelResponseDigest: input.digest },
})

const interruptedPayload = (input: InterruptedSessionEntry): Session.AppendInput => ({
  _tag: "Message",
  message: input.message,
  metadata: { interruptionDigest: input.digest },
})

/** Append or verify one exact completed assistant projection in the caller's PostgreSQL transaction. */
export const appendCompletedSessionEntry = (
  input: CompletedSessionEntry,
): Effect.Effect<Session.Entry, Session.SessionConflict | Session.SessionStoreError | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const session = yield* lockSession(input.sessionId)
    const rows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = rows[0]
    const payload = completedPayload(input)
    if (existing !== undefined) {
      if (
        existing.parent_id !== input.parentId ||
        !entryPayloadEquivalence(toEntry(existing) as Session.EntryPayload, payload as Session.EntryPayload)
      ) {
        return yield* Session.SessionConflict.make({
          reason: "entry-id-reused",
          message: `Session entry id ${input.entryId} does not match the completed response`,
        })
      }
      const conflict = requireActive(yield* loadEntries(input.sessionId), session.leaf_id, input.entryId)
      if (conflict !== undefined) return yield* conflict
      return toEntry(existing)
    }
    if (session.leaf_id !== input.parentId) {
      return yield* Session.SessionConflict.make({
        reason: "stale-leaf",
        message: `Expected Session leaf ${String(input.parentId)} but found ${String(session.leaf_id)}`,
      })
    }
    yield* insertEntry({
      sessionId: input.sessionId,
      id: input.entryId,
      parentId: input.parentId,
      seq: Number(session.next_seq),
      tag: "Message",
      payload: payload as Session.EntryPayload,
    })
    yield* advanceSession({
      sessionId: input.sessionId,
      leafId: input.entryId,
      nextSeq: Number(session.next_seq) + 1,
    })
    return { ...payload, id: input.entryId, parentId: input.parentId } as Session.MessageEntry
  })

/** Verify an exact completed assistant projection in the caller's PostgreSQL transaction. */
export const verifyCompletedSessionEntry = (
  input: CompletedSessionEntry,
): Effect.Effect<void, Session.SessionConflict | Session.SessionStoreError | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const session = yield* lockSession(input.sessionId)
    const rows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = rows[0]
    if (
      existing === undefined ||
      existing.parent_id !== input.parentId ||
      !entryPayloadEquivalence(
        toEntry(existing) as Session.EntryPayload,
        completedPayload(input) as Session.EntryPayload,
      )
    ) {
      return yield* Session.SessionConflict.make({
        reason: "entry-id-reused",
        message: `Session entry id ${input.entryId} does not match the completed response`,
      })
    }
    const conflict = requireActive(yield* loadEntries(input.sessionId), session.leaf_id, input.entryId)
    if (conflict !== undefined) return yield* conflict
  })

/** Append or verify one exact nonempty interrupted assistant projection in the caller's transaction. */
export const appendInterruptedSessionEntry = (
  input: InterruptedSessionEntry,
): Effect.Effect<Session.Entry, Session.SessionConflict | Session.SessionStoreError | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const session = yield* lockSession(input.sessionId)
    const rows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = rows[0]
    const payload = interruptedPayload(input)
    if (existing !== undefined) {
      if (!entryPayloadEquivalence(toEntry(existing) as Session.EntryPayload, payload as Session.EntryPayload)) {
        return yield* Session.SessionConflict.make({
          reason: "entry-id-reused",
          message: `Session entry id ${input.entryId} was reused with different interrupted response content`,
        })
      }
      const conflict = requireActive(yield* loadEntries(input.sessionId), session.leaf_id, input.entryId)
      if (conflict !== undefined) return yield* conflict
      return toEntry(existing)
    }
    yield* insertEntry({
      sessionId: input.sessionId,
      id: input.entryId,
      parentId: session.leaf_id,
      seq: Number(session.next_seq),
      tag: "Message",
      payload: payload as Session.EntryPayload,
    })
    yield* advanceSession({
      sessionId: input.sessionId,
      leafId: input.entryId,
      nextSeq: Number(session.next_seq) + 1,
    })
    return { ...payload, id: input.entryId, parentId: session.leaf_id } as Session.MessageEntry
  })

export const verifyInterruptedSessionEntry = (
  input: InterruptedSessionEntry,
): Effect.Effect<void, Session.SessionConflict | Session.SessionStoreError | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const session = yield* lockSession(input.sessionId)
    const rows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = rows[0]
    if (
      existing === undefined ||
      !entryPayloadEquivalence(
        toEntry(existing) as Session.EntryPayload,
        interruptedPayload(input) as Session.EntryPayload,
      )
    ) {
      return yield* Session.SessionConflict.make({
        reason: "entry-id-reused",
        message: `Session entry id ${input.entryId} does not match the interrupted response`,
      })
    }
    const conflict = requireActive(yield* loadEntries(input.sessionId), session.leaf_id, input.entryId)
    if (conflict !== undefined) return yield* conflict
  })

/** Append or verify one exact handoff projection in the caller's PostgreSQL transaction. */
export const appendHandoffSessionEntry = (
  input: HandoffSessionEntry,
): Effect.Effect<
  Session.HandoffEntry,
  Session.SessionConflict | Session.SessionStoreError | SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const session = yield* lockSession(input.sessionId)
    const rows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = rows[0]
    const payload = handoffPayload(input)
    if (existing !== undefined) {
      if (
        existing.parent_id !== input.parentId ||
        !entryPayloadEquivalence(toEntry(existing) as Session.EntryPayload, payload as Session.EntryPayload)
      ) {
        return yield* Session.SessionConflict.make({
          reason: "entry-id-reused",
          message: `Session entry id ${input.entryId} does not match the handoff projection`,
        })
      }
      const conflict = requireActive(yield* loadEntries(input.sessionId), session.leaf_id, input.entryId)
      if (conflict !== undefined) return yield* conflict
      return toEntry(existing) as Session.HandoffEntry
    }
    if (session.leaf_id !== input.parentId) {
      return yield* Session.SessionConflict.make({
        reason: "stale-leaf",
        message: `Expected Session leaf ${String(input.parentId)} but found ${String(session.leaf_id)}`,
      })
    }
    yield* insertEntry({
      sessionId: input.sessionId,
      id: input.entryId,
      parentId: input.parentId,
      seq: Number(session.next_seq),
      tag: "Handoff",
      payload,
    })
    yield* advanceSession({
      sessionId: input.sessionId,
      leafId: input.entryId,
      nextSeq: Number(session.next_seq) + 1,
    })
    return { ...payload, id: input.entryId, parentId: input.parentId }
  })

export const verifyHandoffSessionEntry = (
  input: HandoffSessionEntry,
): Effect.Effect<void, Session.SessionConflict | Session.SessionStoreError | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const session = yield* lockSession(input.sessionId)
    const rows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = rows[0]
    if (
      existing === undefined ||
      existing.parent_id !== input.parentId ||
      !entryPayloadEquivalence(toEntry(existing) as Session.EntryPayload, handoffPayload(input) as Session.EntryPayload)
    ) {
      return yield* Session.SessionConflict.make({
        reason: "entry-id-reused",
        message: `Session entry id ${input.entryId} does not match the handoff projection`,
      })
    }
    const conflict = requireActive(yield* loadEntries(input.sessionId), session.leaf_id, input.entryId)
    if (conflict !== undefined) return yield* conflict
  })

const mapSessionError = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.mapError(effect, (error) =>
    Schema.is(Session.SessionConflict)(error) || Schema.is(Session.SessionStoreError)(error)
      ? error
      : storeError(String(error)),
  )

const mapReadError = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.mapError(effect, (error) => (Schema.is(Session.SessionStoreError)(error) ? error : storeError(String(error))))

/** Dialect-native durable PostgreSQL Session authority bound to one session identity. */
export const makePostgresSessionStore = (options: {
  readonly sessionId: string
  readonly run: RunFn
  readonly runNoTxn: RunFn
}): Session.Interface => {
  const { sessionId, run, runNoTxn } = options

  const append = (entry: AppendInput, appendOptions?: AppendOptions) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const session = yield* lockSession(sessionId)
      if (appendOptions?.id !== undefined) {
        const rows = yield* sql<EntryRow>`
          SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
          WHERE session_id = ${sessionId} AND entry_id = ${appendOptions.id}
        `
        const existing = rows[0]
        if (existing !== undefined) {
          const persisted = toEntry(existing)
          if (!appendMatches(persisted, entry, appendOptions.expectedLeafId)) {
            return yield* Session.SessionConflict.make({
              reason: "entry-id-reused",
              message: `Session entry id ${appendOptions.id} was reused with different parent or content`,
            })
          }
          const conflict = requireActive(yield* loadEntries(sessionId), session.leaf_id, persisted.id)
          if (conflict !== undefined) return yield* conflict
          return persisted
        }
      }
      if (appendOptions?.expectedLeafId !== undefined && appendOptions.expectedLeafId !== session.leaf_id) {
        return yield* Session.SessionConflict.make({
          reason: "stale-leaf",
          message: `Expected Session leaf ${String(appendOptions.expectedLeafId)} but found ${String(session.leaf_id)}`,
        })
      }
      let generatedSequence = Number(session.next_seq)
      if (appendOptions?.id === undefined) {
        while (true) {
          const collision = yield* sql<{ readonly entry_id: string }>`
            SELECT entry_id FROM baton_session_entries
            WHERE session_id = ${sessionId} AND entry_id = ${String(generatedSequence)}
          `
          if (collision[0] === undefined) break
          generatedSequence += 1
        }
      }
      const id = appendOptions?.id ?? String(generatedSequence)
      yield* insertEntry({
        sessionId,
        id,
        parentId: session.leaf_id,
        seq: Number(session.next_seq),
        tag: entry._tag,
        payload: entry as Session.EntryPayload,
      })
      yield* advanceSession({
        sessionId,
        leafId: id,
        nextSeq: appendOptions?.id === undefined ? generatedSequence + 1 : Number(session.next_seq) + 1,
        ...(appendOptions?.ownerToken === undefined ? {} : { ownerToken: appendOptions.ownerToken }),
      })
      return { ...entry, id, parentId: session.leaf_id } as Entry
    })

  const appendCheckpoint = (prepared: Session.PreparedCheckpoint) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const session = yield* lockSession(sessionId)
      const rows = yield* sql<EntryRow>`
        SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
        WHERE session_id = ${sessionId} AND entry_id = ${prepared.id}
      `
      const existing = rows[0]
      if (existing !== undefined) {
        const entry = toEntry(existing)
        if (entry._tag !== "Compaction" || !Session.checkpointMatches(entry, prepared)) {
          return yield* Session.SessionConflict.make({
            reason: "checkpoint-id-reused",
            message: `Session checkpoint id ${prepared.id} was reused with different content`,
          })
        }
        const conflict = requireActive(
          yield* loadEntries(sessionId),
          session.leaf_id,
          prepared.id,
          "checkpoint-not-on-active-path",
        )
        if (conflict !== undefined) return yield* conflict
        return {
          _tag: "AlreadyPresent",
          checkpoint: entry,
          leafId: session.leaf_id ?? entry.id,
        } as CheckpointAppend
      }
      if (prepared.compactionCommit !== undefined && prepared.compactionCommit.checkpointId !== prepared.id) {
        return yield* Session.SessionConflict.make({
          reason: "checkpoint-id-reused",
          message: `Compaction commit checkpoint id ${prepared.compactionCommit.checkpointId} does not match ${prepared.id}`,
        })
      }
      if (prepared.parentId !== session.leaf_id) {
        return yield* Session.SessionConflict.make({
          reason: "stale-leaf",
          message: `Expected Session leaf ${String(prepared.parentId)} but found ${String(session.leaf_id)}`,
        })
      }
      const checkpoint: CompactionEntry = {
        _tag: "Compaction",
        id: prepared.id,
        parentId: prepared.parentId,
        projectedHistory: prepared.projectedHistory,
        telemetry: prepared.telemetry,
        ...(prepared.compactionCommit === undefined ? {} : { compactionCommit: prepared.compactionCommit }),
        ...(prepared.summary === undefined ? {} : { summary: prepared.summary }),
      }
      yield* insertEntry({
        sessionId,
        id: checkpoint.id,
        parentId: checkpoint.parentId,
        seq: Number(session.next_seq),
        tag: "Compaction",
        payload: checkpoint as Session.EntryPayload,
      })
      yield* advanceSession({
        sessionId,
        leafId: checkpoint.id,
        nextSeq: Number(session.next_seq) + 1,
        ...(prepared.ownerToken === undefined ? {} : { ownerToken: prepared.ownerToken }),
      })
      return { _tag: "Appended", checkpoint, leafId: checkpoint.id } as CheckpointAppend
    })

  return Session.SessionStore.of({
    reserveEntryId: run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const session = yield* lockSession(sessionId)
        let sequence = Number(session.next_seq)
        while (true) {
          const collision = yield* sql<{ readonly entry_id: string }>`
            SELECT entry_id FROM baton_session_entries
            WHERE session_id = ${sessionId} AND entry_id = ${String(sequence)}
          `
          if (collision[0] === undefined) break
          sequence += 1
        }
        yield* advanceSession({ sessionId, leafId: session.leaf_id, nextSeq: sequence + 1 })
        return String(sequence)
      }),
    ).pipe(mapReadError),
    append: (entry, appendOptions) => run(append(entry, appendOptions)).pipe(mapSessionError),
    appendCheckpoint: (prepared) => run(appendCheckpoint(prepared)).pipe(mapSessionError),
    path: (leaf) =>
      runNoTxn(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const sessions = yield* sql<SessionRow>`
            SELECT leaf_id, next_seq, owner_token FROM baton_sessions WHERE session_id = ${sessionId}
          `
          return { target: leaf ?? sessions[0]?.leaf_id ?? null, rows: yield* loadEntries(sessionId) }
        }).pipe(
          Effect.flatMap(({ rows, target }) => {
            const path = pathFromRows(rows, target)
            return Schema.is(Session.SessionStoreError)(path) ? path : Effect.succeed(path)
          }),
        ),
      ).pipe(mapReadError),
    setLeaf: (id) =>
      run(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* lockSession(sessionId)
          if (id !== null) {
            const rows = yield* sql<{ readonly entry_id: string }>`
              SELECT entry_id FROM baton_session_entries WHERE session_id = ${sessionId} AND entry_id = ${id}
            `
            if (rows[0] === undefined) return yield* storeError(`Session entry ${id} does not exist`)
          }
          yield* sql`UPDATE baton_sessions SET leaf_id = ${id}, updated_at = NOW() WHERE session_id = ${sessionId}`
        }),
      ).pipe(mapReadError),
    leaf: Effect.orDie(
      runNoTxn(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          const rows = yield* sql<SessionRow>`
            SELECT leaf_id, next_seq, owner_token FROM baton_sessions WHERE session_id = ${sessionId}
          `
          return rows[0]?.leaf_id ?? null
        }),
      ),
    ),
  })
}
