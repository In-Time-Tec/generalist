import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { ConnectionLost, DeliveryOverflow, Modality } from "generalist/live"
import { register, TestProvider } from "generalist/testing/live"

register({ name: "test", make: TestProvider.make() })

const textOnly = {
  input: [{ modality: "text", mediaTypes: [] }],
  output: [{ modality: "text", mediaTypes: [] }],
  tools: false,
  interruption: false,
} as const

register({
  name: "text-only test",
  make: TestProvider.make(textOnly),
  capabilities: textOnly,
  input: [Prompt.textPart({ text: "hello" })],
  output: [Response.makePart("text-delta", { id: "delta-1", delta: "hi" })],
  response: [Response.makePart("text", { text: "hi" })],
})

it("keeps the modality union closed", () => {
  expect(Schema.decodeSync(Modality)("text")).toBe("text")
  expect(() => Schema.decodeUnknownSync(Modality)("video")).toThrow()
})

it("round-trips typed terminal failures", () => {
  const lost = ConnectionLost.make({ connectionId: "live-1", reason: "disconnected" })
  const overflow = DeliveryOverflow.make({ connectionId: "live-1", capacity: 4 })
  expect(Schema.decodeSync(ConnectionLost)(Schema.encodeSync(ConnectionLost)(lost))).toEqual(lost)
  expect(Schema.decodeSync(DeliveryOverflow)(Schema.encodeSync(DeliveryOverflow)(overflow))).toEqual(overflow)
})
