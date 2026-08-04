import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address, Message } from "../src/index.js"

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
})
