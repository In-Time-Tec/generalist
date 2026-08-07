import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Session } from "@batonfx/core"
type Entry = Session.Entry
type EntryId = Session.EntryId
type AppendInput = Session.AppendInput
type AppendOptions = Session.AppendOptions
type CheckpointAppend = Session.CheckpointAppend
type CompactionEntry = Session.CompactionEntry
type PreparedCheckpoint = Session.PreparedCheckpoint

interface EntryRow {
  readonly entry_id: string
  readonly parent_id: string | null
  readonly seq: number
  readonly payload_json: string
}

interface SessionRow {
  readonly leaf_id: string | null
  readonly next_seq: number
  readonly owner_token: string | null
}

const storeError = (message: string) => Session.SessionStoreError.make({ message })

const decodePayload = Schema.decodeUnknownSync(Session.EntryPayload)
const encodePayload = Schema.encodeSync(Session.EntryPayload)

const toEntry = (row: EntryRow): Entry =>
  ({
    ...decodePayload(JSON.parse(row.payload_json) as unknown),
    id: row.entry_id,
    parentId: row.parent_id,
  }) as Entry

const fromEntry = (entry: { readonly _tag: string } & Record<string, unknown>): string => {
  const { id: _id, parentId: _parentId, ...payload } = entry as Record<string, unknown>
  return JSON.stringify(encodePayload(payload as Session.EntryPayload)) ?? "null"
}

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

    const now = Effect.sync(() => new Date().toISOString())

    const sessionRow = Effect.gen(function* () {
      const rows = yield* sql<SessionRow>`
        SELECT leaf_id, next_seq, owner_token FROM baton_sessions WHERE session_id = ${options.sessionId}
      `
      return rows[0]
    })

    const ensureSession = Effect.gen(function* () {
      const existing = yield* sessionRow
      if (existing !== undefined) return existing
      const created = yield* now
      yield* sql`
        INSERT OR IGNORE INTO baton_sessions (session_id, leaf_id, next_seq, owner_token, updated_at)
        VALUES (${options.sessionId}, NULL, 0, NULL, ${created})
      `
      return (yield* sessionRow) ?? { leaf_id: null, next_seq: 0, owner_token: null }
    })

    const entriesFor = Effect.gen(function* () {
      const rows = yield* sql<EntryRow>`
        SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
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
        : sql`UPDATE baton_sessions SET owner_token = ${ownerToken}, updated_at = ${updated} WHERE session_id = ${options.sessionId}`

    const insertEntry = (input: {
      readonly id: string
      readonly parentId: string | null
      readonly seq: number
      readonly tag: string
      readonly payload: string
      readonly created: string
    }) => sql`
      INSERT INTO baton_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${options.sessionId}, ${input.id}, ${input.parentId}, ${input.seq}, ${input.tag}, ${input.payload}, ${input.created})
    `

    const advance = (leafId: string | null, nextSeq: number, updated: string) => sql`
      UPDATE baton_sessions SET leaf_id = ${leafId}, next_seq = ${nextSeq}, updated_at = ${updated}
      WHERE session_id = ${options.sessionId}
    `

    const asStoreError = <A, E>(effect: Effect.Effect<A, E>) =>
      Effect.catchIf(
        effect,
        (error): error is Exclude<E, Session.SessionConflict | Session.SessionStoreError> =>
          !Schema.is(Session.SessionConflict)(error) && !Schema.is(Session.SessionStoreError)(error),
        (error) => storeError(String(error)),
      ) as Effect.Effect<A, Session.SessionConflict | Session.SessionStoreError>

    const asReadError = <A, E>(effect: Effect.Effect<A, E>) =>
      Effect.catchIf(
        effect,
        (error): error is Exclude<E, Session.SessionStoreError> => !Schema.is(Session.SessionStoreError)(error),
        (error) => storeError(String(error)),
      ) as Effect.Effect<A, Session.SessionStoreError>

    const append = (entry: AppendInput, appendOptions?: AppendOptions) =>
      sql.withTransaction(
        Effect.gen(function* () {
          const session = yield* ensureSession
          if (appendOptions?.expectedLeafId !== undefined && appendOptions.expectedLeafId !== session.leaf_id) {
            return yield* Session.SessionConflict.make({
              reason: "stale-leaf",
              message: `Expected Session leaf ${String(appendOptions.expectedLeafId)} but found ${String(session.leaf_id)}`,
            })
          }
          const created = yield* now
          const id = String(session.next_seq)
          yield* insertEntry({
            id,
            parentId: session.leaf_id,
            seq: session.next_seq,
            tag: entry._tag,
            payload: fromEntry(entry as never),
            created,
          })
          yield* advance(id, session.next_seq + 1, created)
          yield* claim(appendOptions?.ownerToken, created)
          return { ...entry, id, parentId: session.leaf_id } as Entry
        }),
      )

    const appendCheckpoint = (prepared: PreparedCheckpoint) =>
      sql.withTransaction(
        Effect.gen(function* () {
          const session = yield* ensureSession
          const rows = yield* sql<EntryRow>`
            SELECT entry_id, parent_id, seq, payload_json FROM baton_session_entries
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
            const created = yield* now
            yield* advance(session.leaf_id, session.next_seq + 1, created)
            return String(session.next_seq)
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
                  SELECT entry_id FROM baton_session_entries
                  WHERE session_id = ${options.sessionId} AND entry_id = ${id}
                `
                if (rows[0] === undefined) return yield* storeError(`Session entry ${id} does not exist`)
              }
              const updated = yield* now
              yield* sql`
                UPDATE baton_sessions SET leaf_id = ${id}, updated_at = ${updated} WHERE session_id = ${options.sessionId}
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
