import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address, Message } from "../../../../src/runtime/index.js"
import { decodeJson, decodeMessage, encodeJson, encodeMessage } from "../../../../src/runtime/sql/codec/codecs.js"

const bytes = new Uint8Array([0, 1, 2, 255])

describe("SQL codecs", () => {
  it("persists and decodes a Message containing typed file bytes", () => {
    const message = Message.make({
      id: "msg:bytes",
      to: Address.make("agent:assistant"),
      sessionId: "session:bytes",
      prompt: Prompt.fromMessages([
        Prompt.makeMessage("user", {
          content: [
            Prompt.makePart("text", { text: "inspect this image" }),
            Prompt.makePart("file", { mediaType: "image/png", fileName: "upload.png", data: bytes }),
          ],
        }),
      ]),
      idempotencyKey: "bytes",
      correlationId: "corr:bytes",
    })

    const decoded = decodeMessage(encodeMessage(message))
    const content = decoded.prompt.content[0]?.content
    expect(Array.isArray(content)).toBe(true)
    if (!Array.isArray(content)) throw new Error("expected multipart user content")
    const file = Schema.decodeUnknownSync(Schema.Struct({ type: Schema.Literal("file"), data: Schema.String }))(
      content[1],
    )
    expect(file.data).toBe("AAEC/w==")
    const restored = Schema.decodeSync(Schema.toCodecJson(Schema.Uint8Array))(file.data)
    expect(restored).toBeInstanceOf(Uint8Array)
    expect(restored).toEqual(bytes)
  })

  it("keeps the generic primitive JSON codec compatible", () => {
    const primitive = Schema.Struct({ enabled: Schema.Boolean, attempts: Schema.Finite })
    expect(decodeJson(primitive, encodeJson(primitive, { enabled: true, attempts: 3 }))).toEqual({
      enabled: true,
      attempts: 3,
    })
  })
})
