import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Crypto, Effect, Fiber, Schema } from "effect"
import { vi } from "vitest"
import { ObjectStore, type Service } from "../../../src/durability/object-store.js"
import { make as makeJournal } from "../../../src/durability/internal/journal.js"
import { make as makeStorage } from "../../../src/durability/internal/journal-storage.js"
import {
  byteLength,
  apply,
  bytes as encodeBytes,
  equalBytes,
  freeze,
  isImmutable,
  parse,
  sequenceName,
  set,
  setEntries,
  type Commit,
  type Json,
  type Patch,
  type State,
} from "../../../src/durability/internal/protocol.js"
import { make as makeSimulator } from "../../../src/testing/durability/index.js"

const identity = { environment: "test", tenant: "tenant", partition: "cache" }
const prefix = "environments/test/v1/tenants/tenant/partitions/cache/"
const commitKey = `${prefix}commits/00000000000000000001.json`
const transition = Effect.succeed({ patches: [], receipt: null })

it.layer(BunCrypto.layer)((test) => {
  test.effect("accounts exactly for batched immutable record additions and replacements", () =>
    Effect.gen(function* () {
      const source = freeze({ first: "original" })
      yield* byteLength(source)
      const updated = yield* setEntries(source, [
        ["first", "replacement"],
        ["__proto__", "ordinary"],
        ["second", "雪🚀"],
        ["first", "final"],
      ])
      expect(source.first).toBe("original")
      expect(updated.first).toBe("final")
      expect(Object.getOwnPropertyDescriptor(updated, "__proto__")?.value).toBe("ordinary")
      expect(isImmutable(updated)).toBe(true)
      expect(yield* byteLength(updated)).toBe((yield* encodeBytes(updated)).byteLength)
      expect(yield* setEntries(updated, [])).toBe(updated)
    }),
  )

  test.effect("bounds confirmed commit retention and decodes authority from the exact sealed bytes", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const crypto = yield* Crypto.Crypto
      let hashes = 0
      const storage = makeStorage({
        store: bucket.store,
        crypto: {
          ...crypto,
          digest: (algorithm, data) =>
            Effect.suspend(() => {
              hashes += 1
              return crypto.digest(algorithm, data)
            }),
        },
        identity,
        commitsPrefix: `${prefix}commits/`,
        maxStateBytes: 1024 * 1024,
        maxCommitBytes: 1024 * 1024,
      })
      let parentDigest = ""
      for (let index = 0; index < 4; index++) {
        const payload = { nested: { value: index }, zero: -0 }
        const path = ["payload"]
        const record: Commit = {
          ...identity,
          version: 1,
          kind: "commit",
          sequence: String(index),
          parentDigest,
          command: { id: String(index), inputDigest: "a".repeat(64) },
          patches: [{ op: "set", path, value: payload }],
          receipt: payload,
        }
        const sealed = yield* storage.sealCommit(record)
        expect(Object.isFrozen(payload)).toBe(false)
        payload.nested.value = 99
        path[0] = "changed"
        expect(yield* bucket.store.create(storage.commitKey(String(index)), sealed.bytes)).toBe("created")
        sealed.accept()
        parentDigest = sealed.digest
        sealed.bytes.fill(0)
      }
      hashes = 0
      const cached = yield* storage.readCommit("3")
      expect(hashes).toBe(0)
      expect(cached.record.receipt).toEqual({ nested: { value: 3 }, zero: 0 })
      expect(cached.record.patches).toEqual([
        { op: "set", path: ["payload"], value: { nested: { value: 3 }, zero: 0 } },
      ])
      expect(Object.isFrozen(cached.record.receipt)).toBe(true)
      yield* storage.readCommit("0")
      expect(hashes).toBe(1)
    }),
  )

  test.effect("reuses a confirmed commit only after rereading and comparing its complete bytes", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const key = `${prefix}commits/${sequenceName("0")}.json`
      const reads: Array<string> = []
      let published: Uint8Array | undefined
      const journal = yield* makeJournal(identity).pipe(
        Effect.provideService(ObjectStore, {
          ...bucket.store,
          create: (name, bytes) => {
            if (name === key) published = bytes
            return bucket.store.create(name, bytes)
          },
          read: (name, options) =>
            Effect.suspend(() => {
              reads.push(name)
              return bucket.store.read(name, options)
            }),
        }),
      )
      const committed = yield* journal.commitWithHead({ id: "first", input: null }, () =>
        Effect.succeed({
          patches: [{ op: "set", path: ["value"], value: -0 }],
          receipt: { value: -0 },
        }),
      )
      expect(published).toBeDefined()
      published!.fill(0)
      reads.length = 0
      const decode = vi.spyOn(TextDecoder.prototype, "decode")
      const { head, calls } = yield* journal.head.pipe(
        Effect.map((current) => ({ head: current, calls: decode.mock.calls.length })),
        Effect.ensuring(Effect.sync(() => decode.mockRestore())),
      )
      expect(reads).toContain(key)
      expect(calls).toBe(0)
      expect(head).toEqual(committed.head)
      expect(Object.is(head.state.value, -0)).toBe(false)
      yield* bucket.maintenance.remove(key)
      yield* bucket.store.create(key, new TextEncoder().encode("{}"))
      expect((yield* journal.head.pipe(Effect.flip)).reason).toBe("corruption")
    }),
  )

  test.effect("compares raw wide words including signed zero and distinct NaN payloads", () =>
    Effect.sync(() => {
      const patterns = [
        [0, 0],
        [0, 0x80000000],
        [0, 0x7ff00000],
        [0, 0xfff00000],
        [1, 0x7ff00000],
        [2, 0x7ff00000],
        [0, 0x7ff80000],
        [1, 0x7ff80000],
        [0, 0xfff80000],
      ]
      for (const first of patterns) {
        for (const second of patterns) {
          const left = new Uint8Array(new Uint32Array(first).buffer)
          const right = new Uint8Array(new Uint32Array(second).buffer)
          expect(equalBytes(left, right)).toBe(left.every((value, index) => value === right[index]))
        }
      }
    }),
  )

  for (const replacement of ["1.json", "00000000000000000003.json", "000000000000000000x0.json"]) {
    test.effect(`rejects a same-cardinality substituted retained prefix: ${replacement}`, () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const options = { ...identity, snapshotEvery: 2 }
        const writer = yield* makeJournal(options).pipe(Effect.provideService(ObjectStore, bucket.store))
        yield* writer.commit({ id: "zero", input: null }, () => transition)
        yield* writer.commit({ id: "one", input: null }, () => transition)
        yield* bucket.maintenance.remove(`${prefix}commits/${sequenceName("0")}.json`)
        yield* bucket.store.create(`${prefix}commits/${replacement}`, new TextEncoder().encode("{}"))
        const fresh = yield* makeJournal(options).pipe(Effect.provideService(ObjectStore, bucket.store))
        expect((yield* fresh.head.pipe(Effect.flip)).reason).toBe("corruption")
      }),
    )
  }

  test.effect("checks immutability on the exact patch value that is installed", () =>
    Effect.gen(function* () {
      let reads = 0
      const first = freeze({ value: 1 })
      const second = { value: 2 }
      const patch: Patch = {
        op: "set",
        path: ["item"],
        get value() {
          reads += 1
          return reads === 1 ? first : second
        },
      }
      const state = yield* apply(freeze({}), [patch], "encoding")
      expect(reads).toBe(1)
      expect(state.item).toBe(first)
      expect(isImmutable(state)).toBe(true)
    }),
  )

  test.effect("appends immutable receipts without rescanning retained entries", () =>
    Effect.gen(function* () {
      const counts: Array<number> = []
      for (const size of [10, 1000]) {
        const source = freeze(Object.fromEntries(Array.from({ length: size }, (_, index) => [String(index), index])))
        yield* byteLength(source)
        const encode = TextEncoder.prototype.encode
        const descriptor = Object.getOwnPropertyDescriptor
        let calls = 0
        const encoded = vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(function (
          this: TextEncoder,
          input,
        ) {
          calls += 1
          return encode.call(this, input)
        })
        const descriptors = vi.spyOn(Object, "getOwnPropertyDescriptor").mockImplementation((value, key) => {
          calls += 1
          return descriptor(value, key)
        })
        const result = yield* set(source, "__proto__", -1).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              encoded.mockRestore()
              descriptors.mockRestore()
            }),
          ),
        )
        counts.push(calls)
        expect(isImmutable(result)).toBe(true)
        expect(Object.hasOwn(source, "__proto__")).toBe(false)
        expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toBe(-1)
        expect(yield* byteLength(result)).toBe((yield* encodeBytes(result)).byteLength)
      }
      expect(counts[1]).toBe(counts[0])
      const source = { existing: { value: 1 } }
      const value = { value: 2 }
      const result = yield* set(source, "new", value)
      expect(isImmutable(result)).toBe(true)
      expect(Object.isFrozen(value)).toBe(true)
      expect(Object.hasOwn(source, "new")).toBe(false)
      expect(yield* byteLength(result)).toBe((yield* encodeBytes(result)).byteLength)
    }),
  )

  test.effect("updates exact cached sizes without remeasuring unchanged record entries", () =>
    Effect.gen(function* () {
      const counts: Array<number> = []
      for (const size of [10, 1000]) {
        const source = freeze({
          rows: Object.fromEntries(Array.from({ length: size }, (_, index) => [String(index), String(index)])),
        })
        yield* byteLength(source)
        const encode = TextEncoder.prototype.encode
        let calls = 0
        const spy = vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(function (this: TextEncoder, input) {
          calls += 1
          return encode.call(this, input)
        })
        const result = yield* apply(source, [{ op: "set", path: ["rows", "0"], value: "changed" }], "encoding").pipe(
          Effect.flatMap((state) => byteLength(state).pipe(Effect.map((bytes) => ({ state, size: bytes })))),
          Effect.ensuring(Effect.sync(() => spy.mockRestore())),
        )
        counts.push(calls)
        expect(result.size).toBe((yield* encodeBytes(result.state)).byteLength)
      }
      expect(counts[1]).toBe(counts[0])
    }),
  )

  test.effect("preserves exact size limits through empty records nested edits and escaped keys", () =>
    Effect.gen(function* () {
      const batches: ReadonlyArray<ReadonlyArray<Patch>> = [
        [{ op: "set", path: ["a"], value: "雪🚀\uD800" }],
        [{ op: "set", path: ["nested"], value: { x: 1, y: [null, -0, true] } }],
        [
          { op: "set", path: ["nested", "x"], value: false },
          { op: "remove", path: ["nested", "y"] },
        ],
        [
          { op: "set", path: ["__proto__"], value: { literal: true } },
          { op: "set", path: ['"\\\n'], value: 4 },
        ],
        [
          { op: "remove", path: ["__proto__"] },
          { op: "remove", path: ['"\\\n'] },
        ],
        [
          { op: "remove", path: ["a"] },
          { op: "remove", path: ["nested"] },
        ],
        [
          { op: "set", path: ["a"], value: 1 },
          { op: "remove", path: ["a"] },
          { op: "set", path: ["a"], value: [1, 2] },
        ],
      ]
      for (const warm of [false, true]) {
        let state: State = freeze({})
        if (warm) yield* byteLength(state)
        for (const batch of batches) {
          state = yield* apply(state, freeze(batch), "encoding")
          expect(yield* byteLength(state)).toBe((yield* encodeBytes(state)).byteLength)
        }
        const mutable = { value: "new" }
        state = yield* apply(state, [{ op: "set", path: ["mutable"], value: mutable }], "encoding")
        expect(isImmutable(state)).toBe(true)
        expect(yield* byteLength(state)).toBe((yield* encodeBytes(state)).byteLength)
      }
      const hidden: State = {}
      Object.defineProperty(hidden, "hidden", { value: 1 })
      freeze(hidden)
      yield* byteLength(hidden)
      const visible = yield* apply(hidden, [{ op: "set", path: ["hidden"], value: 2 }], "encoding")
      expect(yield* byteLength(visible)).toBe((yield* encodeBytes(visible)).byteLength)
    }),
  )

  test.effect("freezes only copied paths when the source and patch values are already immutable", () =>
    Effect.gen(function* () {
      const counts: Array<number> = []
      for (const size of [10, 1000]) {
        const source = freeze({
          rows: Object.fromEntries(Array.from({ length: size }, (_, index) => [String(index), index])),
        })
        const descriptor = Object.getOwnPropertyDescriptor
        let calls = 0
        const spy = vi.spyOn(Object, "getOwnPropertyDescriptor").mockImplementation((value, key) => {
          calls += 1
          return descriptor(value, key)
        })
        const result = yield* apply(source, [{ op: "set", path: ["rows", "0"], value: -1 }], "encoding").pipe(
          Effect.ensuring(Effect.sync(() => spy.mockRestore())),
        )
        counts.push(calls)
        expect(isImmutable(result)).toBe(true)
        expect(isImmutable(result.rows)).toBe(true)
        expect(source.rows["0"]).toBe(0)
        expect(result.rows).toMatchObject({ "0": -1 })
      }
      expect(counts[1]).toBe(counts[0])
    }),
  )

  test.effect("compares canonical bytes exactly across unaligned words and partial tails", () =>
    Effect.sync(() => {
      for (const length of [0, 1, 3, 4, 7, 8, 15, 16, 31, 255, 1024]) {
        for (const leftOffset of [0, 1, 2, 3]) {
          for (const rightOffset of [0, 1, 2, 3]) {
            const left = new Uint8Array(length + leftOffset).subarray(leftOffset)
            const right = new Uint8Array(length + rightOffset).subarray(rightOffset)
            for (let index = 0; index < length; index++) left[index] = right[index] = index % 251
            expect(equalBytes(left, right)).toBe(true)
            expect(equalBytes(left, new Uint8Array(length + 1))).toBe(false)
            if (length === 0) continue
            for (const index of new Set([0, Math.floor(length / 2), length - 1])) {
              right[index]! ^= 1
              expect(equalBytes(left, right)).toBe(false)
              right[index] = left[index]!
            }
          }
        }
      }
    }),
  )

  for (const publication of ["created", "lost-ack", "uncertain"] as const) {
    test.effect(`retains a published snapshot graph only after confirmation: ${publication}`, () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        let injected = false
        let snapshotBytes: Uint8Array | undefined
        let snapshotKey = ""
        const reads: Array<string> = []
        const journal = yield* makeJournal({ ...identity, snapshotEvery: 2 }).pipe(
          Effect.provideService(ObjectStore, {
            ...bucket.store,
            create: (key, bytes) =>
              Effect.gen(function* () {
                if (key.startsWith(`${prefix}snapshots/`)) {
                  snapshotKey = key
                  snapshotBytes = bytes
                  if (!injected && publication !== "created") {
                    injected = true
                    yield* bucket.faults.failNextCreate({ key, phase: "after" })
                    if (publication === "uncertain") yield* bucket.faults.failNextRead({ key })
                  }
                }
                return yield* bucket.store.create(key, bytes)
              }),
            read: (key, options) =>
              Effect.suspend(() => {
                reads.push(key)
                return bucket.store.read(key, options)
              }),
          }),
        )
        const payload = { retained: [1, 2, 3] }
        yield* journal.commit({ id: "first", input: null }, () =>
          Effect.succeed({
            patches: [{ op: "set", path: ["payload"], value: payload }],
            receipt: { duplicate: false },
          }),
        )
        const committed = yield* journal.commitWithHead({ id: "second", input: null }, () => transition)
        expect(reads.filter((key) => key === snapshotKey)).toHaveLength(publication === "created" ? 0 : 1)
        expect(snapshotBytes).toBeDefined()
        snapshotBytes!.fill(0)
        payload.retained[0] = 99
        const before = reads.length
        const recovered = yield* journal.head
        // The verified head covers the published snapshot: recovery re-reads only the anchor commit.
        expect(reads.slice(before)).not.toContain(snapshotKey)
        expect(reads.slice(before)).toContain(commitKey)
        expect(recovered).toEqual(committed.head)
        expect(recovered.state.payload).toBe(committed.head.state.payload)
        expect(recovered.state.payload).not.toBe(payload)
        expect(recovered.state.payload).toEqual({ retained: [1, 2, 3] })
        expect(Object.isFrozen(recovered.state.payload)).toBe(true)
        const fresh = yield* makeJournal({ ...identity, snapshotEvery: 2 }).pipe(
          Effect.provideService(ObjectStore, (yield* bucket.connect).store),
        )
        const freshHead = yield* fresh.head
        expect(freshHead).toEqual(recovered)
        expect(freshHead.state.payload).not.toBe(recovered.state.payload)
        expect(yield* fresh.commit({ id: "first", input: null }, () => Effect.die("must not evaluate"))).toEqual({
          duplicate: false,
        })
      }),
    )
  }

  for (const lostAcknowledgement of [false, true]) {
    test.effect(`returns an alias-safe verified head after publication lost-ack=${lostAcknowledgement}`, () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const key = `${prefix}commits/${sequenceName("0")}.json`
        let attempted = false
        let subsequentReads = 0
        const journal = yield* makeJournal(identity).pipe(
          Effect.provideService(ObjectStore, {
            ...bucket.store,
            create: (path, bytes) =>
              Effect.suspend(() => {
                if (path === key) attempted = true
                return bucket.store.create(path, bytes)
              }),
            read: (path, options) =>
              Effect.suspend(() => {
                if (attempted && path === key) subsequentReads += 1
                return bucket.store.read(path, options)
              }),
          }),
        )
        if (lostAcknowledgement) yield* bucket.faults.failNextCreate({ key, phase: "after" })
        const payload = { values: [1] }
        const receipt = { duplicate: false, payload }
        const committed = yield* journal.commitWithHead({ id: "first", input: null }, () =>
          Effect.succeed({ patches: [{ op: "set", path: ["payload"], value: payload }], receipt }),
        )
        expect(subsequentReads).toBe(lostAcknowledgement ? 1 : 0)
        payload.values[0] = 99
        receipt.duplicate = true
        expect(committed.receipt).toEqual({ duplicate: false, payload: { values: [1] } })
        expect(committed.head).toMatchObject({ sequence: "0", state: { payload: { values: [1] } } })
        expect(Object.isFrozen(committed)).toBe(true)
        expect(Object.isFrozen(committed.head.state)).toBe(true)
        expect(Reflect.set(committed.head.state, "payload", null)).toBe(false)
        const fresh = yield* makeJournal(identity).pipe(
          Effect.provideService(ObjectStore, (yield* bucket.connect).store),
        )
        expect(yield* fresh.head).toEqual(committed.head)
        expect(yield* fresh.commit({ id: "first", input: null }, () => Effect.die("must not evaluate"))).toEqual(
          committed.receipt,
        )
      }),
    )
  }

  test.effect("returns the latest verified head with an unchanged original duplicate receipt", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, bucket.store))
      const first = yield* journal.commitWithHead({ id: "first", input: null }, () =>
        Effect.succeed({ patches: [{ op: "set", path: ["value"], value: 1 }], receipt: { duplicate: false } }),
      )
      const second = yield* journal.commitWithHead({ id: "second", input: null }, () =>
        Effect.succeed({ patches: [{ op: "set", path: ["value"], value: 2 }], receipt: "second" }),
      )
      const duplicate = yield* journal.commitWithHead({ id: "first", input: null }, () =>
        Effect.die("must not evaluate"),
      )
      expect(duplicate.receipt).toEqual(first.receipt)
      expect(duplicate.head).toEqual(second.head)
      expect(first.head.state).toEqual({ value: 1 })
      const fresh = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, (yield* bucket.connect).store))
      expect(yield* fresh.head).toEqual(duplicate.head)
      yield* bucket.faults.corrupt(commitKey, new TextEncoder().encode("{}"))
      expect((yield* journal.head.pipe(Effect.flip)).reason).toBe("corruption")
      expect(
        (yield* journal.commitWithHead({ id: "first", input: null }, () => transition).pipe(Effect.flip)).reason,
      ).toBe("corruption")
    }),
  )

  for (const sameCommand of [false, true]) {
    test.effect(`returns the winning canonical head after contention same-command=${sameCommand}`, () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const first = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, bucket.store))
        const second = yield* makeJournal(identity).pipe(
          Effect.provideService(ObjectStore, (yield* bucket.connect).store),
        )
        const pause = yield* bucket.faults.pauseNextCreate(`${prefix}commits/${sequenceName("0")}.json`)
        const observed: Array<Json | undefined> = []
        const pending = yield* first
          .commitWithHead({ id: "first", input: null }, (state) => {
            observed.push(state.value)
            return Effect.succeed({
              patches: [{ op: "set" as const, path: ["value"], value: state.value === undefined ? 1 : 2 }],
              receipt: { duplicate: false },
            })
          })
          .pipe(Effect.forkChild({ startImmediately: true }))
        yield* pause.entered
        const winner = yield* second.commitWithHead({ id: sameCommand ? "first" : "second", input: null }, () =>
          Effect.succeed({ patches: [{ op: "set", path: ["value"], value: 1 }], receipt: { duplicate: false } }),
        )
        yield* pause.release
        const committed = yield* Fiber.join(pending)
        expect(observed).toEqual(sameCommand ? [undefined] : [undefined, 1])
        expect(committed.head).toMatchObject({
          sequence: sameCommand ? "0" : "1",
          state: { value: sameCommand ? 1 : 2 },
        })
        expect(committed.receipt).toEqual({ duplicate: false })
        if (sameCommand) expect(committed).toEqual(winner)
        const fresh = yield* makeJournal(identity).pipe(
          Effect.provideService(ObjectStore, (yield* bucket.connect).store),
        )
        expect(yield* fresh.head).toEqual(committed.head)
        yield* second.commit({ id: "later", input: null }, () =>
          Effect.succeed({ patches: [{ op: "set", path: ["value"], value: 3 }], receipt: null }),
        )
        expect((yield* first.head).state).toEqual({ value: 3 })
        expect(committed.head.state).toEqual({ value: sameCommand ? 1 : 2 })
      }),
    )
  }

  test.effect("never returns a proposed head when lost acknowledgement cannot be reconciled", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const key = `${prefix}commits/${sequenceName("0")}.json`
      const journal = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, bucket.store))
      yield* bucket.faults.failNextCreate({ key, phase: "after" })
      yield* bucket.faults.failNextRead({ key })
      const command = { id: "unknown", input: null }
      expect((yield* journal.commitWithHead(command, () => transition).pipe(Effect.flip)).reason).toBe("indeterminate")
      const fresh = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, (yield* bucket.connect).store))
      const recovered = yield* fresh.commitWithHead(command, () => Effect.die("must not evaluate"))
      expect(recovered.receipt).toBeNull()
      expect(recovered.head).toEqual(yield* fresh.head)
      expect((yield* bucket.store.list(`${prefix}commits/`)).keys).toHaveLength(1)
    }),
  )

  test.effect("reuses validated record bytes without changing canonical envelope encoding", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const crypto = yield* Crypto.Crypto
      const storage = makeStorage({
        store: bucket.store,
        crypto,
        identity,
        commitsPrefix: `${prefix}commits/`,
        maxStateBytes: 1024 * 1024,
        maxCommitBytes: 1024 * 1024,
      })
      const record = {
        version: 1,
        z: { "10": "雪", "2": "🚀", '"\\\n': "escaped" },
        a: [null, -0, true, 1e21, { reversed: "\uD800", first: 2 }],
      }
      const sealed = yield* storage.seal(record)
      expect(sealed.bytes).toEqual(yield* encodeBytes({ digest: sealed.digest, record }))
      expect((yield* storage.unseal({ ...sealed, etag: "fixture" }, "fixture", 1024 * 1024)).record).toEqual(
        yield* parse(yield* encodeBytes(record)),
      )
    }),
  )

  test.effect("detaches transitions with canonical JSON semantics before provider dispatch", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, bucket.store))
      const key = `${prefix}commits/${sequenceName("0")}.json`
      const payload = {
        zero: -0,
        nested: { value: 1 },
        text: "雪🚀\uD800",
        ["__proto__"]: { literal: true },
        constructor: "ordinary",
      }
      const expected = yield* parse(yield* encodeBytes(payload))
      const paused = yield* bucket.faults.pauseNextCreate(key)
      const committed = yield* Effect.forkScoped(
        journal.commitWithHead({ id: "detached", input: null }, () =>
          Effect.succeed({ patches: [{ op: "set", path: ["payload"], value: payload }], receipt: payload }),
        ),
      )
      yield* paused.entered
      expect(Object.isFrozen(payload)).toBe(false)
      payload.nested.value = 99
      payload.zero = 1
      yield* paused.release
      const result = yield* Fiber.join(committed)
      expect(result.receipt).toEqual(expected)
      expect(result.head.state.payload).toEqual(expected)
      const receipt = yield* Schema.decodeUnknownEffect(Schema.Struct({ zero: Schema.Finite }))(result.receipt)
      expect(Object.is(receipt.zero, 0)).toBe(true)
      const stored = yield* bucket.store.read(key, { maxBytes: 1024 * 1024 })
      if (stored === undefined) return yield* Effect.die("committed transition is missing")
      expect(stored.bytes).toEqual(yield* encodeBytes(yield* parse(stored.bytes)))
      const fresh = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, (yield* bucket.connect).store))
      expect(yield* fresh.head).toEqual(result.head)
      expect(yield* fresh.commit({ id: "detached", input: null }, () => Effect.die("must not reevaluate"))).toEqual(
        expected,
      )
    }),
  )

  test.effect("bounds verified commit reuse and keeps transport bytes separate from cached authority", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const crypto = yield* Crypto.Crypto
      const journal = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, bucket.store))
      for (let index = 0; index < 4; index++) {
        yield* journal.commit({ id: `commit-${index}`, input: null }, () => transition)
      }
      let hashes = 0
      const storage = makeStorage({
        store: bucket.store,
        crypto: {
          ...crypto,
          digest: (algorithm, data) =>
            Effect.suspend(() => {
              hashes += 1
              return crypto.digest(algorithm, data)
            }),
        },
        identity,
        commitsPrefix: `${prefix}commits/`,
        maxStateBytes: 1024 * 1024,
        maxCommitBytes: 1024 * 1024,
      })
      const supplied = yield* bucket.store.read(storage.commitKey("0"), { maxBytes: 1024 * 1024 })
      if (supplied === undefined) return yield* Effect.die("commit fixture is missing")
      const first = yield* storage.readCommit("0", supplied)
      expect(Object.isFrozen(first.record)).toBe(true)
      expect(Object.isFrozen(first.record.patches)).toBe(true)
      const before = hashes
      supplied.bytes[supplied.bytes.length - 1] = 0
      expect(yield* storage.readCommit("0")).toBe(first)
      expect(hashes).toBe(before)
      for (let index = 1; index < 4; index++) yield* storage.readCommit(String(index))
      const filled = hashes
      yield* storage.readCommit("3")
      expect(hashes).toBe(filled)
      yield* storage.readCommit("0")
      expect(hashes).toBe(filled + 1)
    }),
  )

  test.effect("rejects changed same-length anchor bytes even when the provider token is unchanged", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const store: Service = {
        ...bucket.store,
        read: (key, options) =>
          bucket.store
            .read(key, options)
            .pipe(Effect.map((object) => (object === undefined ? undefined : { ...object, etag: "unchanged-token" }))),
      }
      const journal = yield* makeJournal(identity).pipe(Effect.provideService(ObjectStore, store))
      yield* journal.commit({ id: "first", input: null }, () => transition)
      yield* journal.commit({ id: "second", input: null }, () => transition)
      yield* journal.head
      yield* journal.head
      const anchor = yield* bucket.store.read(commitKey, { maxBytes: 1024 * 1024 })
      if (anchor === undefined) return yield* Effect.die("anchor fixture is missing")
      anchor.bytes[anchor.bytes.length - 1] = 93
      yield* bucket.faults.corrupt(commitKey, anchor.bytes)
      expect((yield* journal.head.pipe(Effect.flip)).reason).toBe("corruption")
      expect((yield* journal.commit({ id: "third", input: null }, () => transition).pipe(Effect.flip)).reason).toBe(
        "corruption",
      )
      expect((yield* bucket.store.list(`${prefix}commits/`)).keys).toHaveLength(2)
    }),
  )

  test.effect("compares every snapshot byte including the final byte and length", () =>
    Effect.sync(() => {
      const bytes = new Uint8Array(65_537).fill(97)
      const copy = bytes.slice()
      expect(equalBytes(bytes, copy)).toBe(true)
      copy[copy.length - 1] = 98
      expect(equalBytes(bytes, copy)).toBe(false)
      expect(equalBytes(bytes, bytes.subarray(1))).toBe(false)
      expect(equalBytes(new Uint8Array(), new Uint8Array())).toBe(true)
    }),
  )
  test.effect("measures canonical UTF-8 size without sorting the input", () =>
    Effect.gen(function* () {
      const values: ReadonlyArray<Json> = [
        null,
        -0,
        [],
        {},
        { "10": "雪", "2": "🚀", '"\\\n': "escaped" },
        { z: "雪🚀\uD800", a: [null, -0, true, 1e21, { reversed: 1, first: 2 }] },
      ]
      for (const value of values) {
        const expected = (yield* encodeBytes(value)).byteLength
        expect(yield* byteLength(value)).toBe(expected)
        expect(yield* byteLength(freeze(value))).toBe(expected)
        expect(yield* byteLength(value)).toBe(expected)
      }
    }),
  )
  test.effect("reuses immutable subtree sizes while measuring changed parent fields", () =>
    Effect.gen(function* () {
      let visits = 0
      const retained = freeze(
        new Proxy(
          { text: "unchanged" },
          {
            ownKeys: (target) => {
              visits += 1
              return Reflect.ownKeys(target)
            },
          },
        ),
      )
      const before = visits
      const size = yield* byteLength(retained)
      expect(visits).toBeGreaterThan(before)
      const measured = visits
      expect(yield* byteLength(retained)).toBe(size)
      const next = freeze({ retained, changed: "雪🚀" })
      const nextSize = yield* byteLength(next)
      expect(visits).toBe(measured)
      expect(nextSize).toBe((yield* encodeBytes(next)).byteLength)
    }),
  )

  test.effect("does not reuse sizes for frozen objects with changing accessors", () =>
    Effect.gen(function* () {
      let text = "short"
      const value = freeze({
        get text() {
          return text
        },
      })
      expect(yield* byteLength(value)).toBe((yield* encodeBytes(value)).byteLength)
      text = "a longer value"
      expect(yield* byteLength(value)).toBe((yield* encodeBytes(value)).byteLength)
    }),
  )
  test.effect("reuses verified snapshot decoding and head hashing while rereading the anchor commit", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const crypto = yield* Crypto.Crypto
      let hashes = 0
      const reads: Array<string> = []
      const countedCrypto: Crypto.Crypto = {
        ...crypto,
        digest: (algorithm, data) =>
          Effect.suspend(() => {
            hashes += 1
            return crypto.digest(algorithm, data)
          }),
      }
      const countedStore: Service = {
        ...bucket.store,
        read: (key, options) =>
          Effect.suspend(() => {
            reads.push(key)
            return bucket.store.read(key, options)
          }),
      }
      const journal = yield* makeJournal({ ...identity, snapshotEvery: 2 }).pipe(
        Effect.provideService(ObjectStore, countedStore),
        Effect.provideService(Crypto.Crypto, countedCrypto),
      )
      yield* journal.commit({ id: "first", input: null }, () => transition)
      yield* journal.commit({ id: "second", input: null }, () => transition)
      const snapshotKey = (yield* bucket.store.list(`${prefix}snapshots/`)).keys[0]!
      const before = hashes
      const first = yield* journal.read
      const firstHashes = hashes - before
      const afterFirst = hashes
      const firstReads = reads.length
      expect(yield* journal.read).toEqual(first)
      expect(hashes - afterFirst).toBeLessThan(firstHashes)
      expect(reads.slice(firstReads)).not.toContain(snapshotKey)
      expect(reads.slice(firstReads)).toContain(commitKey)
    }),
  )

  test.effect("reads the verified head without computing an unused state fingerprint", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const crypto = yield* Crypto.Crypto
      let hashes = 0
      const journal = yield* makeJournal({ ...identity, snapshotEvery: 2 }).pipe(
        Effect.provideService(ObjectStore, bucket.store),
        Effect.provideService(Crypto.Crypto, {
          ...crypto,
          digest: (algorithm, data) =>
            Effect.suspend(() => {
              hashes += 1
              return crypto.digest(algorithm, data)
            }),
        }),
      )
      yield* journal.commit({ id: "first", input: null }, () => transition)
      yield* journal.commit({ id: "second", input: null }, () => transition)
      yield* journal.head
      const beforeHead = hashes
      const head = yield* journal.head
      const headHashes = hashes - beforeHead
      const beforeRead = hashes
      const inspection = yield* journal.read
      expect(hashes - beforeRead).toBe(headHashes + 1)
      expect(inspection).toMatchObject(head)
      expect(Object.isFrozen(head)).toBe(true)
      const snapshotKey = (yield* bucket.store.list(`${prefix}snapshots/`)).keys[0]!
      yield* bucket.faults.corrupt(snapshotKey, new TextEncoder().encode("{}"))
      // A snapshot at or below the verified head is a covered accelerator: warm recovery no longer
      // reads it, and the corruption is still detected on the next cold load.
      expect(yield* journal.head).toMatchObject({ sequence: "1" })
      const fresh = yield* makeJournal({ ...identity, snapshotEvery: 2 }).pipe(
        Effect.provideService(ObjectStore, (yield* bucket.connect).store),
      )
      expect((yield* fresh.head.pipe(Effect.flip)).reason).toBe("corruption")
    }),
  )

  for (const target of ["snapshot", "anchor"] as const) {
    test.effect(`rejects a changed ${target} after its snapshot was cached`, () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const journal = yield* makeJournal({ ...identity, snapshotEvery: 2 }).pipe(
          Effect.provideService(ObjectStore, {
            ...bucket.store,
            read: (key, options) =>
              bucket.store
                .read(key, options)
                .pipe(
                  Effect.map((object) =>
                    object === undefined ? undefined : { ...object, etag: "unchanged-provider-token" },
                  ),
                ),
          }),
        )
        yield* journal.commit({ id: "first", input: null }, () => transition)
        yield* journal.commit({ id: "second", input: null }, () => transition)
        yield* journal.read
        yield* journal.read
        const snapshotKey = (yield* bucket.store.list(`${prefix}snapshots/`)).keys[0]!
        yield* bucket.faults.corrupt(target === "snapshot" ? snapshotKey : commitKey, new TextEncoder().encode("{}"))
        if (target === "snapshot") {
          // The verified head dominates a covered snapshot, so it is no longer re-read; the next
          // snapshot-boundary publication still detects the conflicting immutable bytes.
          expect(yield* journal.read).toMatchObject({ sequence: "1" })
        } else {
          expect((yield* journal.read.pipe(Effect.flip)).reason).toBe("corruption")
        }
        expect((yield* journal.commit({ id: "third", input: null }, () => transition).pipe(Effect.flip)).reason).toBe(
          "corruption",
        )
        expect((yield* bucket.store.list(`${prefix}commits/`)).keys).toHaveLength(2)
        const fresh = yield* makeJournal(identity).pipe(
          Effect.provideService(ObjectStore, (yield* bucket.connect).store),
        )
        expect((yield* fresh.head.pipe(Effect.flip)).reason).toBe("corruption")
      }),
    )
  }
})
