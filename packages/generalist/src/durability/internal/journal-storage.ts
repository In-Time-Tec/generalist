import { Crypto, Effect, Encoding, Function, Schema } from "effect"
import { DurabilityFailure } from "../errors.js"
import type { Service, ObjectStoreFailure, StoredObject } from "../object-store.js"
import type { Head } from "./journal.js"
import type { Identity } from "./discovery-marker.js"
import {
  Commit,
  Envelope,
  Page,
  apply,
  byteLength,
  bytes as encodeBytes,
  decode,
  equalBytes,
  failure,
  freeze,
  nextSequence,
  parse,
  sequenceName,
  set,
  type Json,
  type Receipt,
  type State,
} from "./protocol.js"

export interface Loaded {
  readonly head: Omit<Head, "stateDigest">
  readonly receipts: Readonly<Record<string, Receipt>>
  readonly replayRecords: number
  readonly replayBytes: number
  readonly snapshotKey?: string
}
export const transport = (cause: ObjectStoreFailure): DurabilityFailure =>
  DurabilityFailure.make({
    reason: cause.reason === "limit" ? "limit" : "transport",
    message: cause.message,
    key: cause.key,
    cause,
  })
export const ownReceipt = Function.dual<
  (id: string) => (loaded: Loaded) => Receipt | undefined,
  (loaded: Loaded, id: string) => Receipt | undefined
>(2, (loaded: Loaded, id: string): Receipt | undefined =>
  Object.hasOwn(loaded.receipts, id) ? loaded.receipts[id] : undefined,
)

interface Options {
  readonly store: Service
  readonly crypto: Crypto.Crypto
  readonly identity: typeof Identity.Type
  readonly commitsPrefix: string
  readonly maxStateBytes: number
  readonly maxCommitBytes: number
}

const encoder = new TextEncoder()
const encodeDigest = Schema.encodeSync(Schema.fromJsonString(Schema.String))
const envelopeBytes = (digest: string, record: Uint8Array) =>
  Effect.try({
    try: () => {
      const prefix = encoder.encode(`{"digest":${encodeDigest(digest)},"record":`)
      const bytes = new Uint8Array(prefix.length + record.length + 1)
      bytes.set(prefix)
      bytes.set(record, prefix.length)
      bytes[bytes.length - 1] = 125
      return bytes
    },
    catch: (cause) => failure({ reason: "encoding", message: `Cannot encode canonical envelope: ${String(cause)}` }),
  })

