import { expect, it } from "@effect/vitest"
import { Effect, Predicate, Scheduler, Schema, SchemaTransformation } from "effect"
import { diff } from "../../../../src/durability/internal/runtime-state.js"
import { apply, freeze } from "../../../../src/durability/internal/protocol.js"
import { make } from "../../../../src/durability/internal/runtime-state/table.js"
import { normalize, Value } from "../../../../src/durability/internal/runtime-state/value.js"
import { make as schemaCache, ownership } from "../../../../src/durability/internal/runtime-state/cache.js"

const measured = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const before = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.currentOpCount))
    const value = yield* effect
    const after = yield* Effect.withFiber((fiber) => Effect.succeed(fiber.currentOpCount))
    return { value, operations: after - before }
  }).pipe(Effect.provideService(Scheduler.PreventSchedulerYield, true))

it.effect("preserves unknown-entry record decoding for plain and null-prototype dictionaries", () =>
  Effect.gen(function* () {
    const hidden = Symbol("hidden")
    const nullPrototype = { "s:first": 1 }
    Object.setPrototypeOf(nullPrototype, null)
    for (const entries of [{ "s:first": 1 }, nullPrototype]) {
      const table = make({ row: Schema.Int, originals: new WeakMap(), diff })
      const wire = freeze({ type: "map", length: 1, order: { "0": "s:first" }, entries })
      expect([...(yield* Schema.decodeUnknownEffect(table.schema)(wire))]).toEqual([["first", 1]])
      table.accept()
      table.begin()
      const invalid = { ...wire, entries: { ...entries, "s:extra": 2 } }
      expect((yield* Schema.decodeUnknownEffect(table.schema)(invalid).pipe(Effect.flip))._tag).toBe("SchemaError")
    }
    // Strict excess checks count every own property; canonical wire records never carry symbol or
    // non-enumerable keys.
    for (const entries of [
      { "s:first": 1, [hidden]: 2 },
      Object.defineProperty({ "s:first": 1 }, "s:hidden", { value: 2 }),
    ]) {
      const table = make({ row: Schema.Int, originals: new WeakMap(), diff })
      const wire = freeze({ type: "map", length: 1, order: { "0": "s:first" }, entries })
      expect((yield* Schema.decodeUnknownEffect(table.schema)(wire).pipe(Effect.flip))._tag).toBe("SchemaError")
    }
    for (const entries of [null, [], 1]) {
      const table = make({ row: Schema.Int, originals: new WeakMap(), diff })
      const wire = freeze({ type: "map", length: 0, order: {}, entries })
      expect((yield* Schema.decodeUnknownEffect(table.schema)(wire).pipe(Effect.flip))._tag).toBe("SchemaError")
    }
    let value = 1
    const table = make({ row: Schema.Int, originals: new WeakMap(), diff })
    const entries = Object.defineProperty({}, "s:first", { get: () => value, enumerable: true })
    const wire = freeze({ type: "map", length: 1, order: { "0": "s:first" }, entries })
    expect([...(yield* Schema.decodeUnknownEffect(table.schema)(wire))]).toEqual([["first", 1]])
    table.accept()
    value = 2
    expect([...(yield* Schema.decodeUnknownEffect(table.schema)(wire))]).toEqual([["first", 2]])
  }),
)

it.effect("extends a validated key prefix without losing changes or accepting a duplicate tail", () =>
  Effect.gen(function* () {
    const table = make({ row: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), originals: new WeakMap(), diff })
    const wire = freeze(
      normalize(
        new Map([
          ["first", 1],
          ["second", 2],
        ]),
      ),
    )
    const initial = yield* Schema.decodeEffect(table.schema)(wire)
    table.accept()
    table.begin()
    yield* Schema.encodeEffect(table.schema)(new Map(initial).set("first", 3).set("third", 4))
    const committed = yield* apply({ table: wire }, table.patches(["table"]), "encoding")
    const next = yield* Schema.decodeUnknownEffect(table.schema)(committed.table)
    expect([...next]).toEqual([
      ["first", 3],
      ["second", 2],
      ["third", 4],
    ])
    expect([...initial]).toEqual([
      ["first", 1],
      ["second", 2],
    ])
    table.accept()
    const corrupted = yield* apply(
      committed,
      [
        { op: "set", path: ["table", "length"], value: 4 },
        { op: "set", path: ["table", "order", "3"], value: "s:first" },
        { op: "set", path: ["table", "entries", "s:fourth"], value: 5 },
      ],
      "corruption",
    )
    expect((yield* Schema.decodeUnknownEffect(table.schema)(corrupted.table).pipe(Effect.flip))._tag).toBe(
      "SchemaError",
    )
    expect([...(yield* Schema.decodeUnknownEffect(table.schema)(committed.table))]).toEqual([...next])
  }),
)

