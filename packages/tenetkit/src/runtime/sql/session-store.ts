import { DateTime, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Session } from "tenetkit"
import { decodeSessionPayload, encodeSessionPayload, sessionPayloadEquivalence } from "./session-payload-codec.js"
type Entry = Session.Entry
type EntryId = Session.EntryId
type AppendInput = Session.AppendInput
type AppendOptions = Session.AppendOptions
type CheckpointAppend = Session.CheckpointAppend
type CompactionEntry = Session.CompactionEntry
type PreparedCheckpoint = Session.PreparedCheckpoint
const entryPayloadEquivalence = sessionPayloadEquivalence
const appendMatches = (entry: Entry, input: AppendInput, parentId: EntryId | null): boolean =>
  entry.parentId === parentId && entryPayloadEquivalence(entry as Session.EntryPayload, input as Session.EntryPayload)
export interface EntryRow {
  readonly entry_id: string
  readonly parent_id: string | null
  readonly seq: number
  readonly tag: string
  readonly payload_json: string
}
export interface SessionRow {
  readonly leaf_id: string | null
  readonly next_seq: number
  readonly owner_token: string | null
}
const storeError = (message: string) => Session.SessionStoreError.make({ message })
const decodePayload = decodeSessionPayload
const encodePayload = encodeSessionPayload

const toEntry = (row: EntryRow): Entry => {
  const payload = decodePayload(row.payload_json)
  if (payload._tag !== row.tag) throw new Error(`Session entry ${row.entry_id} tag is corrupt`)
  return { ...payload, id: row.entry_id, parentId: row.parent_id } as Entry
}

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

const fromEntry = (entry: { readonly _tag: string } & Record<string, unknown>): string => {
  const { id: _id, parentId: _parentId, ...payload } = entry as Record<string, unknown>
  return encodePayload(payload as Session.EntryPayload)
}

/** @internal Shared SQL Session row codec used by dialect-native stores and atomic response commits. */
export const SessionStorage: {
  readonly entryPayloadEquivalence: (self: Session.EntryPayload, that: Session.EntryPayload) => boolean
  readonly storeError: (message: string) => Session.SessionStoreError
  readonly encodePayload: (payload: Session.EntryPayload) => string
  readonly toEntry: (row: EntryRow) => Entry
  readonly pathFromRows: typeof pathFromRows
  readonly requireActive: typeof requireActive
} = { entryPayloadEquivalence, storeError, encodePayload, toEntry, pathFromRows, requireActive }

