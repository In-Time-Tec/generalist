import { Crypto, Effect, Encoding, Result } from "effect"
import { DurabilityFailure } from "../errors.js"
import { ObjectStore, type ObjectStoreFailure, type StoredObject } from "../object-store.js"
import * as Protocol from "./protocol.js"
import { probe } from "./probe.js"

export type { Json, Patch, State } from "./protocol.js"
export interface Head {
  readonly sequence: string
  readonly digest: string
  /** SHA-256 of canonical logical state, independent from command and receipt history. */
  readonly stateDigest: string
  readonly state: Protocol.State
}
export interface Options {
  readonly environment: string
  readonly tenant: string
  readonly partition: string
  readonly maxStateBytes?: number
  readonly maxCommitBytes?: number
  readonly snapshotEvery?: number
  readonly maxReplayBytes?: number
  /** Number of deterministic reevaluations after a competing command wins; zero disables retries. */
  readonly maxConflictRetries?: number
}
export interface Journal {
  readonly read: Effect.Effect<Head, DurabilityFailure>
  /** Read one retained command receipt from canonical storage without mutating the journal. */
  readonly lookupReceipt: (commandId: string) => Effect.Effect<Protocol.Receipt | undefined, DurabilityFailure>
  readonly commit: <E>(
    command: { readonly id: string; readonly input: Protocol.Json },
    evaluate: (state: Protocol.State) => Effect.Effect<{
      readonly patches: ReadonlyArray<Protocol.Patch>
      readonly receipt: Protocol.Json
    }, E>,
  ) => Effect.Effect<Protocol.Json, E | DurabilityFailure>
}
interface Loaded {
  readonly head: Omit<Head, "stateDigest">
  readonly receipts: Readonly<Record<string, Protocol.Receipt>>
  readonly replayRecords: number
  readonly replayBytes: number
  readonly snapshotKey?: string
}
const transport = (cause: ObjectStoreFailure): DurabilityFailure =>
  new DurabilityFailure({ reason: cause.reason === "limit" ? "limit" : "transport", message: cause.message, key: cause.key, cause })
const ownReceipt = (loaded: Loaded, id: string): Protocol.Receipt | undefined =>
  Object.hasOwn(loaded.receipts, id) ? loaded.receipts[id] : undefined

/**
 * One object-backed serialization protocol. No process-local lock or head hint is authoritative.
 * All committed slots and receipts are retained; bucket lifecycle deletion of this prefix is unsafe.
 * The callback is a deterministic reducer, never a place to perform external effects.
 */
