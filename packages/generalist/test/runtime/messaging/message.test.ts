import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Exit, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address, Message } from "../../../src/runtime/index.js"

const envelope = (metadata: Message.Metadata) =>
  Message.make({
    id: "msg:1",
    to: Address.make("agent:assistant"),
    sessionId: "session:1",
    prompt: Prompt.make("hello"),
    idempotencyKey: "k1",
    correlationId: "corr:1",
    metadata,
  })

const jsonObjectString = Schema.fromJsonString(Schema.JsonObject)

describe("Message", () => {
  it.effect("round-trips a schema-backed addressed prompt envelope", () =>
    Effect.gen(function* () {
      const message = Message.make({
        id: "msg:1",
        to: Address.make("agent:assistant"),
        sessionId: "session:1",
        prompt: Prompt.make("hello"),
        idempotencyKey: "k1",
        correlationId: "corr:1",
        metadata: { source: "test" },
      })
      const encoded = yield* Message.encode(message)
      const decoded = yield* Message.decode(encoded)
      expect(decoded.id).toBe("msg:1")
      expect(decoded.to).toBe("agent:assistant")
      expect(decoded.idempotencyKey).toBe("k1")
      expect(decoded.metadata).toEqual({ source: "test" })
    }),
  )

  it.effect("preserves every JSON metadata key and value across encode, JSON, and decode", () =>
    Effect.gen(function* () {
      const metadata = { nested: { list: [1, "two", true, null] }, count: 0, "": "empty" }
      const encoded = yield* Message.encode(envelope(metadata))
      const json = yield* Schema.encodeEffect(jsonObjectString)(encoded.metadata)
      const decoded = yield* Message.decode({
        ...encoded,
        metadata: yield* Schema.decodeEffect(jsonObjectString)(json),
      })
      expect(decoded.metadata).toEqual(metadata)
      expect(Object.keys(decoded.metadata).toSorted()).toEqual(Object.keys(metadata).toSorted())
    }),
  )

  it("rejects metadata the canonical JSON identity cannot encode", () => {
    interface Cyclic {
      self?: Cyclic
    }
    const cyclic: Cyclic = {}
    cyclic.self = cyclic
    const rejected: ReadonlyArray<unknown> = [
      { a: undefined },
      { a: Number.NaN },
      { a: Number.POSITIVE_INFINITY },
      { a: 1n },
      { a: DateTime.toDate(DateTime.makeUnsafe(0)) },
      { a: () => 1 },
      cyclic,
    ]
    for (const metadata of rejected) expect(Schema.is(Message.Metadata)(metadata)).toBe(false)
  })

  it.effect("rejects bypassed metadata at encode instead of silently dropping values", () =>
    Effect.gen(function* () {
      const message = envelope({ a: 0 })
      Reflect.set(message.metadata, "a", undefined)
      const exit = yield* Message.encode(message).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
    }),
  )
})