it.effect("owns the table key snapshot while a row encoder runs", () =>
  Effect.gen(function* () {
    const entry = Schema.Struct({ value: Schema.Finite })
    let proposal = new Map<string, typeof entry.Type>()
    const row = entry.pipe(
      Schema.decodeTo(
        entry,
        SchemaTransformation.transform({
          decode: (value) => value,
          encode: (value) => {
            proposal.clear()
            return value
          },
        }),
      ),
    )
    const table = make({ row, originals: new WeakMap(), diff })
    const wire = freeze(
      normalize(
        new Map([
          ["first", { value: 1 }],
          ["second", { value: 2 }],
        ]),
      ),
    )
    const initial = yield* Schema.decodeEffect(table.schema)(wire)
    table.accept()
    table.begin()
    proposal = new Map(initial).set("first", { value: 3 })
    yield* Schema.encodeEffect(table.schema)(proposal)
    const committed = yield* apply({ table: wire }, table.patches(["table"]), "encoding")
    const fresh = make({ row, originals: new WeakMap(), diff })
    expect([...(yield* Schema.decodeUnknownEffect(fresh.schema)(committed.table))]).toEqual([
      ["first", { value: 3 }],
      ["second", { value: 2 }],
    ])
    expect([...initial]).toEqual([
      ["first", { value: 1 }],
      ["second", { value: 2 }],
    ])
    expect(proposal.size).toBe(0)
  }),
)

it.effect("rejects substituted entries even when the validated order identity is retained", () =>
  Effect.gen(function* () {
    const table = make({ row: Schema.Finite, originals: new WeakMap(), diff })
    const input = freeze(
      normalize(
        new Map([
          ["first", 1],
          ["second", 2],
        ]),
      ),
    )
    const initial = yield* Schema.decodeEffect(table.schema)(input)
    table.accept()
    const wire = yield* Schema.encodeEffect(table.schema)(initial)
    if (!Predicate.isObject(wire) || wire.type !== "map") return yield* Effect.die("Missing canonical table")
    const corrupted = { ...wire, entries: { "s:other": 1, "s:second": 2 } }
    expect((yield* Schema.decodeEffect(table.schema)(corrupted).pipe(Effect.flip))._tag).toBe("SchemaError")
    expect([...(yield* Schema.decodeEffect(table.schema)(wire))]).toEqual([
      ["first", 1],
      ["second", 2],
    ])
  }),
)

it.effect("keeps unchanged-row Effect work constant across validated table populations", () =>
  Effect.gen(function* () {
    const counts: Array<{ readonly unchanged: number; readonly changed: number; readonly committed: number }> = []
    for (const size of [10, 1000]) {
      const row = Schema.Struct({ value: Schema.Finite })
      const table = make({ row, originals: new WeakMap(), diff })
      const wire = freeze(
        normalize(new Map(Array.from({ length: size }, (_, index) => [String(index), { value: index }]))),
      )
      const initial = yield* Schema.decodeEffect(table.schema)(wire)
      table.accept()
      table.begin()
      const unchanged = yield* measured(Schema.encodeEffect(table.schema)(new Map(initial)))
      table.begin()
      const changed = yield* measured(Schema.encodeEffect(table.schema)(new Map(initial).set("0", { value: -1 })))
      const head = yield* apply({ table: wire }, table.patches(["table"]), "encoding")
      const validated = yield* Schema.decodeUnknownEffect(Value)(head.table, { onExcessProperty: "error" })
      const committed = yield* measured(Schema.decodeEffect(table.schema)(validated))
      expect(committed.value.get("0")).toEqual({ value: -1 })
      counts.push({ unchanged: unchanged.operations, changed: changed.operations, committed: committed.operations })
    }
    expect(counts[1]).toEqual(counts[0])
  }),
)