/** Append or verify one stable interrupted assistant projection inside the caller's SQL transaction. */
export const appendInterruptedSessionEntry = (
  input: import("../agent-event.js").InterruptedSessionEntry,
): Effect.Effect<
  Session.Entry,
  Session.SessionConflict | Session.SessionStoreError | import("effect/unstable/sql/SqlError").SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const created = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    yield* sql`
      INSERT OR IGNORE INTO tenetkit_sessions (session_id, leaf_id, next_seq, owner_token, updated_at)
      VALUES (${input.sessionId}, NULL, 0, NULL, ${created})
    `
    const sessionRows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, owner_token FROM tenetkit_sessions WHERE session_id = ${input.sessionId}
    `
    const session = sessionRows[0]
    if (session === undefined) return yield* storeError(`Session ${input.sessionId} could not be initialized`)
    const payload: Session.AppendInput = {
      _tag: "ModelResponse",
      content: input.content,
      metadata: { interruptionDigest: input.digest },
    }
    const existingRows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = existingRows[0]
    if (existing !== undefined) {
      const entry = toEntry(existing)
      if (
        existing.parent_id !== input.parentId ||
        !entryPayloadEquivalence(entry as Session.EntryPayload, payload as Session.EntryPayload)
      ) {
        return yield* Session.SessionConflict.make({
          reason: "entry-id-reused",
          message: `Session entry id ${input.entryId} was reused with different interrupted response content`,
        })
      }
      const all = yield* sql<EntryRow>`
        SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
        WHERE session_id = ${input.sessionId} ORDER BY seq
      `
      const byId = new Map(all.map((row) => [row.entry_id, row] as const))
      let cursor = session.leaf_id
      let active = false
      for (let count = 0; cursor !== null && count <= all.length; count += 1) {
        if (cursor === input.entryId) active = true
        cursor = byId.get(cursor)?.parent_id ?? null
      }
      if (!active) {
        return yield* Session.SessionConflict.make({
          reason: "stale-leaf",
          message: `Session entry id ${input.entryId} is not on the active path`,
        })
      }
      return entry
    }
    if (session.leaf_id !== input.parentId) {
      return yield* Session.SessionConflict.make({
        reason: "stale-leaf",
        message: `Expected Session leaf ${String(input.parentId)} but found ${String(session.leaf_id)}`,
      })
    }
    yield* sql`
      INSERT INTO tenetkit_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${input.sessionId}, ${input.entryId}, ${input.parentId}, ${session.next_seq}, 'ModelResponse',
        ${encodePayload(payload as Session.EntryPayload)}, ${created})
    `
    yield* sql`
      UPDATE tenetkit_sessions SET leaf_id = ${input.entryId}, next_seq = ${session.next_seq + 1}, updated_at = ${created}
      WHERE session_id = ${input.sessionId}
    `
    return { ...payload, id: input.entryId, parentId: input.parentId } as Session.ModelResponseEntry
  })

export const verifyInterruptedSessionEntry = (
  input: import("../agent-event.js").InterruptedSessionEntry,
): Effect.Effect<
  void,
  Session.SessionConflict | Session.SessionStoreError | import("effect/unstable/sql/SqlError").SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sessionRows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, owner_token FROM tenetkit_sessions WHERE session_id = ${input.sessionId}
    `
    const session = sessionRows[0]
    const existingRows = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
      WHERE session_id = ${input.sessionId} AND entry_id = ${input.entryId}
    `
    const existing = existingRows[0]
    const payload: Session.AppendInput = {
      _tag: "ModelResponse",
      content: input.content,
      metadata: { interruptionDigest: input.digest },
    }
    if (
      session === undefined ||
      existing === undefined ||
      existing.parent_id !== input.parentId ||
      !entryPayloadEquivalence(toEntry(existing) as Session.EntryPayload, payload as Session.EntryPayload)
    ) {
      return yield* Session.SessionConflict.make({
        reason: "entry-id-reused",
        message: `Session entry id ${input.entryId} does not match the interrupted response`,
      })
    }
    const all = yield* sql<EntryRow>`
      SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
      WHERE session_id = ${input.sessionId} ORDER BY seq
    `
    const byId = new Map(all.map((row) => [row.entry_id, row] as const))
    let cursor = session.leaf_id
    for (let count = 0; cursor !== null && count <= all.length; count += 1) {
      if (cursor === input.entryId) return
      cursor = byId.get(cursor)?.parent_id ?? null
    }
    return yield* Session.SessionConflict.make({
      reason: "stale-leaf",
      message: `Session entry id ${input.entryId} is not on the active path`,
    })
  })

/**
 * @experimental Durable single-writer Session store.
 *
 * Session owns model-facing conversation history, so a durable Runtime must persist it beside its
 * Runs rather than rebuilding it from execution records. Entries are append-only and immutable; a
 * leaf pointer names the current position, which is what makes branching a pointer move instead of
 * a rewrite. `owner_token` fences a stale writer out of a session an newer owner has taken over.
 */
export const makeSqliteSessionStore = (options: {
  readonly sessionId: string
}): Effect.Effect<Session.Interface, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const now = DateTime.now.pipe(Effect.map(DateTime.formatIso))

    const sessionRow = Effect.gen(function* () {
      const rows = yield* sql<SessionRow>`
        SELECT leaf_id, next_seq, owner_token FROM tenetkit_sessions WHERE session_id = ${options.sessionId}
      `
      return rows[0]
    })

    const ensureSession = Effect.gen(function* () {
      const existing = yield* sessionRow
      if (existing !== undefined) return existing
      const created = yield* now
      yield* sql`
        INSERT OR IGNORE INTO tenetkit_sessions (session_id, leaf_id, next_seq, owner_token, updated_at)
        VALUES (${options.sessionId}, NULL, 0, NULL, ${created})
      `
      return (yield* sessionRow) ?? { leaf_id: null, next_seq: 0, owner_token: null }
    })

    const entriesFor = Effect.gen(function* () {
      const rows = yield* sql<EntryRow>`
        SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
        WHERE session_id = ${options.sessionId} ORDER BY seq
      `
      return rows
    })

    const pathTo = (leaf: EntryId | null) =>
      Effect.gen(function* () {
        if (leaf === null) return [] as ReadonlyArray<Entry>
        const rows = yield* entriesFor
        const byId = new Map(rows.map((row) => [row.entry_id, row] as const))
        const walked: Array<Entry> = []
        let cursor: string | null = leaf
        while (cursor !== null) {
          if (walked.length > rows.length) return yield* storeError(`Session path for leaf ${leaf} contains a cycle`)
          const row: EntryRow | undefined = byId.get(cursor)
          if (row === undefined) return yield* storeError(`Session entry ${cursor} does not exist`)
          walked.push(toEntry(row))
          cursor = row.parent_id
        }
        return walked.toReversed() as ReadonlyArray<Entry>
      })

    /**
     * Ownership succeeds rather than excludes. A Session lane is serialized by the Run store, so
     * sequential Runs on one session identity legitimately take over from each other. A genuinely
     * stale writer carries an outdated leaf and is rejected by the stale-leaf check instead.
     */
    const claim = (ownerToken: string | undefined, updated: string) =>
      ownerToken === undefined
        ? Effect.void
        : sql`UPDATE tenetkit_sessions SET owner_token = ${ownerToken}, updated_at = ${updated} WHERE session_id = ${options.sessionId}`

    const insertEntry = (input: {
      readonly id: string
      readonly parentId: string | null
      readonly seq: number
      readonly tag: string
      readonly payload: string
      readonly created: string
    }) => sql`
      INSERT INTO tenetkit_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${options.sessionId}, ${input.id}, ${input.parentId}, ${input.seq}, ${input.tag}, ${input.payload}, ${input.created})
    `

    const advance = (leafId: string | null, nextSeq: number, updated: string) => sql`
      UPDATE tenetkit_sessions SET leaf_id = ${leafId}, next_seq = ${nextSeq}, updated_at = ${updated}
      WHERE session_id = ${options.sessionId}
    `

    const asStoreError = <A, E>(
      effect: Effect.Effect<A, E>,
    ): Effect.Effect<A, Session.SessionConflict | Session.SessionStoreError> =>
      Effect.mapError(effect, (error) =>
        Schema.is(Session.SessionConflict)(error) || Schema.is(Session.SessionStoreError)(error)
          ? error
          : storeError(String(error)),
      )

    const asReadError = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, Session.SessionStoreError> =>
      Effect.mapError(effect, (error) =>
        Schema.is(Session.SessionStoreError)(error) ? error : storeError(String(error)),
      )

    const append = (entry: AppendInput, appendOptions?: AppendOptions) =>
      sql.withTransaction(
        Effect.gen(function* () {
          const session = yield* ensureSession
          if (appendOptions?.id !== undefined) {
            const rows = yield* sql<EntryRow>`
              SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
              WHERE session_id = ${options.sessionId} AND entry_id = ${appendOptions.id}
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
              const activePath = yield* pathTo(session.leaf_id)
              if (!activePath.some((active) => active.id === persisted.id)) {
                return yield* Session.SessionConflict.make({
                  reason: "stale-leaf",
                  message: `Session entry id ${appendOptions.id} is not on the active path from ${String(session.leaf_id)}`,
                })
              }
              return persisted
            }
          }
          if (appendOptions?.expectedLeafId !== undefined && appendOptions.expectedLeafId !== session.leaf_id) {
            return yield* Session.SessionConflict.make({
              reason: "stale-leaf",
              message: `Expected Session leaf ${String(appendOptions.expectedLeafId)} but found ${String(session.leaf_id)}`,
            })
          }
          const created = yield* now
          let generatedSequence = session.next_seq
          if (appendOptions?.id === undefined) {
            const ids = new Set((yield* entriesFor).map((row) => row.entry_id))
            while (ids.has(String(generatedSequence))) generatedSequence += 1
          }
          const id = appendOptions?.id ?? String(generatedSequence)
          yield* insertEntry({
            id,
            parentId: session.leaf_id,
            seq: session.next_seq,
            tag: entry._tag,
            payload: fromEntry(entry as never),
            created,
          })
          yield* advance(id, appendOptions?.id === undefined ? generatedSequence + 1 : session.next_seq + 1, created)
          yield* claim(appendOptions?.ownerToken, created)
          return { ...entry, id, parentId: session.leaf_id } as Entry
        }),
      )

    const appendCheckpoint = (prepared: PreparedCheckpoint) =>
      sql.withTransaction(
        Effect.gen(function* () {
          const session = yield* ensureSession
          const rows = yield* sql<EntryRow>`
            SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
            WHERE session_id = ${options.sessionId} AND entry_id = ${prepared.id}
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
            return {
              _tag: "AlreadyPresent",
              checkpoint: entry,
              leafId: session.leaf_id ?? entry.id,
            } as CheckpointAppend
          }
          if (prepared.parentId !== session.leaf_id) {
            return yield* Session.SessionConflict.make({
              reason: "stale-leaf",
              message: `Expected Session leaf ${String(prepared.parentId)} but found ${String(session.leaf_id)}`,
            })
          }
          const created = yield* now
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
            id: checkpoint.id,
            parentId: checkpoint.parentId,
            seq: session.next_seq,
            tag: "Compaction",
            payload: fromEntry(checkpoint as never),
            created,
          })
          yield* advance(checkpoint.id, session.next_seq + 1, created)
          yield* claim(prepared.ownerToken, created)
          return { _tag: "Appended", checkpoint, leafId: checkpoint.id } as CheckpointAppend
        }),
      )

    return Session.SessionStore.of({
      reserveEntryId: Effect.orDie(
        sql.withTransaction(
          Effect.gen(function* () {
            const session = yield* ensureSession
            const ids = new Set((yield* entriesFor).map((row) => row.entry_id))
            let sequence = session.next_seq
            while (ids.has(String(sequence))) sequence += 1
            const created = yield* now
            yield* advance(session.leaf_id, sequence + 1, created)
            return String(sequence)
          }),
        ),
      ).pipe(Effect.catchDefect((defect) => storeError(String(defect)))),
      append: (entry, appendOptions) => asStoreError(append(entry, appendOptions)),
      appendCheckpoint: (prepared) => asStoreError(appendCheckpoint(prepared)),
      path: (leaf) =>
        Effect.gen(function* () {
          const session = yield* ensureSession
          return yield* pathTo(leaf ?? session.leaf_id)
        }).pipe(asReadError),
      setLeaf: (id) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* ensureSession
              if (id !== null) {
                const rows = yield* sql<{ readonly entry_id: string }>`
                  SELECT entry_id FROM tenetkit_session_entries
                  WHERE session_id = ${options.sessionId} AND entry_id = ${id}
                `
                if (rows[0] === undefined) return yield* storeError(`Session entry ${id} does not exist`)
              }
              const updated = yield* now
              yield* sql`
                UPDATE tenetkit_sessions SET leaf_id = ${id}, updated_at = ${updated} WHERE session_id = ${options.sessionId}
              `
            }),
          )
          .pipe(asReadError),
      leaf: ensureSession.pipe(
        Effect.map((session) => session.leaf_id),
        Effect.orDie,
      ),
    })
  })

/** @experimental Durable SQLite Session store bound to one session identity. */
export const layerSqliteSessionStore = (options: {
  readonly sessionId: string
}): Layer.Layer<Session.SessionStore, never, SqlClient.SqlClient> =>
  Layer.effect(Session.SessionStore, makeSqliteSessionStore(options))