export const make = (options: Options): Effect.Effect<Journal, DurabilityFailure, ObjectStore | Crypto.Crypto> =>
  Effect.gen(function* () {
    const store = yield* ObjectStore
    const crypto = yield* Crypto.Crypto
    if (!store.capabilities.conditionalCreate || !store.capabilities.strongReadAfterWrite || !store.capabilities.consistentListing) {
      return yield* Protocol.failure("configuration", "The provider does not satisfy the canonical object-store contract")
    }
    const maxStateBytes = options.maxStateBytes ?? 16 * 1024 * 1024
    const maxCommitBytes = options.maxCommitBytes ?? 1024 * 1024
    const maxSnapshotBytes = maxStateBytes + maxCommitBytes + 4096
    const snapshotEvery = options.snapshotEvery ?? 128
    const maxReplayBytes = options.maxReplayBytes ?? 16 * 1024 * 1024
    const maxConflictRetries = options.maxConflictRetries ?? 64
    for (const [name, value] of Object.entries({ maxStateBytes, maxCommitBytes, maxSnapshotBytes, snapshotEvery, maxReplayBytes })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        return yield* Protocol.failure("configuration", `${name} must be a positive safe integer`)
      }
    }
    if (!Number.isSafeInteger(maxConflictRetries) || maxConflictRetries < 0) {
      return yield* Protocol.failure("configuration", "maxConflictRetries must be a nonnegative safe integer")
    }
    const identity = { environment: options.environment, tenant: options.tenant, partition: options.partition }
    const prefix = yield* Effect.try({
      try: () => {
        for (const value of Object.values(identity)) {
          if (typeof value !== "string" || value.length === 0) throw new Error("Partition identity components must be nonempty")
        }
        const encodeComponent = (value: string) => encodeURIComponent(value).replaceAll(".", "%2E")
        return `environments/${encodeComponent(identity.environment)}/v1/tenants/${encodeComponent(identity.tenant)}/partitions/${encodeComponent(identity.partition)}/`
      },
      catch: (cause) => Protocol.failure("configuration", String(cause)),
    })
    let probed = false
    let verified: Loaded | undefined
    const remember = (loaded: Loaded): void => {
      if (verified === undefined || Protocol.compareSequence(loaded.head.sequence, verified.head.sequence) >= 0) {
        verified = loaded
      }
    }
    const commitsPrefix = `${prefix}commits/`
    const snapshotsPrefix = `${prefix}snapshots/`
    const commitKey = (sequence: string) => `${commitsPrefix}${Protocol.sequenceName(sequence)}.json`
    const hash = (value: Uint8Array) => crypto.digest("SHA-256", value).pipe(
      Effect.map(Encoding.encodeHex),
      Effect.mapError((cause) => Protocol.failure("crypto", `SHA-256 failed: ${String(cause)}`)),
    )
    const required = (key: string, maxBytes: number) => Effect.gen(function* () {
      const object = yield* store.read(key, { maxBytes }).pipe(Effect.mapError(transport))
      if (object === undefined) return yield* Protocol.failure("corruption", "A retained canonical object is missing", key)
      return object
    })
    const seal = (record: Protocol.Json) => Effect.gen(function* () {
      const digest = yield* hash(yield* Protocol.bytes(record))
      return { digest, bytes: yield* Protocol.bytes({ digest, record }) }
    })
    const unseal = (object: StoredObject, key: string, limit: number) => Effect.gen(function* () {
      if (object.bytes.length > limit) return yield* Protocol.failure("limit", `Canonical object exceeds ${limit} bytes`, key)
      const envelope = yield* Protocol.decode(Protocol.Envelope, yield* Protocol.parse(object.bytes, key), "corruption", key)
      const canonical = yield* Protocol.bytes(envelope)
      if (!Protocol.equalBytes(canonical, object.bytes)) {
        return yield* Protocol.failure("corruption", "Object bytes are not canonical JSON", key)
      }
      if (envelope.record.version !== 1) {
        return yield* Protocol.failure("unsupported-version", "Unsupported canonical protocol version", key)
      }
      if ((yield* hash(yield* Protocol.bytes(envelope.record))) !== envelope.digest) {
        return yield* Protocol.failure("corruption", "Canonical SHA-256 digest does not match the record", key)
      }
      return envelope
    })
    const sameIdentity = (record: typeof identity, key: string) =>
      record.environment === identity.environment && record.tenant === identity.tenant && record.partition === identity.partition
        ? Effect.void
        : Effect.fail(Protocol.failure("corruption", "Record belongs to a different environment, tenant, or partition", key))
    const readCommit = (sequence: string, supplied?: StoredObject) => Effect.gen(function* () {
      const key = commitKey(sequence)
      const object = supplied ?? (yield* required(key, maxCommitBytes))
      const envelope = yield* unseal(object, key, maxCommitBytes)
      const record = yield* Protocol.decode(Protocol.Commit, envelope.record, "corruption", key)
      yield* sameIdentity(record, key)
      if (record.sequence !== sequence || (sequence === "0" ? record.parentDigest !== "" : record.parentDigest === "")) {
        return yield* Protocol.failure("corruption", "Commit sequence or genesis parent does not match its slot", key)
      }
      if (record.command.id.length === 0) return yield* Protocol.failure("corruption", "Commit command identity is empty", key)
      return { record, digest: envelope.digest, size: object.bytes.length }
    })
    const checkState = (state: Protocol.State, receipts: Loaded["receipts"]) => Effect.gen(function* () {
      // Retained receipts are canonical state, not an unbounded process-side deduplication cache.
      const size = (yield* Protocol.bytes({ state, receipts })).length
      if (size > maxStateBytes) return yield* Protocol.failure("limit", `Partition state and receipts exceed ${maxStateBytes} bytes`)
    })
    const listKeys = (namespace: string) => Effect.gen(function* () {
      const keys = new Set<string>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      do {
        const page = yield* Protocol.decode(Protocol.Page, yield* store.list(namespace, cursor).pipe(Effect.mapError(transport)), "corruption", namespace)
        for (const key of page.keys) {
          if (!key.startsWith(namespace) || keys.has(key)) {
            return yield* Protocol.failure("corruption", "Listing contains an out-of-prefix or repeated canonical key", key)
          }
          keys.add(key)
        }
        cursor = page.cursor
        if (cursor !== undefined) {
          if (cursors.has(cursor)) return yield* Protocol.failure("corruption", "Object listing cursor did not advance", namespace)
          cursors.add(cursor)
        }
      } while (cursor !== undefined)
      return keys
    })
    const append = (loaded: Loaded, value: { record: Protocol.Commit; digest: string; size: number }) => Effect.gen(function* () {
      const { record, digest, size } = value
      if (record.sequence !== Protocol.nextSequence(loaded.head.sequence) || record.parentDigest !== loaded.head.digest) {
        return yield* Protocol.failure("corruption", "Commit does not extend the verified parent", commitKey(record.sequence))
      }
      if (ownReceipt(loaded, record.command.id) !== undefined) {
        return yield* Protocol.failure("corruption", "A command identity appears in more than one committed slot", commitKey(record.sequence), record.command.id)
      }
      const state = yield* Protocol.apply(loaded.head.state, record.patches, "corruption")
      const receipts = { ...loaded.receipts, [record.command.id]: Protocol.freeze({
        inputDigest: record.command.inputDigest, sequence: record.sequence, receipt: record.receipt,
      }) }
      yield* checkState(state, receipts)
      return {
        ...loaded,
        head: { sequence: record.sequence, digest, state }, receipts,
        replayRecords: loaded.replayRecords + 1, replayBytes: loaded.replayBytes + size,
      } satisfies Loaded
    })
    const load: Effect.Effect<Loaded, DurabilityFailure> = Effect.gen(function* () {
      // A verified immutable prefix is a local accelerator, never an authority hint.
      // Retained names, the current snapshot, and the cached anchor are still verified.
      const known = verified
      // LIST is paginated and unordered. Hints are intentionally never read. Retained names establish
      // the complete prefix even when a snapshot lets us avoid replaying old record bodies.
      const keys = yield* listKeys(commitsPrefix)
      const sequences: Array<string> = []
      for (const key of keys) {
        const name = key.slice(commitsPrefix.length)
        const sequence = name.endsWith(".json") ? Protocol.sequenceFromName(name.slice(0, -5)) : undefined
        if (sequence === undefined) return yield* Protocol.failure("corruption", "Invalid numbered commit key", key)
        sequences.push(sequence)
      }
      sequences.sort(Protocol.compareSequence)
      let expected = "0"
      for (const sequence of sequences) {
        if (sequence !== expected) return yield* Protocol.failure("corruption", "Retained commit history contains a gap", commitKey(expected))
        expected = Protocol.nextSequence(expected)
      }
      const latest = sequences.at(-1) ?? "-1"
      let loaded: Loaded = { head: { sequence: "-1", digest: "", state: Object.freeze({}) }, receipts: {}, replayRecords: 0, replayBytes: 0 }
      const snapshots = yield* listKeys(snapshotsPrefix)
      let snapshot: { key: string; sequence: string; digest: string } | undefined
      for (const key of snapshots) {
        const name = key.slice(snapshotsPrefix.length)
        const match = /^([0-9]{20,})-([0-9a-f]{64})\.json$/.exec(name)
        const sequence = match === null ? undefined : Protocol.sequenceFromName(match[1]!)
        if (sequence === undefined || match === null) return yield* Protocol.failure("corruption", "Invalid snapshot key", key)
        // A snapshot may have been published after the commit LIST completed. Ignore it for this
        // point-in-time read; its commit is discovered by the next load or conditional-create conflict.
        if (Protocol.compareSequence(sequence, latest) > 0) continue
        if (snapshot === undefined || Protocol.compareSequence(sequence, snapshot.sequence) > 0) {
          snapshot = { key, sequence, digest: match[2]! }
        } else if (sequence === snapshot.sequence && key !== snapshot.key) {
          return yield* Protocol.failure("corruption", "Conflicting snapshots exist for one committed sequence", key)
        }
      }
      if (snapshot !== undefined) {
        const envelope = yield* unseal(yield* required(snapshot.key, maxSnapshotBytes), snapshot.key, maxSnapshotBytes)
        const record = yield* Protocol.decode(Protocol.Snapshot, envelope.record, "corruption", snapshot.key)
        yield* sameIdentity(record, snapshot.key)
        if (record.sequence !== snapshot.sequence || envelope.digest !== snapshot.digest) {
          return yield* Protocol.failure("corruption", "Snapshot identity does not match its content-addressed key", snapshot.key)
        }
        const anchor = yield* readCommit(record.sequence)
        if (anchor.digest !== record.commitDigest) return yield* Protocol.failure("corruption", "Snapshot is not anchored to its retained commit", snapshot.key)
        for (const [id, receipt] of Object.entries(record.receipts)) {
          if (id.length === 0 || Protocol.compareSequence(receipt.sequence, record.sequence) > 0) {
            return yield* Protocol.failure("corruption", "Snapshot contains an invalid command receipt", snapshot.key)
          }
        }
        loaded = { head: { sequence: record.sequence, digest: record.commitDigest, state: Protocol.freeze(record.state) }, receipts: Protocol.freeze(record.receipts), replayRecords: 0, replayBytes: 0, snapshotKey: snapshot.key }
        const receipt = ownReceipt(loaded, anchor.record.command.id)
        if (receipt === undefined || receipt.sequence !== record.sequence || receipt.inputDigest !== anchor.record.command.inputDigest ||
          !Protocol.equalBytes(yield* Protocol.bytes(receipt.receipt), yield* Protocol.bytes(anchor.record.receipt))) {
          return yield* Protocol.failure("corruption", "Snapshot lost its anchor command receipt", snapshot.key)
        }
        yield* checkState(loaded.head.state, loaded.receipts)
      }
      if (known !== undefined) {
        if (Protocol.compareSequence(known.head.sequence, latest) > 0) {
          return yield* Protocol.failure("corruption", "Previously verified canonical history was removed", commitKey(known.head.sequence))
        }
        if (known.snapshotKey === snapshot?.key && Protocol.compareSequence(known.head.sequence, loaded.head.sequence) >= 0) {
          if (known.head.sequence !== "-1") {
            const anchor = yield* readCommit(known.head.sequence)
            if (anchor.digest !== known.head.digest) {
              return yield* Protocol.failure("corruption", "Previously verified canonical anchor changed", commitKey(known.head.sequence))
            }
          }
          loaded = known
        }
      }
      for (const sequence of sequences) {
        if (Protocol.compareSequence(sequence, loaded.head.sequence) <= 0) continue
        if (loaded.replayRecords >= snapshotEvery) {
          return yield* Protocol.failure("limit", `Recovery exceeds ${snapshotEvery} records without a published snapshot`, commitKey(sequence))
        }
        const value = yield* readCommit(sequence)
        if (loaded.replayBytes + value.size > maxReplayBytes) {
          return yield* Protocol.failure("limit", `Recovery exceeds ${maxReplayBytes} replay bytes`, commitKey(sequence))
        }
        loaded = yield* append(loaded, value)
      }
      remember(loaded)
      return loaded
    })
    const publishSnapshot = (loaded: Loaded) => Effect.gen(function* () {
      if (loaded.head.sequence === "-1") return
      const record: Protocol.Snapshot = {
        version: 1, kind: "snapshot", ...identity, sequence: loaded.head.sequence,
        commitDigest: loaded.head.digest, state: loaded.head.state, receipts: loaded.receipts,
      }
      const sealed = yield* seal(record)
      const key = `${snapshotsPrefix}${Protocol.sequenceName(record.sequence)}-${sealed.digest}.json`
      const created = yield* Effect.result(store.create(key, sealed.bytes))
      if (Result.isSuccess(created) && created.success === "created") return
      const existing = yield* store.read(key, { maxBytes: maxSnapshotBytes }).pipe(Effect.mapError(transport))
      if (existing !== undefined && Protocol.equalBytes(existing.bytes, sealed.bytes)) return
      if (existing !== undefined) return yield* Protocol.failure("corruption", "Immutable snapshot publication conflicts with existing bytes", key)
      if (Result.isFailure(created)) return yield* transport(created.failure)
      return yield* Protocol.failure("corruption", "Conflicting snapshot is not visible through a direct read", key)
    })
    const receiptFor = (loaded: Loaded, id: string, inputDigest: string) => Effect.gen(function* () {
      const prior = ownReceipt(loaded, id)
      if (prior !== undefined && prior.inputDigest !== inputDigest) {
        return yield* Protocol.failure("input-conflict", "The command identity already committed with different input", undefined, id)
      }
      return prior
    })
    const commit: Journal["commit"] = (command, evaluate) => Effect.gen(function* () {
      const validated = yield* Protocol.decode(Protocol.Command, command, "encoding")
      const inputDigest = yield* hash(yield* Protocol.bytes(validated.input))
      let loaded = yield* load
      let conflicts = 0
      while (true) {
        const prior = yield* receiptFor(loaded, validated.id, inputDigest)
        if (prior !== undefined) return prior.receipt
        if (!probed) {
          yield* probe(store, `${prefix}diagnostics`).pipe(Effect.mapError(transport))
          probed = true
        }
        // Failed post-commit snapshot publication cannot make an acknowledged command fail.
        // Before extending that head, however, publish its recovery boundary successfully.
        if (loaded.replayRecords >= snapshotEvery) {
          yield* publishSnapshot(loaded)
          loaded = { ...loaded, replayRecords: 0, replayBytes: 0 }
        }
        const evaluated = yield* evaluate(loaded.head.state)
        const decoded = yield* Protocol.decode(Protocol.Transition, evaluated, "encoding")
        // Detach the reducer's output: later user mutation must not change attempted bytes or receipts.
        const transition = yield* Protocol.decode(Protocol.Transition, yield* Protocol.parse(yield* Protocol.bytes(decoded)), "encoding")
        Protocol.freeze(transition)
        const state = yield* Protocol.apply(loaded.head.state, transition.patches, "encoding")
        const sequence = Protocol.nextSequence(loaded.head.sequence)
        const record: Protocol.Commit = {
          version: 1, kind: "commit", ...identity, sequence, parentDigest: loaded.head.digest,
          command: { id: validated.id, inputDigest }, patches: transition.patches, receipt: transition.receipt,
        }
        const receipts = { ...loaded.receipts, [validated.id]: { inputDigest, sequence, receipt: transition.receipt } }
        yield* checkState(state, receipts)
        const sealed = yield* seal(record)
        const key = commitKey(sequence)
        if (sealed.bytes.length > maxCommitBytes || sealed.bytes.length > maxReplayBytes) {
          return yield* Protocol.failure("limit", "Commit exceeds the configured commit or replay byte limit", key, validated.id)
        }
        if (loaded.replayBytes + sealed.bytes.length > maxReplayBytes) {
          yield* publishSnapshot(loaded)
          loaded = { ...loaded, replayRecords: 0, replayBytes: 0 }
        }
        const outcome = yield* Effect.result(store.create(key, sealed.bytes))
        if (Result.isSuccess(outcome) && outcome.success === "created") {
          const committed: Loaded = {
            ...loaded,
            head: { sequence, digest: sealed.digest, state }, receipts,
            replayRecords: loaded.replayRecords + 1, replayBytes: loaded.replayBytes + sealed.bytes.length,
          }
          if (committed.replayRecords >= snapshotEvery || committed.replayBytes >= maxReplayBytes) {
            yield* Effect.result(publishSnapshot(committed))
          }
          remember(committed)
          return transition.receipt
        }
        // A failed PUT can have committed. A direct read of the exact attempted slot is the only
        // reconciliation evidence; do not issue another PUT when that evidence is unavailable.
        const reconciled = yield* Effect.result(store.read(key, { maxBytes: maxCommitBytes }))
        if (Result.isFailure(reconciled) || reconciled.success === undefined) {
          const cause = Result.isFailure(reconciled) ? reconciled.failure : Result.isFailure(outcome) ? outcome.failure : undefined
          return yield* new DurabilityFailure({
            reason: "indeterminate",
            message: "The attempted commit could not be resolved by direct read; retry this command identity before external execution",
            key,
            commandId: validated.id,
            ...(cause === undefined ? {} : { cause }),
          })
        }
        const winner = yield* readCommit(sequence, reconciled.success)
        const advanced = yield* append(loaded, winner)
        remember(advanced)
        const receipt = yield* receiptFor(advanced, validated.id, inputDigest)
        if (receipt !== undefined) {
          if (advanced.replayRecords >= snapshotEvery || advanced.replayBytes >= maxReplayBytes) yield* Effect.result(publishSnapshot(advanced))
          return receipt.receipt
        }
        if (conflicts >= maxConflictRetries) {
          return yield* Protocol.failure("contention", `The command exhausted ${maxConflictRetries} conflict retries`, key, validated.id)
        }
        conflicts += 1
        // The winner proves this attempt did not commit. Reload all intervening winners and invoke
        // only the deterministic reducer again; never replay an external operation here.
        yield* Effect.yieldNow
        loaded = yield* load
      }
    }).pipe(Effect.scoped)
    return {
      read: load.pipe(
        Effect.flatMap((loaded) => Effect.gen(function* () {
          const stateDigest = yield* hash(yield* Protocol.bytes(loaded.head.state))
          return Object.freeze({ ...loaded.head, stateDigest })
        })),
        Effect.scoped,
      ),
      commit,
      lookupReceipt: (commandId: string) => load.pipe(Effect.map((loaded) => ownReceipt(loaded, commandId))),
    }
  }).pipe(Effect.scoped)
