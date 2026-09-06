import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { checkJson, encode, validate } from "../../../../src/runtime/execution/payload/index.js"

const serialize = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

it.effect("bounds UTF-8 and JSON escaping without changing accepted values", () =>
  Effect.gen(function* () {
    const value = { failure: "exact\n😃", details: { code: 42 } }
    expect(yield* encode({ value, boundary: "test", serialize })).toBe(serialize(value))
    for (const text of ["ascii", "é", "😃", "\ud800"]) {
      const json = serialize(text)
      const bytes = new TextEncoder().encode(json).byteLength
      expect(checkJson({ text: json, boundary: "test", limit: bytes })).toBe(json)
      expect(() => checkJson({ text: json, boundary: "test", limit: bytes - 1 })).toThrow()
    }
    const error = yield* Effect.flip(validate({ value: "\0".repeat(60), boundary: "test", limit: 256 }))
    expect(error.message).toContain("JSON exceeds 256 bytes")
  }),
)

it.effect("rejects oversized, deep, cyclic, and expanding inputs before calling their codec", () =>
  Effect.gen(function* () {
    interface Cycle {
      next?: Cycle
    }
    type Deep = string | { next: Deep }
    type Expanding = { text: string } | ReadonlyArray<Expanding>
    const cycle: Cycle = {}
    cycle.next = cycle
    let deep: Deep = "leaf"
    for (let index = 0; index < 70; index++) deep = { next: deep }
    let expanding: Expanding = { text: "leaf" }
    for (let index = 0; index < 24; index++) expanding = [expanding, expanding]
    for (const value of ["x".repeat(4 * 1024 * 1024), cycle, deep, expanding]) {
      let encoded = false
      const error = yield* Effect.flip(
        encode({
          value,
          boundary: "test",
          serialize: () => {
            encoded = true
            return "null"
          },
        }),
      )
      expect(encoded).toBe(false)
      expect(error._tag).toBe("generalist/runtime/RuntimeUnavailable")
      expect(error.message).not.toContain("xxxx")
    }
  }),
)
