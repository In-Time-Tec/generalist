import { Function } from "effect"
import type { CompactionEntry, Entry, EntryId } from "./session.js"

/** @experimental One bounded read over the exact entry log. */
export interface HistoryPageInput {
  readonly limit: number
  /** Return entries strictly before this entry. Omitted reads the newest page. */
  readonly before?: EntryId
  /** Return entries strictly after this entry. */
  readonly after?: EntryId
}

/**
 * @experimental One page of exact Session entries plus the cursors that continue it.
 *
 * `entries` are in path order. `hasBefore` states whether older entries remain, which is how a
 * caller learns that history continues behind a compaction checkpoint rather than ending there.
 */
export interface HistoryPage {
  readonly entries: ReadonlyArray<Entry>
  readonly hasBefore: boolean
  readonly hasAfter: boolean
  readonly firstEntryId?: EntryId
  readonly lastEntryId?: EntryId
  /**
   * The cursors this page was asked for that the log does not hold. A cursor names no position, so
   * the page falls back to the end it would have bounded; saying which cursor was ignored is what
   * stops a caller reading the newest entries as though they preceded something.
   */
  readonly unknownCursors?: ReadonlyArray<EntryId>
}

/**
 * @experimental Purely page one root-to-leaf path over its exact entries.
 *
 * Paging reads the entry log, not the projection, so entries recorded before a compaction
 * checkpoint stay reachable. A checkpoint is an ordinary entry in the page, never a floor.
 */
export const page: {
  (input: HistoryPageInput): (path: ReadonlyArray<Entry>) => HistoryPage
  (path: ReadonlyArray<Entry>, input: HistoryPageInput): HistoryPage
} = Function.dual(2, (path: ReadonlyArray<Entry>, input: HistoryPageInput): HistoryPage => {
  const limit = Math.max(0, Math.trunc(input.limit))
  const beforeIndex = input.before === undefined ? path.length : path.findIndex((entry) => entry.id === input.before)
  const afterIndex = input.after === undefined ? -1 : path.findIndex((entry) => entry.id === input.after)
  const upper = beforeIndex === -1 ? path.length : beforeIndex
  const lower = afterIndex === -1 ? 0 : afterIndex + 1
  const unknownCursors = [
    ...(input.before !== undefined && beforeIndex === -1 ? [input.before] : []),
    ...(input.after !== undefined && afterIndex === -1 ? [input.after] : []),
  ]
  const window = path.slice(lower, Math.max(lower, upper))
  const entries = input.after === undefined ? window.slice(Math.max(0, window.length - limit)) : window.slice(0, limit)
  const start = lower + (input.after === undefined ? Math.max(0, window.length - limit) : 0)
  const end = start + entries.length
  const first = entries[0]
  const last = entries.at(-1)
  let result: HistoryPage = {
    entries,
    hasBefore: start > 0,
    hasAfter: end < path.length,
  }
  if (unknownCursors.length > 0) result = { ...result, unknownCursors }
  if (first !== undefined) result = { ...result, firstEntryId: first.id }
  if (last !== undefined) result = { ...result, lastEntryId: last.id }
  return result
})

/** @experimental Every compaction checkpoint on one path, oldest first. */
export const compactionCheckpoints = (path: ReadonlyArray<Entry>): ReadonlyArray<CompactionEntry> =>
  path.filter((entry): entry is CompactionEntry => entry._tag === "Compaction")
