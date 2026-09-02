import { Encoding, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

const makePromptDigestValue = (prompt: Prompt.Prompt) => {
  const encoded: Prompt.PromptEncoded = Schema.encodeSync(Prompt.Prompt)(prompt)
  return {
    content: encoded.content.map((message) =>
      Array.isArray(message.content)
        ? {
            ...message,
            content: message.content.map((part: Prompt.PartEncoded) =>
              part.type === "file" && part.data instanceof Uint8Array
                ? { ...part, data: { _tag: "Uint8Array", base64: Encoding.encodeBase64(part.data) } }
                : part,
            ),
          }
        : message,
    ),
  }
}

/** Closed-JSON prompt value for durable identity. */
export type PromptDigestValue = ReturnType<typeof makePromptDigestValue>

/** Closed-JSON prompt value for durable identity. */
export const promptDigestValue = (prompt: Prompt.Prompt): PromptDigestValue => makePromptDigestValue(prompt)
