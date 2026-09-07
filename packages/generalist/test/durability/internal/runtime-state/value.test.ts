import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { freeze } from "../../../../src/durability/internal/protocol.js"
import { normalize, restore, Value } from "../../../../src/durability/internal/runtime-state/value.js"

const decode = Schema.decodeUnknownEffect(Value)
const strict = { onExcessProperty: "error" } as const

it.effect("reuses validated immutable values without exposing mutable cached outputs", () =>
  Effect.gen(function* () {
    const input = freeze(normalize({ retained: ["first", "second"] }))
    const first = yield* decode(input, strict)
    const second = yield* decode(input, strict)
    expect(second).toBe(first)
    expect(Object.isFrozen(second)).toBe(true)
    const restored = restore(first)
    expect(restored).toEqual({ retained: ["first", "second"] })
    expect(restore(second)).not.toBe(restored)
  }),
)

it.effect("revalidates shallow-frozen inputs whose descendants can change", () =>
  Effect.gen(function* () {
    const fields = { message: "original" }
    const input = Object.freeze({ type: "object", fields })
    expect(restore(yield* decode(input, strict))).toEqual({ message: "original" })
    fields.message = "changed"
    expect(restore(yield* decode(input, strict))).toEqual({ message: "changed" })
    Object.assign(fields, { invalid: undefined })
    expect((yield* decode(input, strict).pipe(Effect.flip))._tag).toBe("SchemaError")
  }),
)

it.effect("freezes hidden data descendants without trusting accessor-backed normalized values", () =>
  Effect.gen(function* () {
    const fields = { message: "original" }
    const data = { type: "object" }
    Object.defineProperty(data, "fields", { value: fields })
    freeze(data)
    expect(Object.isFrozen(fields)).toBe(true)
    expect(restore(yield* decode(data, strict))).toEqual({ message: "original" })
    let message = "original"
    const accessor = { type: "object" }
    Object.defineProperty(accessor, "fields", { get: () => ({ message }) })
    freeze(accessor)
    expect(restore(yield* decode(accessor, strict))).toEqual({ message: "original" })
    message = "changed"
    expect(restore(yield* decode(accessor, strict))).toEqual({ message: "changed" })
  }),
)

it.effect("does not cache permissive decoding as strict validation", () =>
  Effect.gen(function* () {
    const input = Object.freeze({ type: "undefined", unexpected: true })
    yield* decode(input)
    expect((yield* decode(input, strict).pipe(Effect.flip))._tag).toBe("SchemaError")
  }),
)

it.effect("revalidates mutable map order after warming normalized record caches", () =>
  Effect.gen(function* () {
    const order = { "0": "s:first" }
    const input = Object.freeze({ type: "map", length: 1, order, entries: { "s:first": "original" } })
    expect(restore(yield* decode(input, strict))).toEqual(new Map([["first", "original"]]))
    Reflect.set(order, "01", "s:first")
    expect((yield* decode(input, strict).pipe(Effect.flip))._tag).toBe("SchemaError")
  }),
)

it.effect("rejects extra noncanonical sequence keys instead of dropping them", () =>
  Effect.gen(function* () {
    yield* decode(freeze({ type: "array", length: 1, items: { "0": "first" } }), strict)
    for (const key of ["01", "-1", "1e0"]) {
      const array = freeze({ type: "array", length: 1, items: { "0": "first", [key]: "extra" } })
      const map = freeze({
        type: "map",
        length: 1,
        order: { "0": "s:first", [key]: "s:extra" },
        entries: { "s:first": "first" },
      })
      expect((yield* decode(array, strict).pipe(Effect.flip))._tag).toBe("SchemaError")
      expect((yield* decode(map, strict).pipe(Effect.flip))._tag).toBe("SchemaError")
    }
  }),
)

it.effect("does not cache decoding with disabled checks as validated data", () =>
  Effect.gen(function* () {
    const input = freeze({ type: "array", length: -1, items: {} })
    yield* decode(input, { ...strict, disableChecks: true })
    expect((yield* decode(input, strict).pipe(Effect.flip))._tag).toBe("SchemaError")
  }),
)

it.effect("revalidates frozen accessors instead of treating their values as immutable", () =>
  Effect.gen(function* () {
    let value = "original"
    const input = Object.freeze({
      type: "object",
      fields: Object.freeze({
        get message() {
          return value
        },
      }),
    })
    expect(restore(yield* decode(input, strict))).toEqual({ message: "original" })
    value = "changed"
    expect(restore(yield* decode(input, strict))).toEqual({ message: "changed" })
  }),
)
