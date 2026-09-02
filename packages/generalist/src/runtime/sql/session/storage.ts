import { Predicate, Schema } from "effect"
import {
  type AppendInput,
  type Entry,
  type EntryId,
  EntryPayload,
  SessionConflict,
  SessionStoreError,
} from "../../../core/context/session.js"
import { decodeSqlInteger } from "../codec/codecs.js"
import { decodeSessionPayload, encodeSessionPayload, sessionPayloadEquivalence } from "./payload-codec.js"

export interface EntryRow {
  readonly entry_id: string
  readonly parent_id: string | null
  readonly seq: number
  readonly tag: string
  readonly payload_json: string
}

export interface SessionRow {
  readonly leaf_id: string | null
  readonly next_seq: number | string | bigint
  readonly writer_epoch: string | number | bigint
  readonly writer_run_id: string | null
  readonly writer_owner_id: string | null
  readonly writer_attempt_fence: number | null
}

const storeError = (message: string) => SessionStoreError.make({ message })
const encodePayload = encodeSessionPayload
const parseEntry = Schema.decodeUnknownSync(
  Schema.declare<Entry>(
    (input): input is Entry =>
      Predicate.isObject(input) &&
      Predicate.isString(input.id) &&
      (Predicate.isString(input.parentId) || input.parentId === null) &&
      Schema.is(EntryPayload)(input),
  ),
)

const toEntry = (row: EntryRow): Entry => {
  const payload = decodeSessionPayload(row.payload_json)
  if (payload._tag !== row.tag) throw new Error(`Session entry ${row.entry_id} tag is corrupt`)
  return parseEntry({ ...payload, id: row.entry_id, parentId: row.parent_id })
}

const pathFromRows = (rows: ReadonlyArray<EntryRow>, leaf: string | null): ReadonlyArray<Entry> | SessionStoreError => {
  if (leaf === null) return []
  const byId = new Map(rows.map((row) => [row.entry_id, row] as const))
  const walked: Array<Entry> = []
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
): SessionConflict | undefined => {
  const path = pathFromRows(rows, leaf)
  if (Schema.is(SessionStoreError)(path)) {
    return SessionConflict.make({ reason, message: path.message })
  }
  return path.some((entry) => entry.id === entryId)
    ? undefined
    : SessionConflict.make({
        reason,
        message: `Session entry id ${entryId} is not on the active path from ${String(leaf)}`,
      })
}

const fromEntry = (entry: Entry | AppendInput): string => {
  if (!("id" in entry)) return encodePayload(entry)
  const { id: _id, parentId: _parentId, ...payload } = entry
  return encodePayload(payload)
}

/** @internal Shared SQL Session row codec used by dialect-native stores and atomic response commits. */
export const SessionStorage = {
  decodeSession: (row: SessionRow): SessionRow & { readonly next_seq: number } => ({
    ...row,
    next_seq: decodeSqlInteger(row.next_seq),
  }),
  appendMatches: (entry: Entry, input: AppendInput, parentId: EntryId | null): boolean =>
    entry.parentId === parentId && sessionPayloadEquivalence(entry, input),
  entryPayloadEquivalence: sessionPayloadEquivalence,
  storeError,
  encodePayload,
  fromEntry,
  toEntry,
  pathFromRows,
  requireActive,
}
