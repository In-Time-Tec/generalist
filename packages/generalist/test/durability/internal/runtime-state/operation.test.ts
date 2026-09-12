import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { ObjectStore } from "../../../../src/durability/object-store.js"
import { make as makeJournal } from "../../../../src/durability/internal/journal.js"
import { apply, freeze, type State } from "../../../../src/durability/internal/protocol.js"
import { decode, diff, encode, encodeCommandValue, make } from "../../../../src/durability/internal/runtime-state.js"
import { make as makeExecutables } from "../../../../src/durability/internal/runtime-state/executable.js"
import { Operation, RuntimeState as RuntimeSchema } from "../../../../src/durability/internal/runtime-state/schema.js"
import { normalize } from "../../../../src/durability/internal/runtime-state/value.js"
import type { OperationRecord } from "../../../../src/runtime/operation/record.js"
import {
  emptyState,
  operationKeyMapKey,
  operationMapKey,
  type RuntimeState,
} from "../../../../src/runtime/state/projection.js"
import { make as makeSimulator } from "../../../../src/testing/durability/index.js"
import { provideScoped } from "../../../runtime/execution/scoped-provide.js"

const fresh = () => ({ ...emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 8 }), nextRunCounter: 0 })
const operation: OperationRecord = {
  runId: "key:run-a",
  operationId: "op_7",
  operationKey: "payment",
  kind: "tool",
  status: "unknown",
  inputDigest: "digest-a",
  input: { amount: 17n, bytes: new Uint8Array([1, 3, 255]), absent: undefined },
  result: new Map([["receipt", { id: "external-9" }]]),
  replayPolicy: "never",
  attempt: 2,
}
const other: OperationRecord = { ...operation, runId: "run-b", inputDigest: "digest-b", input: { amount: 29n } }
const primaryKey = (record: OperationRecord) => operationMapKey(record.runId, record.operationId)
const aliasKey = (record: OperationRecord) => operationKeyMapKey(record.runId, record.operationKey)
const primaries = () => new Map([other, operation].map((record) => [primaryKey(record), record]))
const indexed = () =>
  new Map([
    [aliasKey(operation), structuredClone(operation)],
    [primaryKey(other), other],
    [aliasKey(other), structuredClone(other)],
    [primaryKey(operation), operation],
  ])
const stored = (operations: RuntimeState["operations"], nextRunCounter = 0): Effect.Effect<State> =>
  Schema.encodeEffect(RuntimeSchema)({ ...makeExecutables().encode(fresh()), operations, nextRunCounter }).pipe(
    Effect.map((encoded) => freeze({ version: 1, data: normalize(encoded) })),
    Effect.orDie,
  )
const expectIndexes = (state: RuntimeState) => {
  expect(state.operations.size).toBe(4)
  for (const record of [operation, other]) {
    const primary = state.operations.get(primaryKey(record))
    expect(primary).toEqual(record)
    expect(state.operations.get(aliasKey(record))).toBe(primary)
  }
}

it.effect("persists primary operations once and rebuilds shared by-key indexes across cold codecs", () =>
  Effect.gen(function* () {
    const canonical = yield* stored(primaries())
    expect(yield* encode({ ...fresh(), operations: indexed() })).toEqual(canonical)
    expectIndexes(yield* decode(canonical, fresh()))
    expectIndexes(yield* make().read(canonical, fresh()))
    const populated = yield* stored(indexed())
    expectIndexes(yield* decode(populated, fresh()))
    expectIndexes(yield* make().read(populated, fresh()))
  }),
)

it.effect("removes persisted aliases on an unrelated mutation against the actual old diff baseline", () =>
  Effect.gen(function* () {
    const original = yield* stored(indexed())
    const codec = make()
    const prepared = yield* codec.prepare(original, fresh(), Schema.String, (state) => {
      expectIndexes(state)
      return Effect.succeed(["receipt-unchanged", { ...state, nextRunCounter: 1 }] as const)
    })
    expect(prepared.receipt).toBe("receipt-unchanged")
    for (const record of [operation, other]) {
      expect(prepared.patches).toContainEqual({
        op: "remove",
        path: ["data", "fields", "operations", "entries", `s:${aliasKey(record)}`],
      })
    }
    const head = yield* apply(original, prepared.patches, "encoding")
    expect(head).toEqual(yield* stored(primaries(), 1))
    expect(original).toEqual(yield* stored(indexed()))
    expectIndexes(yield* make().read(head, fresh()))
    let retained: RuntimeState["operations"] | undefined
    const repeated = yield* codec.prepare(head, fresh(), Schema.Undefined, (state) => {
      retained = state.operations
      return Effect.succeed([undefined, state] as const)
    })
    expect(repeated.patches).toEqual([])
    const counter = yield* codec.prepare(head, fresh(), Schema.Undefined, (state) =>
      Effect.succeed([undefined, { ...state, nextRunCounter: 2 }] as const),
    )
    const updated = yield* apply(head, counter.patches, "encoding")
    yield* codec.prepare(updated, fresh(), Schema.Undefined, (state) => {
      expect(state.operations).toBe(retained)
      return Effect.succeed([undefined, state] as const)
    })
  }),
)

it.effect("updates both recovered indexes while persisting only the changed primary", () =>
  Effect.gen(function* () {
    const original = yield* stored(primaries())
    const codec = make()
    const completed = { ...operation, status: "succeeded" as const, completedSequence: 11 }
    const prepared = yield* codec.prepare(original, fresh(), Schema.Undefined, (state) =>
      Effect.succeed([
        undefined,
        {
          ...state,
          operations: new Map(state.operations)
            .set(primaryKey(completed), completed)
            .set(aliasKey(completed), completed),
        },
      ] as const),
    )
    const head = yield* apply(original, prepared.patches, "encoding")
    expect(head).toEqual(yield* stored(primaries().set(primaryKey(completed), completed)))
    const reopened = yield* make().read(head, fresh())
    expect(reopened.operations.get(primaryKey(completed))).toEqual(completed)
    expect(reopened.operations.get(aliasKey(completed))).toBe(reopened.operations.get(primaryKey(completed)))
    expect(reopened.operations.get(aliasKey(other))).toEqual(other)
  }),
)

