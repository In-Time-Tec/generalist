import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Crypto, Effect, Encoding, Fiber } from "effect"
import { ObjectStore, ObjectStoreFailure } from "../../src/durability/object-store.js"
import { make as makeJournal, type Options, type State } from "../../src/durability/internal/journal.js"
import * as Protocol from "../../src/durability/internal/protocol.js"
import { make as makeSimulator, type Client } from "../../src/testing/durability/index.js"

const identity = { environment: "test", tenant: "tenant", partition: "partition" }
const prefix = "environments/test/v1/tenants/tenant/partitions/partition/"
const slot = (sequence: string) => `${prefix}commits/${Protocol.sequenceName(sequence)}.json`
const open = (client: Client, options: Partial<Options> = {}) =>
  makeJournal({ ...identity, ...options }).pipe(Effect.provideService(ObjectStore, client.store))
const increment = (state: State) => {
  const count = typeof state.count === "number" ? state.count + 1 : 1
  return Effect.succeed({ patches: [{ op: "set" as const, path: ["count"], value: count }], receipt: { count } })
}
const sealedBytes = (record: Protocol.Json) => Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto
  const digest = Encoding.encodeHex(yield* crypto.digest("SHA-256", yield* Protocol.bytes(record)))
  return yield* Protocol.bytes({ digest, record })
})

