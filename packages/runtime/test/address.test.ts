import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Address } from "../src/index.js"

describe("Address", () => {
  it.effect("brands non-empty routing keys", () =>
    Effect.gen(function* () {
      const address = Address.make("agent:assistant")
      expect(address).toBe("agent:assistant")
      const encoded = yield* Address.encode(address)
      expect(encoded).toBe("agent:assistant")
      const decoded = yield* Address.decode(encoded)
      expect(decoded).toBe(address)
    }),
  )

  it("rejects empty addresses", () => {
    expect(() => Address.make("")).toThrow()
    expect(Schema.decodeUnknownExit(Address.Address)("")).toMatchObject({ _tag: "Failure" })
  })
})
