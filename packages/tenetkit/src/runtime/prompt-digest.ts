import { Encoding, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

/** @experimental Closed-JSON prompt value for durable identity. */
export const promptDigestValue = (prompt: Prompt.Prompt): unknown => {
  const encoded = Schema.encodeSync(Prompt.Prompt)(prompt)
  return {
    content: encoded.content.map((message) =>
      Array.isArray(message.content)
        ? {
            ...message,
            content: message.content.map((part) =>
              part.type === "file" && part.data instanceof Uint8Array
                ? { ...part, data: { _tag: "Uint8Array", base64: Encoding.encodeBase64(part.data) } }
                : part,
            ),
          }
        : message,
    ),
  }
}
