import { expect, it } from "@effect/vitest"
import { Effect, Exit, Schema, SchemaParser } from "effect"
import { detach, make, mapValues } from "../../../../src/durability/internal/runtime-state/cache.js"

it("extends transformed maps without mutating retained prefix values", () => {
  const first = { value: 1 }
  const second = { value: 2 }
  const transform = mapValues<string, { value: number }, { value: number }>()
  const before = transform(new Map([["first", first]]), (value) => value)
  const after = transform(
    new Map([
      ["first", first],
      ["second", second],
    ]),
    (value) => value,
  )
  expect([...before]).toEqual([["first", first]])
  expect([...after]).toEqual([
    ["first", first],
    ["second", second],
  ])
  expect(after.get("first")).toBe(first)
})

it("preserves prior maps and snapshots input keys while mapping changed values", () => {
  const first = { value: 1 }
  const second = { value: 2 }
  const replacement = { value: 3 }
  const input = new Map([
    ["first", first],
    ["second", second],
  ])
  const transform = mapValues<string, { value: number }, { value: number }>()
  const before = transform(input, (value) => value)
  input.set("first", replacement)
  const after = transform(input, (value, key) => {
    if (key === "first") input.delete("second")
    return value
  })
  expect([...before]).toEqual([
    ["first", first],
    ["second", second],
  ])
  expect([...after]).toEqual([
    ["first", replacement],
    ["second", second],
  ])
  expect([...transform(input, (value) => value)]).toEqual([["first", replacement]])
})

it.effect("preserves resolved parser results without scheduling another continuation", () =>
  Effect.gen(function* () {
    const schema = make()(Schema.Struct({ value: Schema.Finite }))
    const input = { value: 1 }
    const decoded = SchemaParser.decodeEffect(schema)(input, { onExcessProperty: "error" })
    expect(Exit.isExit(decoded)).toBe(true)
    expect(yield* decoded).toEqual(input)
  }),
)

it.effect("keeps unresolved schema decoding lazy before retaining its result", () =>
  Effect.gen(function* () {
    let calls = 0
    const schema = make()(
      Schema.declareConstructor<{ readonly value: number }, unknown>()(
        [],
        () => () =>
          Effect.sync(() => {
            calls += 1
            return { value: calls }
          }),
      ),
    )
    const input = {}
    const decode = SchemaParser.decodeUnknownEffect(schema)
    const decoded = decode(input, { onExcessProperty: "error" })
    expect(calls).toBe(0)
    expect(yield* decoded).toEqual({ value: 1 })
    expect(yield* decode(input, { onExcessProperty: "error" })).toEqual({ value: 1 })
    expect(calls).toBe(1)
  }),
)

it("keeps reusable record templates separate from mutable public copies", () => {
  class Payload {
    value = "private"
  }
  const source = {
    label: "original",
    date: Schema.decodeSync(Schema.DateFromString)("2026-01-01T00:00:00Z"),
    bytes: new Uint8Array([1, 2]),
    values: new Map([["first", "original"]]),
    payload: new Payload(),
  }
  const copy = detach()
  const first = copy(source)
  first.label = "changed"
  first.date.setTime(0)
  first.bytes[0] = 99
  first.values.clear()
  first.payload.value = "changed"
  const second = copy(source)
  expect(second).toEqual(source)
  expect(second).not.toBe(first)
  expect(second.date).not.toBe(source.date)
  expect(second.bytes).not.toBe(source.bytes)
  expect(second.values).not.toBe(source.values)
  expect(second.payload).not.toBe(source.payload)
  expect(second.payload).not.toBe(first.payload)
  expect(second.payload).toBeInstanceOf(Payload)
})

it("copies private map templates without sharing mutable public values or changing aliases", () => {
  const date = Schema.decodeSync(Schema.DateFromString)("2026-01-01T00:00:00Z")
  const bytes = new Uint8Array([1, 2])
  const nested = new Map([["first", "private"]])
  const immutable = { value: "private" }
  const source = {
    values: new Map<string, unknown>([
      ["immutable", immutable],
      ["date", date],
      ["bytes", bytes],
      ["nested", nested],
    ]),
    aliases: { date, bytes, nested },
  }
  const copy = detach()
  const first = copy(source)
  expect(first.values.get("date")).toBe(first.aliases.date)
  expect(first.values.get("bytes")).toBe(first.aliases.bytes)
  expect(first.values.get("nested")).toBe(first.aliases.nested)
  first.values.clear()
  first.aliases.date.setTime(0)
  first.aliases.bytes.fill(0)
  first.aliases.nested.clear()
  const second = copy(source)
  expect(second.values).toEqual(source.values)
  expect(second.values.get("date")).toBe(second.aliases.date)
  expect(second.values.get("bytes")).toBe(second.aliases.bytes)
  expect(second.values.get("nested")).toBe(second.aliases.nested)
  expect(second.values).not.toBe(first.values)
  expect(second.aliases.date).not.toBe(first.aliases.date)
  expect(second.aliases.bytes).not.toBe(first.aliases.bytes)
  expect(second.aliases.nested).not.toBe(first.aliases.nested)
  expect([...second.values.keys()]).toEqual(["immutable", "date", "bytes", "nested"])
})

it("detaches mutable map keys and preserves self references on repeated reads", () => {
  const key = new Uint8Array([1])
  const source = new Map([[key, { key }]])
  const copy = detach()
  const first = copy(source)
  const [firstKey, firstValue] = first.entries().next().value!
  expect(firstKey).toBe(firstValue.key)
  firstKey[0] = 2
  const second = copy(source)
  const [secondKey, secondValue] = second.entries().next().value!
  expect(secondKey).toBe(secondValue.key)
  expect([...secondKey]).toEqual([1])
  expect(secondKey).not.toBe(firstKey)
  const cyclic = new Map<string, unknown>()
  cyclic.set("self", cyclic)
  const before = copy(cyclic)
  expect(before.get("self")).toBe(before)
  before.clear()
  const after = copy(cyclic)
  expect(after.get("self")).toBe(after)
})

it("retains transformed maps only while entries and iteration order remain identical", () => {
  const first = { value: 1 }
  const second = { value: 2 }
  const transform = mapValues<string, { value: number }, { value: number }>()
  const input = new Map([
    ["first", first],
    ["second", second],
  ])
  const initial = transform(input, (value) => value)
  expect(transform(new Map(input), (value) => value)).toBe(initial)
  const reordered = transform(new Map([...input].toReversed()), (value) => value)
  expect(reordered).not.toBe(initial)
  expect([...reordered.keys()]).toEqual(["second", "first"])
  const replacement = { value: 2 }
  const replaced = transform(new Map(reordered).set("second", replacement), (value) => value)
  expect(replaced).not.toBe(reordered)
  expect(replaced.get("second")).toBe(replacement)
  const removed = transform(new Map([["first", first]]), (value) => value)
  expect([...removed]).toEqual([["first", first]])
  expect(transform(new Map(), (value) => value).size).toBe(0)
})
