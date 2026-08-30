import { DateTime, Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Session } from "../../../core/index.js"
import type { ExecutionClaim, SessionReader } from "../../run/store.js"
import { StaleSessionClaim } from "../errors.js"
import { requireSessionWriteClaim } from "./claim.js"
import { type EntryRow, type SessionRow, SessionStorage } from "./storage.js"
type Entry = Session.Entry
type EntryId = Session.EntryId
type AppendInput = Session.AppendInput
type AppendOptions = Session.AppendOptions
type CompactionEntry = Session.CompactionEntry
const { appendMatches, entryPayloadEquivalence, storeError, encodePayload, fromEntry, toEntry, pathFromRows } =
  SessionStorage

/** Append or verify one stable interrupted assistant projection inside the caller's SQL transaction. */
export const appendInterruptedSessionEntry = (
  input: import("../../execution/agent/event.js").InterruptedSessionEntry,
): Effect.Effect<
  Session.Entry,
  Session.SessionConflict | Session.SessionStoreError | import("effect/unstable/sql/SqlError").SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const created = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    const sessionRows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
      FROM tenetkit_sessions WHERE session_id = ${input.sessionId}
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
      if (existing.parent_id !== input.parentId || !entryPayloadEquivalence(entry, payload)) {
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
        ${encodePayload(payload)}, ${created})
    `
    yield* sql`
      UPDATE tenetkit_sessions SET leaf_id = ${input.entryId}, next_seq = ${session.next_seq + 1}, updated_at = ${created}
      WHERE session_id = ${input.sessionId}
    `
    return { ...payload, id: input.entryId, parentId: input.parentId }
  })

export const verifyInterruptedSessionEntry = (
  input: import("../../execution/agent/event.js").InterruptedSessionEntry,
): Effect.Effect<
  void,
  Session.SessionConflict | Session.SessionStoreError | import("effect/unstable/sql/SqlError").SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sessionRows = yield* sql<SessionRow>`
      SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
      FROM tenetkit_sessions WHERE session_id = ${input.sessionId}
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
      !entryPayloadEquivalence(toEntry(existing), payload)
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
 * a rewrite. Runtime supplies an exact storage-issued Session write claim for every mutation.
 */