export const make = ({ store, crypto, identity, commitsPrefix, maxStateBytes, maxCommitBytes }: Options) => {
  const verifiedCommits = new Map<
    string,
    {
      readonly bytes: Uint8Array
      readonly value: { readonly record: Commit; readonly digest: string; readonly size: number }
    }
  >()
  const commitKey = (sequence: string) => `${commitsPrefix}${sequenceName(sequence)}.json`
  const hash = (value: Uint8Array) =>
    crypto.digest("SHA-256", value).pipe(
      Effect.map(Encoding.encodeHex),
      Effect.mapError((cause) => failure({ reason: "crypto", message: `SHA-256 failed: ${String(cause)}` })),
    )
  const required = (key: string, maxBytes: number) =>
    Effect.gen(function* () {
      const object = yield* store.read(key, { maxBytes }).pipe(Effect.mapError(transport))
      if (object === undefined)
        return yield* failure({ reason: "corruption", message: "A retained canonical object is missing", key })
      if (object.bytes.length > maxBytes)
        return yield* failure({ reason: "limit", message: `Canonical object exceeds ${maxBytes} bytes`, key })
      return object
    })
  const seal = (record: Json) =>
    Effect.gen(function* () {
      const bytes = yield* encodeBytes(record)
      const digest = yield* hash(bytes)
      return { digest, bytes: yield* envelopeBytes(digest, bytes) }
    })
  const retainCommit = (record: Commit, digest: string, bytes: Uint8Array) => {
    const value = freeze({ record, digest, size: bytes.length })
    verifiedCommits.delete(record.sequence)
    verifiedCommits.set(record.sequence, { bytes, value })
    if (verifiedCommits.size > 3) verifiedCommits.delete(verifiedCommits.keys().next().value!)
    return value
  }
  const sealCommit = (input: Commit) =>
    Effect.gen(function* () {
      const encoded = yield* encodeBytes(input)
      const record = freeze(yield* decode(Commit, yield* parse(encoded), "encoding"))
      const digest = yield* hash(encoded)
      const bytes = yield* envelopeBytes(digest, encoded)
      const retained = bytes.slice()
      return { digest, bytes, accept: () => retainCommit(record, digest, retained) }
    })
  const unseal = (object: StoredObject, key: string, limit: number) =>
    Effect.gen(function* () {
      if (object.bytes.length > limit)
        return yield* failure({ reason: "limit", message: `Canonical object exceeds ${limit} bytes`, key })
      const envelope = yield* decode(Envelope, yield* parse(object.bytes, key), "corruption", key)
      const recordBytes = yield* encodeBytes(envelope.record)
      const canonical = yield* envelopeBytes(envelope.digest, recordBytes)
      if (!equalBytes(canonical, object.bytes)) {
        return yield* failure({ reason: "corruption", message: "Object bytes are not canonical JSON", key })
      }
      if (envelope.record.version !== 1) {
        return yield* failure({
          reason: "unsupported-version",
          message: "Unsupported canonical protocol version",
          key,
        })
      }
      if ((yield* hash(recordBytes)) !== envelope.digest) {
        return yield* failure({
          reason: "corruption",
          message: "Canonical SHA-256 digest does not match the record",
          key,
        })
      }
      return envelope
    })
  const sameIdentity = (record: typeof identity, key: string) =>
    record.environment === identity.environment &&
    record.tenant === identity.tenant &&
    record.partition === identity.partition
      ? Effect.void
      : Effect.fail(
          failure({
            reason: "corruption",
            message: "Record belongs to a different environment, tenant, or partition",
            key,
          }),
        )
  const readCommit = (sequence: string, supplied?: StoredObject) =>
    Effect.gen(function* () {
      const key = commitKey(sequence)
      const object = supplied ?? (yield* required(key, maxCommitBytes))
      const cached = verifiedCommits.get(sequence)
      if (cached !== undefined && equalBytes(cached.bytes, object.bytes)) {
        verifiedCommits.delete(sequence)
        verifiedCommits.set(sequence, cached)
        return cached.value
      }
      const bytes = object.bytes.slice()
      const envelope = yield* unseal({ ...object, bytes }, key, maxCommitBytes)
      const record = yield* decode(Commit, envelope.record, "corruption", key)
      yield* sameIdentity(record, key)
      if (
        record.sequence !== sequence ||
        (sequence === "0" ? record.parentDigest !== "" : record.parentDigest === "")
      ) {
        return yield* failure({
          reason: "corruption",
          message: "Commit sequence or genesis parent does not match its slot",
          key,
        })
      }
      if (record.command.id.length === 0)
        return yield* failure({ reason: "corruption", message: "Commit command identity is empty", key })
      return retainCommit(record, envelope.digest, bytes)
    })
  const checkState = (state: State, receipts: Loaded["receipts"], reserveBytes = 0) =>
    Effect.gen(function* () {
      if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 0 || reserveBytes >= maxStateBytes) {
        return yield* failure({
          reason: "configuration",
          message: "Reserved bytes must be a nonnegative safe integer below maxStateBytes",
        })
      }
      // Retained receipts are canonical state, not an unbounded process-side deduplication cache.
      const size = yield* byteLength(freeze({ state, receipts }))
      if (size > maxStateBytes - reserveBytes)
        return yield* failure({
          reason: "limit",
          message: `Partition state and receipts exceed ${maxStateBytes - reserveBytes} bytes${reserveBytes === 0 ? "" : ` with ${reserveBytes} bytes reserved for settlement`}`,
        })
    })
  const listKeys = (namespace: string) =>
    Effect.gen(function* () {
      const keys = new Set<string>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      do {
        const page = yield* decode(
          Page,
          yield* store.list(namespace, cursor).pipe(Effect.mapError(transport)),
          "corruption",
          namespace,
        )
        for (const key of page.keys) {
          if (!key.startsWith(namespace) || keys.has(key)) {
            return yield* failure({
              reason: "corruption",
              message: "Listing contains an out-of-prefix or repeated canonical key",
              key,
            })
          }
          keys.add(key)
        }
        cursor = page.cursor
        if (cursor !== undefined) {
          if (cursors.has(cursor))
            return yield* failure({
              reason: "corruption",
              message: "Object listing cursor did not advance",
              key: namespace,
            })
          cursors.add(cursor)
        }
      } while (cursor !== undefined)
      return keys
    })
  const append = (loaded: Loaded, value: { record: Commit; digest: string; size: number }) =>
    Effect.gen(function* () {
      const { record, digest, size } = value
      if (record.sequence !== nextSequence(loaded.head.sequence) || record.parentDigest !== loaded.head.digest) {
        return yield* failure({
          reason: "corruption",
          message: "Commit does not extend the verified parent",
          key: commitKey(record.sequence),
        })
      }
      if (ownReceipt(loaded, record.command.id) !== undefined) {
        return yield* failure({
          reason: "corruption",
          message: "A command identity appears in more than one committed slot",
          key: commitKey(record.sequence),
          commandId: record.command.id,
        })
      }
      const state = yield* apply(loaded.head.state, record.patches, "corruption")
      const receipts = yield* set(
        loaded.receipts,
        record.command.id,
        freeze({
          inputDigest: record.command.inputDigest,
          sequence: record.sequence,
          receipt: record.receipt,
        }),
      )
      yield* checkState(state, receipts)
      return {
        ...loaded,
        head: { sequence: record.sequence, digest, state },
        receipts,
        replayRecords: loaded.replayRecords + 1,
        replayBytes: loaded.replayBytes + size,
      } satisfies Loaded
    })

  return { hash, required, seal, sealCommit, unseal, sameIdentity, readCommit, checkState, listKeys, append, commitKey }
}
