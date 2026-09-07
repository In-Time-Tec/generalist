import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { detach, mapValues } from "../../../../src/durability/internal/runtime-state/cache.js"

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
