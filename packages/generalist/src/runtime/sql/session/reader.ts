import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { type CompactionEntry, type Entry, type EntryId, SessionStoreError } from "../../../core/context/session.js"
import type { PathPage, PathPageInput } from "../../../core/context/session-history.js"
import type { SessionReader } from "../../run/store.js"
import { type EntryRow, type SessionRow, SessionStorage } from "./storage.js"

const { storeError, decodeSession, toEntry, pathFromRows } = SessionStorage
type ReadEntry = (id: EntryId) => Effect.Effect<Entry | undefined, SessionStoreError>

const readPathPage = (entry: ReadEntry, input: PathPageInput): Effect.Effect<PathPage, SessionStoreError> =>
  Effect.gen(function* () {
    if (input.limit < 1 || !Number.isSafeInteger(input.limit)) {
      return yield* storeError("Session path page limit must be positive")
    }
    if (input.cursor !== undefined && input.cursor.leafId !== input.leafId) {
      return yield* storeError("Session path page cursor belongs to a different leaf")
    }
    if (input.leafId === null) {
      return input.cursor === undefined
        ? { entries: [], hasOlder: false, hasNewer: false }
        : yield* storeError("An empty Session path cannot have a page cursor")
    }
    const newestFirst: Array<Entry> = []
    const seen = new Set<string>()
    let cursor: string | null = input.cursor?.entryId ?? input.leafId
    while (cursor !== null && newestFirst.length <= input.limit) {
      if (seen.has(cursor)) return yield* storeError(`Session path for leaf ${input.leafId} contains a cycle`)
      seen.add(cursor)
      const found: Entry | undefined = yield* entry(cursor)
      if (found === undefined) return yield* storeError(`Session entry ${cursor} does not exist`)
      newestFirst.push(found)
      cursor = found.parentId
    }
    const hasOlder = newestFirst.length > input.limit
    const entries = newestFirst.slice(0, input.limit).toReversed()
    const nextEntryId = newestFirst.at(input.limit)?.id
    return nextEntryId !== undefined
      ? {
          entries,
          hasOlder,
          hasNewer: input.cursor !== undefined,
          nextCursor: { leafId: input.leafId, entryId: nextEntryId },
        }
      : { entries, hasOlder, hasNewer: input.cursor !== undefined }
  })

const readEffectivePath = (
  entry: ReadEntry,
  leaf: EntryId | null,
): Effect.Effect<ReadonlyArray<Entry>, SessionStoreError> =>
  Effect.gen(function* () {
    if (leaf === null) return []
    const newestFirst: Array<Entry> = []
    const seen = new Set<string>()
    let cursor: string | null = leaf
    while (cursor !== null) {
      if (seen.has(cursor)) return yield* storeError(`Session path for leaf ${leaf} contains a cycle`)
      seen.add(cursor)
      const found: Entry | undefined = yield* entry(cursor)
      if (found === undefined) return yield* storeError(`Session entry ${cursor} does not exist`)
      newestFirst.push(found)
      if (found._tag === "Compaction" || found._tag === "Handoff") break
      cursor = found.parentId
    }
    return newestFirst.toReversed()
  })

const readLatestCompaction = (
  entry: ReadEntry,
  leaf: EntryId | null,
): Effect.Effect<CompactionEntry | undefined, SessionStoreError> =>
  Effect.gen(function* () {
    const seen = new Set<string>()
    let cursor = leaf
    while (cursor !== null) {
      if (seen.has(cursor)) return yield* storeError(`Session path for leaf ${leaf} contains a cycle`)
      seen.add(cursor)
      const found = yield* entry(cursor)
      if (found === undefined) return yield* storeError(`Session entry ${cursor} does not exist`)
      if (found._tag === "Compaction") return found
      cursor = found.parentId
    }
    return undefined
  })

export const SessionReads = { readPathPage, readEffectivePath, readLatestCompaction }

/** @internal Read-only SQL Session hydration, without initializing a Session or acquiring a writer. */
export const reader = (sessionId: string): Effect.Effect<SessionReader, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sessionRow = Effect.gen(function* () {
      const rows = yield* sql<SessionRow>`
        SELECT leaf_id, next_seq, writer_epoch, writer_run_id, writer_owner_id, writer_attempt_fence
        FROM generalist_sessions WHERE session_id = ${sessionId}
      `
      return rows[0] === undefined ? undefined : decodeSession(rows[0])
    })
    const readEntry: ReadEntry = (id) =>
      sql<EntryRow>`
          SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
          WHERE session_id = ${sessionId} AND entry_id = ${id}
        `.pipe(
        Effect.map((rows) => (rows[0] === undefined ? undefined : toEntry(rows[0]))),
        Effect.mapError((error) => storeError(String(error))),
      )
    const resolveReadLeaf = (leaf: EntryId | undefined) =>
      leaf === undefined
        ? sessionRow.pipe(
            Effect.map((session) => session?.leaf_id ?? null),
            Effect.mapError((error) => storeError(String(error))),
          )
        : Effect.succeed(leaf)
    return {
      entry: readEntry,
      pathPage: (input) => readPathPage(readEntry, input),
      effectivePath: (leaf) =>
        resolveReadLeaf(leaf).pipe(Effect.flatMap((resolved) => readEffectivePath(readEntry, resolved))),
      latestCompaction: (leaf) =>
        resolveReadLeaf(leaf).pipe(Effect.flatMap((resolved) => readLatestCompaction(readEntry, resolved))),
      path: (leaf) =>
        sessionRow.pipe(
          Effect.flatMap((session) => {
            if (session === undefined && leaf === undefined) return Effect.succeed([])
            if (session === undefined) return storeError(`Session entry ${String(leaf)} does not exist`)
            return sql<EntryRow>`
              SELECT entry_id, parent_id, seq, tag, payload_json FROM generalist_session_entries
              WHERE session_id = ${sessionId} ORDER BY seq
            `.pipe(
              Effect.flatMap((rows) => {
                const path = pathFromRows(rows, leaf ?? session.leaf_id)
                return Schema.is(SessionStoreError)(path) ? path : Effect.succeed(path)
              }),
            )
          }),
          Effect.mapError((error) => (Schema.is(SessionStoreError)(error) ? error : storeError(String(error)))),
        ),
      leaf: sessionRow.pipe(
        Effect.map((session) => session?.leaf_id ?? null),
        Effect.orDie,
      ),
    }
  })