export const claimedStore = (options: {
  readonly claim: ExecutionClaim
}): Effect.Effect<Session.Service, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sessionId = options.claim.session.sessionId
    const requireWriteClaim = requireSessionWriteClaim(options.claim.session).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
    )

    const now = DateTime.now.pipe(Effect.map(DateTime.formatIso))

    const sessionRow = Effect.gen(function* () {
      const rows = yield* sql<SessionRow>`
        SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
        FROM tenetkit_sessions WHERE session_id = ${sessionId}
      `
      return rows[0]
    })

    const requireSession = sessionRow.pipe(
      Effect.flatMap((session) =>
        session === undefined
          ? Effect.fail(storeError(`Session ${sessionId} is unavailable`))
          : Effect.succeed(session),
      ),
    )

    const entriesFor = Effect.gen(function* () {
      const rows = yield* sql<EntryRow>`
        SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
        WHERE session_id = ${sessionId} ORDER BY seq
      `
      return rows
    })

    const pathTo = (leaf: EntryId | null) =>
      Effect.gen(function* () {
        if (leaf === null) {
          const empty: ReadonlyArray<Entry> = []
          return empty
        }
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
        return walked.toReversed()
      })

    const insertEntry = (input: {
      readonly id: string
      readonly parentId: string | null
      readonly seq: number
      readonly tag: string
      readonly payload: string
      readonly created: string
    }) => sql`
      INSERT INTO tenetkit_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      VALUES (${sessionId}, ${input.id}, ${input.parentId}, ${input.seq}, ${input.tag}, ${input.payload}, ${input.created})
    `

    const advance = (leafId: string | null, nextSeq: number, updated: string) => sql`
      UPDATE tenetkit_sessions SET leaf_id = ${leafId}, next_seq = ${nextSeq}, updated_at = ${updated}
      WHERE session_id = ${sessionId}
    `

    const asStoreError = <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, Session.SessionConflict | Session.SessionStoreError, R> =>
      Effect.mapError(effect, (error) => {
        if (Schema.is(StaleSessionClaim)(error)) return storeError("Session write claim is stale")
        if (Schema.is(Session.SessionConflict)(error) || Schema.is(Session.SessionStoreError)(error)) return error
        return storeError(String(error))
      })

    const asReserveError = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, Session.SessionStoreError, R> =>
      Effect.mapError(effect, (error) => {
        if (Schema.is(StaleSessionClaim)(error)) return storeError("Session write claim is stale")
        if (Schema.is(Session.SessionStoreError)(error)) return error
        return storeError(String(error))
      })

    const asReadError = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, Session.SessionStoreError, R> =>
      Effect.mapError(effect, (error) =>
        Schema.is(Session.SessionStoreError)(error) ? error : storeError(String(error)),
      )

    const findExistingAppend = (entry: AppendInput, appendOptions: AppendOptions, session: SessionRow) =>
      Effect.gen(function* () {
        if (appendOptions.id === undefined) return undefined
        const rows = yield* sql<EntryRow>`
          SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
          WHERE session_id = ${sessionId} AND entry_id = ${appendOptions.id}
        `
        const existing = rows[0]
        if (existing === undefined) return undefined
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
      })

    const append = (entry: AppendInput, appendOptions: AppendOptions = {}) =>
      sql.withTransaction(
        Effect.gen(function* () {
          yield* requireWriteClaim
          const session = yield* requireSession
          const existing = yield* findExistingAppend(entry, appendOptions, session)
          if (existing !== undefined) return existing
          if (appendOptions.expectedLeafId !== undefined && appendOptions.expectedLeafId !== session.leaf_id) {
            return yield* Session.SessionConflict.make({
              reason: "stale-leaf",
              message: `Expected Session leaf ${String(appendOptions.expectedLeafId)} but found ${String(session.leaf_id)}`,
            })
          }
          const created = yield* now
          let generatedSequence = session.next_seq
          if (appendOptions.id === undefined) {
            const ids = new Set((yield* entriesFor).map((row) => row.entry_id))
            while (ids.has(String(generatedSequence))) generatedSequence += 1
          }
          const id = appendOptions.id ?? String(generatedSequence)
          yield* insertEntry({
            id,
            parentId: session.leaf_id,
            seq: session.next_seq,
            tag: entry._tag,
            payload: fromEntry(entry),
            created,
          })
          yield* advance(id, appendOptions.id === undefined ? generatedSequence + 1 : session.next_seq + 1, created)
          return { ...entry, id, parentId: session.leaf_id }
        }),
      )

    const appendCheckpoint = (prepared: Session.PreparedCheckpoint) =>
      sql.withTransaction(
        Effect.gen(function* () {
          yield* requireWriteClaim
          const session = yield* requireSession
          const rows = yield* sql<EntryRow>`
            SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
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
            return {
              _tag: "AlreadyPresent" as const,
              checkpoint: entry,
              leafId: session.leaf_id ?? entry.id,
            }
          }
          if (prepared.parentId !== session.leaf_id) {
            return yield* Session.SessionConflict.make({
              reason: "stale-leaf",
              message: `Expected Session leaf ${String(prepared.parentId)} but found ${String(session.leaf_id)}`,
            })
          }
          const created = yield* now
          const checkpointRequired: Pick<
            CompactionEntry,
            "_tag" | "id" | "parentId" | "projectedHistory" | "telemetry"
          > = {
            _tag: "Compaction",
            id: prepared.id,
            parentId: prepared.parentId,
            projectedHistory: prepared.projectedHistory,
            telemetry: prepared.telemetry,
          }
          const checkpointWithCommit: CompactionEntry =
            prepared.compactionCommit === undefined
              ? checkpointRequired
              : { ...checkpointRequired, compactionCommit: prepared.compactionCommit }
          const checkpoint: CompactionEntry =
            prepared.summary === undefined
              ? checkpointWithCommit
              : { ...checkpointWithCommit, summary: prepared.summary }
          yield* insertEntry({
            id: checkpoint.id,
            parentId: checkpoint.parentId,
            seq: session.next_seq,
            tag: "Compaction",
            payload: fromEntry(checkpoint),
            created,
          })
          yield* advance(checkpoint.id, session.next_seq + 1, created)
          return { _tag: "Appended" as const, checkpoint, leafId: checkpoint.id }
        }),
      )

    return {
      reserveEntryId: asReserveError(
        sql.withTransaction(
          Effect.gen(function* () {
            yield* requireWriteClaim
            const session = yield* requireSession
            const ids = new Set((yield* entriesFor).map((row) => row.entry_id))
            let sequence = session.next_seq
            while (ids.has(String(sequence))) sequence += 1
            const created = yield* now
            yield* advance(session.leaf_id, sequence + 1, created)
            return String(sequence)
          }),
        ),
      ),
      append: (entry, appendOptions) => asStoreError(append(entry, appendOptions)),
      appendCheckpoint: (prepared) => asStoreError(appendCheckpoint(prepared)),
      path: (leaf) =>
        Effect.gen(function* () {
          const session = yield* sessionRow
          if (session === undefined)
            return leaf === undefined ? [] : yield* storeError(`Session ${sessionId} is unavailable`)
          return yield* pathTo(leaf ?? session.leaf_id)
        }).pipe(asReadError),
      setLeaf: (id) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              yield* requireWriteClaim
              yield* requireSession
              if (id !== null) {
                const rows = yield* sql<{ readonly entry_id: string }>`
                  SELECT entry_id FROM tenetkit_session_entries
                  WHERE session_id = ${sessionId} AND entry_id = ${id}
                `
                if (rows[0] === undefined) return yield* storeError(`Session entry ${id} does not exist`)
              }
              const updated = yield* now
              yield* sql`
                UPDATE tenetkit_sessions SET leaf_id = ${id}, updated_at = ${updated} WHERE session_id = ${sessionId}
              `
            }),
          )
          .pipe(asReserveError),
      leaf: sessionRow.pipe(
        Effect.map((session) => session?.leaf_id ?? null),
        Effect.orDie,
      ),
    }
  })

/** @internal Read-only SQLite Session hydration. */
export const reader = (sessionId: string): Effect.Effect<SessionReader, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sessionRow = Effect.gen(function* () {
      const rows = yield* sql<SessionRow>`
        SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
        FROM tenetkit_sessions WHERE session_id = ${sessionId}
      `
      return rows[0]
    })
    return {
      path: (leaf) =>
        sessionRow.pipe(
          Effect.flatMap((session) => {
            if (session === undefined && leaf === undefined) return Effect.succeed([])
            if (session === undefined) return storeError(`Session entry ${String(leaf)} does not exist`)
            return sql<EntryRow>`
              SELECT entry_id, parent_id, seq, tag, payload_json FROM tenetkit_session_entries
              WHERE session_id = ${sessionId} ORDER BY seq
            `.pipe(
              Effect.flatMap((rows) => {
                const path = pathFromRows(rows, leaf ?? session.leaf_id)
                return Schema.is(Session.SessionStoreError)(path) ? path : Effect.succeed(path)
              }),
            )
          }),
          Effect.mapError((error) => (Schema.is(Session.SessionStoreError)(error) ? error : storeError(String(error)))),
        ),
      leaf: sessionRow.pipe(
        Effect.map((session) => session?.leaf_id ?? null),
        Effect.orDie,
      ),
    }
  })