describe("immutable numbered object journal", () => {
  it.effect("serializes independent writers and reevaluates only the losing deterministic reducer", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const other = yield* bucket.connect
      const first = yield* open(bucket)
      const second = yield* open(other)
      const pause = yield* bucket.faults.pauseNextCreate(slot("0"))
      const observed: Array<number> = []
      const pending = yield* first.commit({ id: "first", input: null }, (state) => {
        observed.push(typeof state.count === "number" ? state.count : 0)
        return increment(state)
      }).pipe(Effect.forkChild({ startImmediately: true }))
      yield* pause.entered
      expect(yield* second.commit({ id: "second", input: null }, increment)).toEqual({ count: 1 })
      yield* pause.release
      expect(yield* Fiber.join(pending)).toEqual({ count: 2 })
      expect(observed).toEqual([0, 1])
      const fresh = yield* open(yield* bucket.connect)
      expect(yield* fresh.read).toMatchObject({ sequence: "1", state: { count: 2 } })
      expect(yield* first.read).toEqual(yield* second.read)
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("returns the winning original receipt for concurrent identical commands without reevaluation", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const first = yield* open(bucket)
      const second = yield* open(yield* bucket.connect)
      const pause = yield* bucket.faults.pauseNextCreate(slot("0"))
      let evaluations = 0
      const pending = yield* first.commit({ id: "same", input: { b: 2, a: 1 } }, (state) => {
        evaluations += 1
        return increment(state)
      }).pipe(Effect.forkChild({ startImmediately: true }))
      yield* pause.entered
      const receipt = yield* second.commit({ id: "same", input: { a: 1, b: 2 } }, increment)
      yield* pause.release
      expect(yield* Fiber.join(pending)).toEqual(receipt)
      expect(evaluations).toBe(1)
      expect(yield* first.read).toMatchObject({ sequence: "0", state: { count: 1 } })
      const mismatch = yield* first.commit({ id: "same", input: { a: 2, b: 2 } }, increment).pipe(Effect.flip)
      expect(mismatch.reason).toBe("input-conflict")
      expect(yield* bucket.store.read(slot("1"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("reconciles a lost successful PUT response from the exact attempted slot", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      yield* bucket.faults.failNextCreate({ key: slot("0"), phase: "after" })
      expect(yield* journal.commit({ id: "lost-response", input: null }, increment)).toEqual({ count: 1 })
      const fresh = yield* open(yield* bucket.connect)
      expect(yield* fresh.commit({ id: "lost-response", input: null }, () => Effect.fail("must not evaluate"))).toEqual({ count: 1 })
      expect(yield* fresh.read).toMatchObject({ sequence: "0", state: { count: 1 } })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("returns indeterminate when a successful PUT cannot be reconciled, then recovers its receipt after restart", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      yield* bucket.faults.failNextCreate({ key: slot("0"), phase: "after" })
      yield* bucket.faults.failNextRead({ key: slot("0") })
      const failure = yield* journal.commit({ id: "unknown", input: [1] }, increment).pipe(Effect.flip)
      expect(failure).toMatchObject({ reason: "indeterminate", commandId: "unknown", key: slot("0") })
      const fresh = yield* open(yield* bucket.connect)
      expect(yield* fresh.commit({ id: "unknown", input: [1] }, () => Effect.fail("must not evaluate"))).toEqual({ count: 1 })
      expect(yield* bucket.store.read(slot("1"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("does not retry an unconfirmed missing attempted slot inside the original commit", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      yield* bucket.faults.failNextCreate({ key: slot("0"), phase: "before" })
      expect((yield* journal.commit({ id: "retry", input: null }, increment).pipe(Effect.flip)).reason).toBe("indeterminate")
      expect(yield* bucket.store.read(slot("0"), { maxBytes: 1024 * 1024 })).toBeUndefined()
      expect(yield* journal.read).toMatchObject({ sequence: "-1", digest: "", state: {} })
      const fresh = yield* open(yield* bucket.connect)
      expect(yield* fresh.commit({ id: "retry", input: null }, increment)).toEqual({ count: 1 })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("recovers snapshots, deltas, and original receipts through paginated fresh-client discovery without trusting hints", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator({ pageSize: 1 })
      const journal = yield* open(bucket, { snapshotEvery: 2 })
      for (let index = 0; index < 7; index += 1) {
        yield* journal.commit({ id: `command-${index}`, input: index }, increment)
      }
      yield* bucket.store.create(`${prefix}latest-hint.json`, new TextEncoder().encode('{"sequence":"0"}'))
      const fresh = yield* open(yield* bucket.connect, { snapshotEvery: 1 })
      expect(yield* fresh.read).toMatchObject({ sequence: "6", state: { count: 7 } })
      expect(yield* fresh.commit({ id: "command-0", input: 0 }, () => Effect.fail("must not evaluate"))).toEqual({ count: 1 })
      expect((yield* fresh.commit({ id: "command-0", input: 99 }, increment).pipe(Effect.flip)).reason).toBe("input-conflict")
      for (let index = 0; index < 7; index += 1) expect(yield* bucket.store.read(slot(String(index)), { maxBytes: 1024 * 1024 })).toBeDefined()
      expect(yield* bucket.store.read(slot("7"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("acknowledges a committed command after snapshot failure but blocks extension until the recovery boundary publishes", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket, { snapshotEvery: 2 })
      yield* journal.commit({ id: "zero", input: null }, increment)
      const pause = yield* bucket.faults.pauseNextCreate(slot("1"))
      const pending = yield* journal.commit({ id: "one", input: null }, increment).pipe(Effect.forkChild({ startImmediately: true }))
      yield* pause.entered
      yield* bucket.faults.failNextCreate({ phase: "before" })
      yield* pause.release
      expect(yield* Fiber.join(pending)).toEqual({ count: 2 })
      const client = yield* bucket.connect
      const fresh = yield* open(client, { snapshotEvery: 2 })
      expect(yield* fresh.read).toMatchObject({ sequence: "1", state: { count: 2 } })
      yield* bucket.faults.failNextCreate({ phase: "before" })
      expect((yield* journal.commit({ id: "two", input: null }, increment).pipe(Effect.flip)).reason).toBe("transport")
      expect(yield* bucket.store.read(slot("2"), { maxBytes: 1024 * 1024 })).toBeUndefined()
      expect(yield* fresh.commit({ id: "two", input: null }, increment)).toEqual({ count: 3 })
      const bounded = yield* open(yield* bucket.connect, { snapshotEvery: 1 })
      expect(yield* bounded.read).toMatchObject({ sequence: "2", state: { count: 3 } })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("refuses a retained-history gap even when a later snapshot can reconstruct the state", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket, { snapshotEvery: 2 })
      for (let index = 0; index < 4; index += 1) yield* journal.commit({ id: String(index), input: null }, increment)
      yield* bucket.maintenance.remove(slot("1"))
      const fresh = yield* open(yield* bucket.connect, { snapshotEvery: 2 })
      expect((yield* fresh.read.pipe(Effect.flip)).reason).toBe("corruption")
      expect((yield* fresh.commit({ id: "after-gap", input: null }, increment).pipe(Effect.flip)).reason).toBe("corruption")
      expect(yield* bucket.store.read(slot("1"), { maxBytes: 1024 * 1024 })).toBeUndefined()
      expect(yield* bucket.store.read(slot("4"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("checks SHA-256 independently of an unchanged opaque ETag before any mutation", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      yield* journal.commit({ id: "original", input: null }, increment)
      const original = (yield* bucket.store.read(slot("0"), { maxBytes: 1024 * 1024 }))!
      const envelope = yield* Protocol.decode(Protocol.Envelope, yield* Protocol.parse(original.bytes), "corruption")
      const corrupt = yield* Protocol.bytes({ ...envelope, record: { ...envelope.record, receipt: "modified" } })
      yield* bucket.faults.corrupt(slot("0"), corrupt)
      expect((yield* bucket.store.read(slot("0"), { maxBytes: 1024 * 1024 }))!.etag).toBe(original.etag)
      const fresh = yield* open(yield* bucket.connect)
      expect((yield* fresh.commit({ id: "next", input: null }, increment).pipe(Effect.flip)).reason).toBe("corruption")
      expect(yield* bucket.store.read(slot("1"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("rejects unsupported versions even when their canonical checksum is valid", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      yield* journal.commit({ id: "original", input: null }, increment)
      const object = (yield* bucket.store.read(slot("0"), { maxBytes: 1024 * 1024 }))!
      const envelope = yield* Protocol.decode(Protocol.Envelope, yield* Protocol.parse(object.bytes), "corruption")
      yield* bucket.faults.corrupt(slot("0"), yield* sealedBytes({ ...envelope.record, version: 2 }))
      expect((yield* journal.commit({ id: "next", input: null }, increment).pipe(Effect.flip)).reason).toBe("unsupported-version")
      expect(yield* bucket.store.read(slot("1"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("rejects validly hashed records that break the committed parent chain", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      yield* journal.commit({ id: "zero", input: null }, increment)
      yield* journal.commit({ id: "one", input: null }, increment)
      const object = (yield* bucket.store.read(slot("1"), { maxBytes: 1024 * 1024 }))!
      const envelope = yield* Protocol.decode(Protocol.Envelope, yield* Protocol.parse(object.bytes), "corruption")
      yield* bucket.faults.corrupt(slot("1"), yield* sealedBytes({ ...envelope.record, parentDigest: "0".repeat(64) }))
      expect((yield* journal.read.pipe(Effect.flip)).reason).toBe("corruption")
      expect((yield* journal.commit({ id: "two", input: null }, increment).pipe(Effect.flip)).reason).toBe("corruption")
      expect(yield* bucket.store.read(slot("2"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("bounds state plus retained receipts and individual commits during publication and recovery", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const stateLimited = yield* open(bucket, { maxStateBytes: 300 })
      const stateError = yield* stateLimited.commit({ id: "large-state", input: null }, () => Effect.succeed({
        patches: [{ op: "set" as const, path: ["large"], value: "x".repeat(300) }], receipt: null,
      })).pipe(Effect.flip)
      expect(stateError.reason).toBe("limit")
      const receiptError = yield* stateLimited.commit({ id: "large-receipt", input: null }, () => Effect.succeed({ patches: [], receipt: "x".repeat(300) })).pipe(Effect.flip)
      expect(receiptError.reason).toBe("limit")
      const commitLimited = yield* open(bucket, { maxCommitBytes: 100 })
      expect((yield* commitLimited.commit({ id: "large-commit", input: null }, increment).pipe(Effect.flip)).reason).toBe("limit")
      expect(yield* bucket.store.read(slot("0"), { maxBytes: 1024 * 1024 })).toBeUndefined()
      const writer = yield* open(yield* bucket.connect)
      yield* writer.commit({ id: "retained", input: null }, increment)
      expect((yield* commitLimited.read.pipe(Effect.flip)).reason).toBe("limit")
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("bounds replay by bytes as well as records and snapshots before crossing the byte boundary", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket, { maxReplayBytes: 1600, snapshotEvery: 100 })
      for (let index = 0; index < 5; index += 1) yield* journal.commit({ id: String(index), input: null }, increment)
      const fresh = yield* open(yield* bucket.connect, { maxReplayBytes: 1600, snapshotEvery: 100 })
      expect(yield* fresh.read).toMatchObject({ sequence: "4", state: { count: 5 } })
      const strict = yield* open(yield* bucket.connect, { maxReplayBytes: 1 })
      expect((yield* strict.read.pipe(Effect.flip)).reason).toBe("limit")
      const noSnapshotBucket = yield* makeSimulator()
      const writer = yield* open(noSnapshotBucket)
      for (let index = 0; index < 3; index += 1) yield* writer.commit({ id: String(index), input: null }, increment)
      const recordBound = yield* open(yield* noSnapshotBucket.connect, { snapshotEvery: 2 })
      expect((yield* recordBound.read.pipe(Effect.flip)).reason).toBe("limit")
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("keeps path segments isolated and permits array replacement but not array traversal", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket, { environment: "prod/blue", tenant: "tenant/雪", partition: "p%2Fq" })
      yield* journal.commit({ id: "array", input: null }, () => Effect.succeed({
        patches: [{ op: "set" as const, path: ["array"], value: [1, 2] }], receipt: null,
      }))
      expect((yield* journal.commit({ id: "index", input: null }, () => Effect.succeed({
        patches: [{ op: "set" as const, path: ["array", "0"], value: 3 }], receipt: null,
      })).pipe(Effect.flip)).reason).toBe("encoding")
      yield* journal.commit({ id: "replace", input: null }, () => Effect.succeed({
        patches: [{ op: "set" as const, path: ["array"], value: [3] }], receipt: null,
      }))
      const fresh = yield* open(yield* bucket.connect, { environment: "prod/blue", tenant: "tenant/雪", partition: "p%2Fq" })
      expect(yield* fresh.read).toMatchObject({ sequence: "1", state: { array: [3] } })
      const isolated = yield* open(bucket, { environment: "prod", tenant: "blue/tenant/雪", partition: "p%2Fq" })
      expect(yield* isolated.read).toMatchObject({ sequence: "-1", digest: "", state: {} })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("validates snapshot bytes before using their state and retained receipts", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket, { snapshotEvery: 2 })
      yield* journal.commit({ id: "zero", input: null }, increment)
      yield* journal.commit({ id: "one", input: null }, increment)
      const snapshotKey = (yield* bucket.store.list(`${prefix}snapshots/`)).keys[0]!
      const snapshot = (yield* bucket.store.read(snapshotKey, { maxBytes: 17 * 1024 * 1024 + 4096 }))!
      const envelope = yield* Protocol.decode(Protocol.Envelope, yield* Protocol.parse(snapshot.bytes), "corruption")
      yield* bucket.faults.corrupt(snapshotKey, yield* Protocol.bytes({
        ...envelope, record: { ...envelope.record, state: { count: 99 } },
      }))
      const fresh = yield* open(yield* bucket.connect, { snapshotEvery: 2 })
      expect((yield* fresh.read.pipe(Effect.flip)).reason).toBe("corruption")
      expect((yield* fresh.commit({ id: "next", input: null }, increment).pipe(Effect.flip)).reason).toBe("corruption")
      expect(yield* bucket.store.read(slot("2"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("rejects malformed committed transitions even when their checksum is valid", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      yield* journal.commit({ id: "zero", input: null }, increment)
      const object = (yield* bucket.store.read(slot("0"), { maxBytes: 1024 * 1024 }))!
      const envelope = yield* Protocol.decode(Protocol.Envelope, yield* Protocol.parse(object.bytes), "corruption")
      yield* bucket.faults.corrupt(slot("0"), yield* sealedBytes({
        ...envelope.record, patches: [{ op: "increment", path: ["count"], value: 1 }],
      }))
      expect((yield* journal.read.pipe(Effect.flip)).reason).toBe("corruption")
      expect((yield* journal.commit({ id: "next", input: null }, increment).pipe(Effect.flip)).reason).toBe("corruption")
      expect(yield* bucket.store.read(slot("1"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("applies ordered nested object patches without changing an earlier returned head", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket)
      yield* journal.commit({ id: "initial", input: null }, () => Effect.succeed({
        patches: [{ op: "set" as const, path: ["object"], value: { keep: 1, remove: 2 } }], receipt: null,
      }))
      const earlier = yield* journal.read
      yield* journal.commit({ id: "nested", input: null }, () => Effect.succeed({
        patches: [
          { op: "set" as const, path: ["object", "added"], value: 3 },
          { op: "remove" as const, path: ["object", "remove"] },
          { op: "set" as const, path: ["object", "keep"], value: 4 },
        ], receipt: null,
      }))
      expect(earlier.state).toEqual({ object: { keep: 1, remove: 2 } })
      const fresh = yield* open(yield* bucket.connect)
      expect((yield* fresh.read).state).toEqual({ object: { keep: 4, added: 3 } })
      expect((yield* fresh.commit({ id: "missing", input: null }, () => Effect.succeed({
        patches: [{ op: "remove" as const, path: ["object", "missing"] }], receipt: null,
      })).pipe(Effect.flip)).reason).toBe("encoding")
      expect(yield* bucket.store.read(slot("2"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("encodes dot-only identities as opaque namespace segments without conflating literal escapes", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const dot = yield* open(bucket, { environment: ".", tenant: "..", partition: "." })
      yield* dot.commit({ id: "dot", input: null }, increment)
      const fresh = yield* open(yield* bucket.connect, { environment: ".", tenant: "..", partition: "." })
      expect((yield* fresh.read).state).toEqual({ count: 1 })
      const escaped = yield* open(bucket, { environment: "%2E", tenant: "%2E%2E", partition: "%2E" })
      expect(yield* escaped.read).toMatchObject({ sequence: "-1", digest: "", state: {} })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("reconstructs with read-only credentials and never probes or publishes snapshots from make or read", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      let creates = 0
      const reader = yield* makeJournal({ ...identity, snapshotEvery: 2 }).pipe(Effect.provideService(ObjectStore, {
        ...bucket.store,
        create: (key) => Effect.gen(function* () {
          creates += 1
          return yield* new ObjectStoreFailure({
            operation: "create", key, reason: "authentication", message: "Read-only credentials",
          })
        }),
      }))
      expect(yield* reader.read).toMatchObject({ sequence: "-1", state: {} })
      expect(creates).toBe(0)
      const writer = yield* open(bucket, { snapshotEvery: 2 })
      yield* writer.commit({ id: "zero", input: null }, increment)
      yield* writer.commit({ id: "one", input: null }, increment)
      expect(yield* reader.read).toMatchObject({ sequence: "1", state: { count: 2 } })
      expect(yield* reader.commit({ id: "zero", input: null }, () => Effect.fail("must not evaluate"))).toEqual({ count: 1 })
      expect(creates).toBe(0)
      const failure = yield* reader.commit({ id: "new", input: null }, increment).pipe(Effect.flip)
      expect(failure).toMatchObject({ reason: "transport", cause: { reason: "authentication", operation: "create" } })
      expect(failure.cause).toBeInstanceOf(ObjectStoreFailure)
      expect(creates).toBe(1)
      expect(yield* bucket.store.read(slot("2"), { maxBytes: 1024 * 1024 })).toBeUndefined()
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("stops deterministic conflict retries at the configured boundary without accepting a losing command", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const losing = yield* open(bucket, { maxConflictRetries: 1 })
      const winning = yield* open(yield* bucket.connect)
      const firstPause = yield* bucket.faults.pauseNextCreate(slot("0"))
      const retryPause = yield* bucket.faults.pauseNextCreate(slot("1"))
      const observed: Array<number> = []
      const pending = yield* losing.commit({ id: "contended", input: null }, (state) => {
        observed.push(typeof state.count === "number" ? state.count : 0)
        return increment(state)
      }).pipe(Effect.flip, Effect.forkChild({ startImmediately: true }))
      yield* firstPause.entered
      yield* winning.commit({ id: "winner-0", input: null }, increment)
      yield* firstPause.release
      yield* retryPause.entered
      yield* winning.commit({ id: "winner-1", input: null }, increment)
      yield* retryPause.release
      expect(yield* Fiber.join(pending)).toMatchObject({ reason: "contention", commandId: "contended", key: slot("1") })
      expect(observed).toEqual([0, 1])
      expect(yield* losing.read).toMatchObject({ sequence: "1", state: { count: 2 } })
      expect(yield* bucket.store.read(slot("2"), { maxBytes: 1024 * 1024 })).toBeUndefined()
      const fresh = yield* open(yield* bucket.connect, { maxConflictRetries: 0 })
      expect(yield* fresh.commit({ id: "contended", input: null }, increment)).toEqual({ count: 3 })
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("rejects an unbounded conflict-retry configuration before any provider mutation", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      expect((yield* open(bucket, { maxConflictRetries: Infinity }).pipe(Effect.flip)).reason).toBe("configuration")
      expect((yield* bucket.store.list(prefix)).keys).toEqual([])
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it.effect("compares canonical logical state independently of commit and receipt history", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* open(bucket, { snapshotEvery: 2 })
      yield* journal.commit({ id: "state", input: null }, increment)
      const first = yield* journal.read
      yield* journal.commit({ id: "receipt-only", input: null }, () => Effect.succeed({ patches: [], receipt: "acknowledged" }))
      const fresh = yield* open(yield* bucket.connect, { snapshotEvery: 2 })
      const second = yield* fresh.read
      const crypto = yield* Crypto.Crypto
      const expectedDigest = Encoding.encodeHex(yield* crypto.digest("SHA-256", new TextEncoder().encode('{"count":1}')))
      expect(first.state).toEqual({ count: 1 })
      expect(second.state).toEqual({ count: 1 })
      expect(first.stateDigest).toBe(expectedDigest)
      expect(second.stateDigest).toBe(expectedDigest)
      expect(second.digest).not.toBe(first.digest)
      expect(second.sequence).toBe("1")
      expect(yield* fresh.commit({ id: "receipt-only", input: null }, () => Effect.fail("must not evaluate"))).toBe("acknowledged")
    }).pipe(Effect.provide(BunCrypto.layer)),
  )

  it("preserves decimal slot identity beyond safe integers and the initial padding width", () => {
    expect(Protocol.nextSequence("9007199254740991")).toBe("9007199254740992")
    expect(Protocol.nextSequence("99999999999999999999")).toBe("100000000000000000000")
    expect(Protocol.sequenceFromName(Protocol.sequenceName("100000000000000000000"))).toBe("100000000000000000000")
    expect(["100000000000000000000", "99999999999999999999"].sort(Protocol.compareSequence)).toEqual(["99999999999999999999", "100000000000000000000"])
    expect(Protocol.sequenceFromName("000000000000000000000")).toBeUndefined()
  })
})