it.effect("projects only changed rows and reuses strictly decoded candidates after verified patch application", () =>
  Effect.gen(function* () {
    const calls = { decode: 0, encode: 0 }
    const entry = Schema.Struct({ value: Schema.Finite })
    const row = entry.pipe(
      Schema.decodeTo(
        entry,
        SchemaTransformation.transform({
          decode: (value) => {
            calls.decode += 1
            return value
          },
          encode: (value) => {
            calls.encode += 1
            return value
          },
        }),
      ),
    )
    const table = make({ row, originals: new WeakMap(), diff })
    const wire = freeze(
      normalize(new Map(Array.from({ length: 100 }, (_, index) => [String(index), { value: index }]))),
    )
    const initial = yield* Schema.decodeEffect(table.schema)(wire)
    table.accept()
    expect(calls).toEqual({ decode: 100, encode: 0 })
    expect(yield* Schema.decodeEffect(table.schema)(wire)).toBe(initial)
    table.accept()
    table.begin()
    const retainedWire = yield* Schema.encodeEffect(table.schema)(initial)
    expect(table.patches(["table"])).toEqual([])
    expect(calls).toEqual({ decode: 100, encode: 0 })
    table.begin()
    const changed = yield* Schema.encodeEffect(table.schema)(new Map(initial).set("50", { value: 500 }))
    if (
      !Predicate.isObject(retainedWire) ||
      retainedWire.type !== "map" ||
      !Predicate.isObject(changed) ||
      changed.type !== "map"
    )
      return yield* Effect.die("Missing canonical table")
    expect(changed.order).toBe(retainedWire.order)
    expect(calls).toEqual({ decode: 101, encode: 1 })
    const patches = table.patches(["table"])
    expect(patches).toEqual([{ op: "set", path: ["table", "entries", "s:50", "fields", "value"], value: 500 }])
    const committed = yield* apply({ table: wire }, patches, "encoding")
    const recovered = yield* Schema.decodeUnknownEffect(table.schema)(committed.table)
    table.accept()
    expect(calls).toEqual({ decode: 101, encode: 1 })
    expect(recovered.get("49")).toBe(initial.get("49"))
    expect(recovered.get("50")).toEqual({ value: 500 })
    const fresh = make({ row, originals: new WeakMap(), diff })
    const reopened = yield* Schema.decodeUnknownEffect(fresh.schema)(committed.table)
    expect(calls.decode).toBe(201)
    expect(reopened).toEqual(recovered)
    expect(reopened.get("49")).not.toBe(recovered.get("49"))
  }),
)

it.effect("rejects fresh corrupted table order and rows through the typed failure channel", () =>
  Effect.gen(function* () {
    const row = Schema.Struct({ value: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) })
    const wire = normalize(
      new Map([
        ["first", { value: 1 }],
        ["second", { value: 2 }],
      ]),
    )
    if (!Predicate.isObject(wire) || wire.type !== "map") return yield* Effect.die("Missing canonical table")
    const corruptions = [
      { ...wire, order: { "0": "s:first", "1": "s:first" } },
      { ...wire, order: { "0": "s:first", "1": "s:missing" } },
      { ...wire, order: { "0": "s:first", "01": "s:second" } },
      { ...wire, entries: { ...wire.entries, "s:second": normalize({ value: -1 }) } },
      { ...wire, entries: { ...wire.entries, "s:second": normalize({ value: 2, extra: true }) } },
    ]
    for (const corrupted of corruptions) {
      const fresh = make({ row, originals: new WeakMap(), diff })
      expect((yield* Schema.decodeEffect(fresh.schema)(corrupted).pipe(Effect.flip))._tag).toBe("SchemaError")
    }
  }),
)

it.effect("preserves table reordering and removal and rejects a losing or corrupted candidate", () =>
  Effect.gen(function* () {
    const row = Schema.Struct({ value: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) })
    const table = make({ row, originals: new WeakMap(), diff })
    const wire = freeze(
      normalize(
        new Map([
          ["first", { value: 1 }],
          ["second", { value: 2 }],
        ]),
      ),
    )
    const initial = yield* Schema.decodeEffect(table.schema)(wire)
    table.accept()
    const ordered = yield* Schema.encodeEffect(table.schema)(initial)
    table.begin()
    const reorderedWire = yield* Schema.encodeEffect(table.schema)(new Map([...initial].toReversed()))
    if (
      !Predicate.isObject(ordered) ||
      ordered.type !== "map" ||
      !Predicate.isObject(reorderedWire) ||
      reorderedWire.type !== "map"
    )
      return yield* Effect.die("Missing canonical table")
    expect(reorderedWire.order).not.toBe(ordered.order)
    const reordered = yield* apply({ table: wire }, table.patches(["table"]), "encoding")
    expect([...(yield* Schema.decodeUnknownEffect(table.schema)(reordered.table)).keys()]).toEqual(["second", "first"])
    table.accept()
    table.begin()
    const removedWire = yield* Schema.encodeEffect(table.schema)(new Map([["second", initial.get("second")!]]))
    if (!Predicate.isObject(removedWire) || removedWire.type !== "map")
      return yield* Effect.die("Missing canonical table")
    expect(removedWire.order).not.toBe(reorderedWire.order)
    const removed = yield* apply(reordered, table.patches(["table"]), "encoding")
    expect([...(yield* Schema.decodeUnknownEffect(table.schema)(removed.table))]).toEqual([["second", { value: 2 }]])
    table.accept()
    table.begin()
    yield* Schema.encodeEffect(table.schema)(new Map([["second", { value: 99 }]]))
    const winner = yield* apply(
      removed,
      [{ op: "set", path: ["table", "entries", "s:second", "fields", "value"], value: 3 }],
      "corruption",
    )
    expect((yield* Schema.decodeUnknownEffect(table.schema)(winner.table)).get("second")).toEqual({ value: 3 })
    table.accept()
    const damaged = yield* apply(
      winner,
      [{ op: "set", path: ["table", "entries", "s:second", "fields", "value"], value: -1 }],
      "corruption",
    )
    expect((yield* Schema.decodeUnknownEffect(table.schema)(damaged.table).pipe(Effect.flip))._tag).toBe("SchemaError")
    expect((yield* Schema.decodeUnknownEffect(table.schema)(winner.table)).get("second")).toEqual({ value: 3 })
  }),
)

