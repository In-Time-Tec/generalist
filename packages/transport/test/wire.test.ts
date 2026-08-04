import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Cursor } from "@batonfx/runtime"
import { Wire } from "../src/index.js"
import { event } from "./helpers.js"

describe("Wire", () => {
  it.effect("round-trips canonical RunEvents without wrapping their lifecycle", () =>
    Effect.gen(function* () {
      const value = event(4)
      expect(yield* Wire.producerCodec.decode(yield* Wire.producerCodec.encode(value))).toEqual(value)
    }),
  )

  it.effect("lets observers retain unknown future event tags", () =>
    Effect.gen(function* () {
      const value = { ...event(5), _tag: "FutureRuntimeFact", detail: { value: 1 } }
      expect(yield* Wire.observerCodec.decode(JSON.stringify(value))).toEqual(value)
    }),
  )

  it("decodes origin and applied cursors", () => {
    expect(Schema.decodeUnknownSync(Wire.CursorFromString)("-1")).toBe(Cursor.origin)
    expect(Schema.decodeUnknownSync(Wire.CursorFromString)("7")).toBe(7)
  })

  it.effect("encodes only attach and explicit cancellation commands", () =>
    Effect.gen(function* () {
      const cancel = { _tag: "Cancel", runId: "run-1", reason: "user" } as const
      expect(yield* Wire.decodeCommand(yield* Wire.encodeCommand(cancel))).toEqual(cancel)
    }),
  )
})