it.effect("rejects orphan, divergent, misidentified, and colliding operation indexes before reduction", () =>
  Effect.gen(function* () {
    const collision = { ...operation, operationId: "op_8" }
    const corruptions = [
      new Map([[aliasKey(operation), operation]]),
      new Map([["misidentified", operation]]),
      indexed().set(aliasKey(operation), { ...operation, input: { amount: 18n } }),
      indexed().set(aliasKey(operation), { ...operation, result: new Map([["receipt", { id: "external-10" }]]) }),
      indexed().set(aliasKey(operation), { ...operation, status: "succeeded" }),
      primaries().set(primaryKey(collision), collision),
    ]
    const codec = make()
    const valid = yield* stored(primaries())
    yield* codec.read(valid, fresh())
    for (const operations of corruptions) {
      const damaged = yield* stored(operations)
      expect(yield* encode({ ...fresh(), operations }).pipe(Effect.flip)).toMatchObject({ reason: "encoding" })
      expect(yield* decode(damaged, fresh()).pipe(Effect.flip)).toMatchObject({ reason: "corruption" })
      expect(yield* codec.read(damaged, fresh()).pipe(Effect.flip)).toMatchObject({ reason: "corruption" })
      let reduced = false
      expect(
        yield* codec
          .prepare(damaged, fresh(), Schema.Undefined, (state) => {
            reduced = true
            return Effect.succeed([undefined, state] as const)
          })
          .pipe(Effect.flip),
      ).toMatchObject({ reason: "corruption" })
      expect(reduced).toBe(false)
      expect(
        yield* codec
          .prepare(valid, fresh(), Schema.Undefined, (state) =>
            Effect.succeed([undefined, { ...state, operations }] as const),
          )
          .pipe(Effect.flip),
      ).toMatchObject({ reason: "encoding" })
    }
    expectIndexes(yield* codec.read(valid, fresh()))
  }),
)

it.effect("compacts at admission capacity across competing hosts without changing retained receipts or snapshots", () =>
  provideScoped(
    BunCrypto.layer,
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const options = {
        environment: "test",
        tenant: "operations",
        partition: "bounded",
        maxStateBytes: 128 * 1024,
        snapshotEvery: 1,
      }
      const open = () => makeJournal(options).pipe(Effect.provideService(ObjectStore, bucket.store))
      const journal = yield* open()
      const large = { ...operation, input: { text: "x".repeat(40_000) } }
      const initial = yield* stored(indexed().set(primaryKey(large), large).set(aliasKey(large), large))
      const command = { id: "seed", input: { action: "retain" } }
      const receipt = yield* encodeCommandValue(other, Operation)
      yield* journal.commit(command, () => Effect.succeed({ patches: diff({}, initial), receipt }))
      const originalReceipt = yield* journal.lookupReceipt(command.id)
      const prefix = "environments/test/v1/tenants/operations/partitions/bounded/"
      const snapshots = yield* bucket.store.list(`${prefix}snapshots/`)
      const snapshotKey = snapshots.keys[0]!
      const snapshot = yield* bucket.store.read(snapshotKey, { maxBytes: 256 * 1024 })
      expect(
        yield* journal
          .commitWithHead({ id: "without-compaction", input: {} }, () =>
            Effect.succeed({ patches: [], receipt: "new", reserveBytes: 64 * 1024 }),
          )
          .pipe(Effect.flip),
      ).toMatchObject({ reason: "limit" })
      const reopened = yield* open()
      expect(yield* reopened.commit(command, () => Effect.die("Exact retry must not reduce"))).toEqual(receipt)
      expect((yield* reopened.head).state).toEqual(initial)
      const codec = make()
      const competitor = yield* open()
      const competingCodec = make()
      const compact = (selected: ReturnType<typeof make>) => (persisted: State) =>
        selected
          .prepare(persisted, fresh(), Schema.String, (state) =>
            Effect.succeed(["new", { ...state, nextRunCounter: state.nextRunCounter + 1 }] as const),
          )
          .pipe(Effect.map(({ patches, receipt: value }) => ({ patches, receipt: value, reserveBytes: 64 * 1024 })))
      const paused = yield* bucket.faults.pauseNextCreate(`${prefix}commits/00000000000000000001.json`)
      const pending = yield* reopened
        .commitWithHead({ id: "first-host", input: {} }, compact(codec))
        .pipe(Effect.forkChild({ startImmediately: true }))
      yield* paused.entered
      yield* competitor.commitWithHead({ id: "second-host", input: {} }, compact(competingCodec))
      yield* paused.release
      yield* Fiber.join(pending)
      const recovered = yield* open()
      const head = yield* recovered.head
      expect(head.sequence).toBe("2")
      expect(head.state).toEqual(yield* stored(primaries().set(primaryKey(large), large), 2))
      expect(yield* recovered.lookupReceipt(command.id)).toEqual(originalReceipt)
      expect(yield* recovered.commit(command, () => Effect.die("Retry must not redispatch"))).toEqual(receipt)
      expect(yield* bucket.store.read(snapshotKey, { maxBytes: 256 * 1024 })).toEqual(snapshot)
      const state = yield* make().read(head.state, fresh())
      expect(state.operations.get(aliasKey(large))).toEqual(large)
      expect(state.operations.get(aliasKey(other))).toEqual(other)
    }),
  ),
)