it.effect("does not retain uncommitted mutable opaque payloads as normalization authority", () =>
  Effect.gen(function* () {
    const owned = ownership()
    const row = schemaCache(owned)(Schema.Struct({ payload: Schema.Unknown }))
    const table = make({ row, originals: new WeakMap(), diff, owned })
    const wire = freeze(normalize(new Map<string, typeof row.Type>()))
    yield* Schema.decodeEffect(table.schema)(wire)
    table.accept()
    const payload = new Uint8Array([1])
    const proposal = new Map([["row", { payload }]])
    table.begin()
    yield* Schema.encodeEffect(table.schema)(proposal)
    payload[0] = 2
    table.begin()
    yield* Schema.encodeEffect(table.schema)(proposal)
    const committed = yield* apply({ table: wire }, table.patches(["table"]), "encoding")
    const fresh = make({ row, originals: new WeakMap(), diff })
    expect((yield* Schema.decodeUnknownEffect(fresh.schema)(committed.table)).get("row")?.payload).toEqual(
      new Uint8Array([2]),
    )
  }),
)

it.effect("validates raw container metadata before reusing retained rows", () =>
  Effect.gen(function* () {
    const table = make({ row: Schema.Finite, originals: new WeakMap(), diff })
    const wire = freeze(
      normalize(
        new Map([
          ["first", 1],
          ["second", 2],
        ]),
      ),
    )
    if (!Predicate.isObject(wire) || wire.type !== "map") return yield* Effect.die("Missing canonical table")
    yield* Schema.decodeEffect(table.schema)(wire)
    table.accept()
    const inheritedOrder = { "1": "s:second", extra: "s:first" }
    Object.setPrototypeOf(inheritedOrder, { "0": "s:first" })
    for (const corrupted of [
      { ...wire, extra: true },
      { ...wire, length: -1 },
      { ...wire, length: 0.5 },
      { ...wire, length: Infinity },
      { ...wire, order: { "0": 4, "1": "s:second" } },
      { ...wire, order: ["s:first", "s:second"] },
      { ...wire, order: inheritedOrder },
      { ...wire, entries: [1, 2] },
      { ...wire, entries: { "s:first": 1 } },
    ]) {
      expect((yield* Schema.decodeUnknownEffect(table.schema)(corrupted).pipe(Effect.flip))._tag).toBe("SchemaError")
    }
    expect([...(yield* Schema.decodeEffect(table.schema)(wire))]).toEqual([
      ["first", 1],
      ["second", 2],
    ])
  }),
)

it.effect("freezes constructed table containers without retaining mutable source rows", () =>
  Effect.gen(function* () {
    const table = make({ row: Schema.Struct({ value: Schema.Finite }), originals: new WeakMap(), diff })
    const source = normalize(new Map([["row", { value: 1 }]]))
    if (!Predicate.isObject(source) || source.type !== "map") return yield* Effect.die("Missing canonical table")
    const initial = yield* Schema.decodeEffect(table.schema)(source)
    table.accept()
    const wire = yield* Schema.encodeEffect(table.schema)(initial)
    if (!Predicate.isObject(wire) || wire.type !== "map") return yield* Effect.die("Missing constructed table")
    expect(Object.isFrozen(wire)).toBe(true)
    expect(Object.isFrozen(wire.entries)).toBe(true)
    expect(Object.isFrozen(wire.order)).toBe(true)
    expect(Object.isFrozen(wire.entries["s:row"])).toBe(true)
    expect(Reflect.set(wire.entries, "s:row", null)).toBe(false)
    expect(Object.isFrozen(source.entries)).toBe(false)
    Reflect.set(source.entries, "s:row", normalize({ value: 2 }))
    expect(initial.get("row")).toEqual({ value: 1 })
    expect((yield* Schema.decodeEffect(table.schema)(source)).get("row")).toEqual({ value: 2 })
  }),
)
