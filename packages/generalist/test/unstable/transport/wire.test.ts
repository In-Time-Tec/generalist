import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Cursor } from "generalist/runtime"
import { Response } from "effect/unstable/ai"
import { Wire } from "../../../src/unstable/transport/index.js"
import { event } from "./fixtures.js"

const encodeJson = <A>(value: A): string => Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value)

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
      expect(yield* Wire.observerCodec.decode(encodeJson(value))).toEqual(value)
    }),
  )

  it.effect("strictly validates payloads for known event tags", () =>
    Effect.gen(function* () {
      const malformed = { ...event(5), _tag: "RunCompleted" }
      const error = yield* Wire.observerCodec.decode(encodeJson(malformed)).pipe(Effect.flip)
      expect(error._tag).toBe("generalist/transport/WireCodecFailed")
    }),
  )

  it.effect("keeps durable model events compact and exposes only host-resolved observer content", () =>
    Effect.gen(function* () {
      const compact = {
        ...event(6),
        _tag: "ModelResponseInterrupted" as const,
        turn: 0,
        operationKey: "run-1:model:0",
        modelCallId: "model-call-1",
        modelAttemptId: "model-attempt-1",
        attempt: 0,
        sessionId: "session-1",
        sessionParentId: "entry:input",
        sessionEntryId: "entry-1",
        reason: "failure" as const,
        digest: "digest-1",
      }
      const durable = yield* Wire.producerCodec.decode(yield* Wire.producerCodec.encode(compact))
      expect(durable).not.toHaveProperty("response")
      const unresolved = yield* Wire.observerCodec.decode(encodeJson(compact)).pipe(Effect.flip)
      expect(unresolved._tag).toBe("generalist/transport/WireCodecFailed")
      const resolved = {
        ...compact,
        response: { content: [Response.makePart("text", { text: "retained" })] },
      }
      expect(yield* Wire.observerCodec.decode(yield* Wire.observerCodec.encode(resolved))).toEqual(resolved)
    }),
  )

  it("decodes origin and applied cursors", () => {
    expect(Schema.decodeSync(Wire.CursorFromString)("-1")).toBe(Cursor.origin)
    expect(Schema.decodeSync(Wire.CursorFromString)("7")).toBe(7)
  })

  it.effect("encodes only attach and explicit cancellation commands", () =>
    Effect.gen(function* () {
      const cancel = { _tag: "Cancel", runId: "run-1", reason: "user" } as const
      expect(yield* Wire.decodeCommand(yield* Wire.encodeCommand(cancel))).toEqual(cancel)
    }),
  )
})
