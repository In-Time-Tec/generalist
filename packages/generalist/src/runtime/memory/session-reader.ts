import { Effect, Schema, SynchronizedRef } from "effect"
import { type CompactionEntry, type Entry, SessionStoreError } from "../../core/context/session.js"
import type { PathPage, PathPageInput } from "../../core/context/session-history.js"
import { emptySession, type MemorySession, type MemoryState } from "./state.js"
import type { SessionReader } from "../run/store.js"

const storeError = (message: string) => SessionStoreError.make({ message })

const pathTo = (session: MemorySession, leaf: string | null): ReadonlyArray<Entry> | SessionStoreError => {
  if (leaf === null) return []
  const entries: Array<Entry> = []
  let cursor: string | null = leaf
  while (cursor !== null) {
    if (entries.length > session.order.length) return storeError(`Session path for leaf ${leaf} contains a cycle`)
    const entry: Entry | undefined = session.entries.get(cursor)
    if (entry === undefined) return storeError(`Session entry ${cursor} does not exist`)
    entries.push(entry)
    cursor = entry.parentId
  }
  return entries.toReversed()
}

const pathPage = (session: MemorySession, input: PathPageInput): PathPage | SessionStoreError => {
  if (input.limit < 1 || !Number.isSafeInteger(input.limit))
    return storeError("Session path page limit must be positive")
  if (input.cursor !== undefined && input.cursor.leafId !== input.leafId) {
    return storeError("Session path page cursor belongs to a different leaf")
  }
  if (input.leafId === null) {
    return input.cursor === undefined
      ? { entries: [], hasOlder: false, hasNewer: false }
      : storeError("An empty Session path cannot have a page cursor")
  }
  const newestFirst: Array<Entry> = []
  const seen = new Set<string>()
  let cursor: string | null = input.cursor?.entryId ?? input.leafId
  while (cursor !== null && newestFirst.length <= input.limit) {
    if (seen.has(cursor)) return storeError(`Session path for leaf ${input.leafId} contains a cycle`)
    seen.add(cursor)
    const entry = session.entries.get(cursor)
    if (entry === undefined) return storeError(`Session entry ${cursor} does not exist`)
    newestFirst.push(entry)
    cursor = entry.parentId
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
}

const effectivePathTo = (session: MemorySession, leaf: string | null): ReadonlyArray<Entry> | SessionStoreError => {
  if (leaf === null) return []
  const newestFirst: Array<Entry> = []
  const seen = new Set<string>()
  let cursor: string | null = leaf
  while (cursor !== null) {
    if (seen.has(cursor)) return storeError(`Session path for leaf ${leaf} contains a cycle`)
    seen.add(cursor)
    const entry = session.entries.get(cursor)
    if (entry === undefined) return storeError(`Session entry ${cursor} does not exist`)
    newestFirst.push(entry)
    if (entry._tag === "Compaction" || entry._tag === "Handoff") break
    cursor = entry.parentId
  }
  return newestFirst.toReversed()
}

const latestCompaction = (
  session: MemorySession,
  leaf: string | null,
): CompactionEntry | undefined | SessionStoreError => {
  const seen = new Set<string>()
  let cursor = leaf
  while (cursor !== null) {
    if (seen.has(cursor)) return storeError(`Session path for leaf ${leaf} contains a cycle`)
    seen.add(cursor)
    const entry = session.entries.get(cursor)
    if (entry === undefined) return storeError(`Session entry ${cursor} does not exist`)
    if (entry._tag === "Compaction") return entry
    cursor = entry.parentId
  }
  return undefined
}

export const SessionReads = { pathTo, pathPage, effectivePathTo, latestCompaction }

export const reader = (config: {
  readonly stateRef: SynchronizedRef.SynchronizedRef<MemoryState>
  readonly sessionId: string
}): SessionReader => ({
  entry: (id) =>
    SynchronizedRef.get(config.stateRef).pipe(
      Effect.map((state) => state.sessions.get(config.sessionId)?.entries.get(id)),
    ),
  pathPage: (input) =>
    SynchronizedRef.get(config.stateRef).pipe(
      Effect.flatMap((state) => {
        const result = pathPage(state.sessions.get(config.sessionId) ?? emptySession(), input)
        return Schema.is(SessionStoreError)(result) ? Effect.fail(result) : Effect.succeed(result)
      }),
    ),
  effectivePath: (leaf) =>
    SynchronizedRef.get(config.stateRef).pipe(
      Effect.flatMap((state) => {
        const session = state.sessions.get(config.sessionId) ?? emptySession()
        const result = effectivePathTo(session, leaf ?? session.leaf)
        return Schema.is(SessionStoreError)(result) ? Effect.fail(result) : Effect.succeed(result)
      }),
    ),
  latestCompaction: (leaf) =>
    SynchronizedRef.get(config.stateRef).pipe(
      Effect.flatMap((state) => {
        const session = state.sessions.get(config.sessionId) ?? emptySession()
        const result = latestCompaction(session, leaf ?? session.leaf)
        return Schema.is(SessionStoreError)(result) ? Effect.fail(result) : Effect.succeed(result)
      }),
    ),
  path: (leaf) =>
    SynchronizedRef.get(config.stateRef).pipe(
      Effect.flatMap((state) => {
        const session = state.sessions.get(config.sessionId) ?? emptySession()
        const path = pathTo(session, leaf ?? session.leaf)
        return Schema.is(SessionStoreError)(path) ? Effect.fail(path) : Effect.succeed(path)
      }),
    ),
  leaf: SynchronizedRef.get(config.stateRef).pipe(
    Effect.map((state) => state.sessions.get(config.sessionId)?.leaf ?? null),
  ),
})
