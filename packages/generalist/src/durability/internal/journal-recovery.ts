import { Effect, Result } from "effect"
import type { Service } from "../object-store.js"
import type { Identity } from "./discovery-marker.js"
import {
  Snapshot,
  bytes as encodeBytes,
  compareSequence,
  decode,
  equalBytes,
  failure,
  freeze,
  sequenceFromName,
  sequenceName,
} from "./protocol.js"
import { transport, ownReceipt, type Loaded, type make as makeStorage } from "./journal-storage.js"
import type { DurabilityFailure } from "../errors.js"

interface Options {
  readonly storage: ReturnType<typeof makeStorage>
  readonly store: Service
  readonly identity: typeof Identity.Type
  readonly commitsPrefix: string
  readonly snapshotsPrefix: string
  readonly snapshotEvery: number
  readonly maxReplayBytes: number
  readonly maxSnapshotBytes: number
}

export const make = ({
  storage,
  store,
  identity,
  commitsPrefix,
  snapshotsPrefix,
  snapshotEvery,
  maxReplayBytes,
  maxSnapshotBytes,
}: Options) => {
  const { seal, unseal, required, readCommit, sameIdentity, checkState, listKeys, append, commitKey } = storage
  let verified: Loaded | undefined
  let verifiedSnapshot: { readonly key: string; readonly bytes: Uint8Array; readonly loaded: Loaded } | undefined
  const remember = (loaded: Loaded): void => {
    if (verified === undefined || compareSequence(loaded.head.sequence, verified.head.sequence) >= 0) {
      verified = loaded
    }
  }
  const listSequences = Effect.gen(function* () {
    const keys = yield* listKeys(commitsPrefix)
    const sequences: Array<string> = []
    for (const key of keys) {
      const name = key.slice(commitsPrefix.length)
      const sequence = name.endsWith(".json") ? sequenceFromName(name.slice(0, -5)) : undefined
      if (sequence === undefined)
        return yield* failure({ reason: "corruption", message: "Invalid numbered commit key", key })
      sequences.push(sequence)
    }
    sequences.sort((left, right) => left.length - right.length || (left < right ? -1 : Number(left > right)))
    for (let index = 0; index < sequences.length; index++) {
      if (sequences[index] !== String(index))
        return yield* failure({
          reason: "corruption",
          message: "Retained commit history contains a gap",
          key: commitKey(String(index)),
        })
    }
    return sequences
  })
  interface SnapshotLocation {
    readonly key: string
    readonly sequence: string
    readonly digest: string
  }
  const latestSnapshot = (latest: string) =>
    Effect.gen(function* () {
      const snapshots = yield* listKeys(snapshotsPrefix)
      let snapshot: { key: string; sequence: string; digest: string } | undefined
      for (const key of snapshots) {
        const name = key.slice(snapshotsPrefix.length)
        const match = /^([0-9]{20,})-([0-9a-f]{64})\.json$/.exec(name)
        const sequence = match === null ? undefined : sequenceFromName(match[1]!)
        if (sequence === undefined || match === null)
          return yield* failure({ reason: "corruption", message: "Invalid snapshot key", key })
        // A snapshot may have been published after the commit LIST completed. Ignore it for this
        // point-in-time read; its commit is discovered by the next load or conditional-create conflict.
        if (compareSequence(sequence, latest) > 0) continue
        if (snapshot === undefined || compareSequence(sequence, snapshot.sequence) > 0) {
          snapshot = { key, sequence, digest: match[2]! }
        } else if (sequence === snapshot.sequence && key !== snapshot.key) {
          return yield* failure({
            reason: "corruption",
            message: "Conflicting snapshots exist for one committed sequence",
            key,
          })
        }
      }
      return snapshot
    })
  const loadSnapshot = (snapshot: SnapshotLocation) =>
    Effect.gen(function* () {
      const object = yield* required(snapshot.key, maxSnapshotBytes)
      const anchor = yield* readCommit(snapshot.sequence)
      if (
        verifiedSnapshot?.key === snapshot.key &&
        anchor.digest === verifiedSnapshot.loaded.head.digest &&
        equalBytes(object.bytes, verifiedSnapshot.bytes)
      )
        return verifiedSnapshot.loaded
      const bytes = object.bytes.slice()
      const envelope = yield* unseal({ ...object, bytes }, snapshot.key, maxSnapshotBytes)
      const record = yield* decode(Snapshot, envelope.record, "corruption", snapshot.key)
      yield* sameIdentity(record, snapshot.key)
      if (record.sequence !== snapshot.sequence || envelope.digest !== snapshot.digest) {
        return yield* failure({
          reason: "corruption",
          message: "Snapshot identity does not match its content-addressed key",
          key: snapshot.key,
        })
      }
      if (anchor.digest !== record.commitDigest)
        return yield* failure({
          reason: "corruption",
          message: "Snapshot is not anchored to its retained commit",
          key: snapshot.key,
        })
      for (const [id, receipt] of Object.entries(record.receipts)) {
        if (id.length === 0 || compareSequence(receipt.sequence, record.sequence) > 0) {
          return yield* failure({
            reason: "corruption",
            message: "Snapshot contains an invalid command receipt",
            key: snapshot.key,
          })
        }
      }
      const loaded: Loaded = {
        head: { sequence: record.sequence, digest: record.commitDigest, state: freeze(record.state) },
        receipts: freeze(record.receipts),
        replayRecords: 0,
        replayBytes: 0,
        snapshotKey: snapshot.key,
      }
      const receipt = ownReceipt(loaded, anchor.record.command.id)
      if (
        receipt === undefined ||
        receipt.sequence !== record.sequence ||
        receipt.inputDigest !== anchor.record.command.inputDigest ||
        !equalBytes(yield* encodeBytes(receipt.receipt), yield* encodeBytes(anchor.record.receipt))
      ) {
        return yield* failure({
          reason: "corruption",
          message: "Snapshot lost its anchor command receipt",
          key: snapshot.key,
        })
      }
      yield* checkState(loaded.head.state, loaded.receipts)
      verifiedSnapshot = { key: snapshot.key, bytes, loaded }
      return loaded
    })
  const load: Effect.Effect<Loaded, DurabilityFailure> = Effect.gen(function* () {
    // A verified immutable prefix is a local accelerator, never an authority hint.
    // Retained names, the current snapshot, and the cached anchor are still verified.
    const known = verified
    // LIST is paginated and unordered. Hints are intentionally never read. Retained names establish
    // the complete prefix even when a snapshot lets us avoid replaying old record bodies.
    const sequences = yield* listSequences
    const latest = sequences.at(-1) ?? "-1"
    let loaded: Loaded = {
      head: { sequence: "-1", digest: "", state: Object.freeze({}) },
      receipts: {},
      replayRecords: 0,
      replayBytes: 0,
    }
    const snapshot = yield* latestSnapshot(latest)
    if (snapshot !== undefined) loaded = yield* loadSnapshot(snapshot)
    if (known !== undefined) {
      if (compareSequence(known.head.sequence, latest) > 0) {
        return yield* failure({
          reason: "corruption",
          message: "Previously verified canonical history was removed",
          key: commitKey(known.head.sequence),
        })
      }
      if (known.snapshotKey === snapshot?.key && compareSequence(known.head.sequence, loaded.head.sequence) >= 0) {
        if (known.head.sequence !== "-1") {
          const anchor = yield* readCommit(known.head.sequence)
          if (anchor.digest !== known.head.digest) {
            return yield* failure({
              reason: "corruption",
              message: "Previously verified canonical anchor changed",
              key: commitKey(known.head.sequence),
            })
          }
        }
        loaded = known
      }
    }
    for (
      let index = loaded.head.sequence === "-1" ? 0 : sequences.indexOf(loaded.head.sequence) + 1;
      index < sequences.length;
      index++
    ) {
      const sequence = sequences[index]!
      if (loaded.replayRecords >= snapshotEvery) {
        return yield* failure({
          reason: "limit",
          message: `Recovery exceeds ${snapshotEvery} records without a published snapshot`,
          key: commitKey(sequence),
        })
      }
      const value = yield* readCommit(sequence)
      if (loaded.replayBytes + value.size > maxReplayBytes) {
        return yield* failure({
          reason: "limit",
          message: `Recovery exceeds ${maxReplayBytes} replay bytes`,
          key: commitKey(sequence),
        })
      }
      loaded = yield* append(loaded, value)
    }
    remember(loaded)
    return loaded
  })
  const publishSnapshot = (loaded: Loaded) =>
    Effect.gen(function* () {
      if (loaded.head.sequence === "-1") return
      const record = yield* decode(
        Snapshot,
        {
          version: 1,
          kind: "snapshot",
          ...identity,
          sequence: loaded.head.sequence,
          commitDigest: loaded.head.digest,
          state: loaded.head.state,
          receipts: loaded.receipts,
        },
        "encoding",
      )
      const sealed = yield* seal(record)
      const key = `${snapshotsPrefix}${sequenceName(record.sequence)}-${sealed.digest}.json`
      const bytes = sealed.bytes.slice()
      const retain = () => {
        verifiedSnapshot = {
          key,
          bytes,
          loaded: {
            head: { sequence: record.sequence, digest: record.commitDigest, state: freeze(record.state) },
            receipts: freeze(record.receipts),
            replayRecords: 0,
            replayBytes: 0,
            snapshotKey: key,
          },
        }
      }
      const created = yield* Effect.result(store.create(key, sealed.bytes))
      if (Result.isSuccess(created) && created.success === "created") return retain()
      const existing = yield* store.read(key, { maxBytes: maxSnapshotBytes }).pipe(Effect.mapError(transport))
      if (existing !== undefined && equalBytes(existing.bytes, bytes)) return retain()
      if (existing !== undefined)
        return yield* failure({
          reason: "corruption",
          message: "Immutable snapshot publication conflicts with existing bytes",
          key,
        })
      if (Result.isFailure(created)) return yield* transport(created.failure)
      return yield* failure({
        reason: "corruption",
        message: "Conflicting snapshot is not visible through a direct read",
        key,
      })
    })
  return { load, publishSnapshot, remember }
}
