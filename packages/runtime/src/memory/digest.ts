import { Hash, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Message } from "../message.js"

export const messageDigest = (message: Message): string => {
  const encodedPrompt = Schema.encodeSync(Prompt.Prompt)(message.prompt)
  return String(
    Hash.string(
      JSON.stringify({
        to: message.to,
        from: message.from ?? null,
        sessionId: message.sessionId,
        prompt: encodedPrompt,
        causationId: message.causationId ?? null,
        correlationId: message.correlationId,
        inReplyTo: message.inReplyTo ?? null,
        metadata: message.metadata,
      }),
    ),
  )
}
