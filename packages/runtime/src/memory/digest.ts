import { Pins } from "@batonfx/core"
import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Message } from "../message.js"
import type { ExecutableRef } from "../executable-manifest.js"

export const messageDigest = (message: Message): string => {
  const encodedPrompt = Schema.encodeSync(Prompt.Prompt)(message.prompt)
  return Pins.digest({
    to: message.to,
    from: message.from ?? null,
    sessionId: message.sessionId,
    prompt: encodedPrompt,
    causationId: message.causationId ?? null,
    correlationId: message.correlationId,
    inReplyTo: message.inReplyTo ?? null,
    metadata: message.metadata,
  })
}

export const childDigest = (message: Message, executableRef: ExecutableRef): string =>
  Pins.digest([messageDigest(message), executableRef])
