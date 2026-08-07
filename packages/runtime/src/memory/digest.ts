import { Pins } from "@batonfx/core"
import { Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Message } from "../message.js"
import type { ExecutableRef } from "../executable-manifest.js"
import type { AdmitStartInput } from "../run-store.js"

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

export const childDigest: {
  (executableRef: ExecutableRef): (message: Message) => string
  (message: Message, executableRef: ExecutableRef): string
} = Function.dual(2, (message: Message, executableRef: ExecutableRef): string =>
  Pins.digest([messageDigest(message), executableRef]),
)

export const startDigest = (input: AdmitStartInput): string =>
  Pins.digest([
    messageDigest(input.message),
    input.initialChildren.map((child) => ({
      invocationId: child.invocationId,
      idempotencyKey: child.idempotencyKey,
      selection: child.selection,
      prompt: Schema.encodeSync(Prompt.Prompt)(child.prompt),
      sessionId: child.sessionId,
      messageId: child.messageId ?? null,
      correlationId: child.correlationId ?? null,
      metadata: child.metadata ?? {},
    })),
    input.initialFanOuts.map((fanOut) => ({
      idempotencyKey: fanOut.idempotencyKey,
      concurrency: fanOut.concurrency,
      join: fanOut.join,
      remainder: fanOut.remainder,
      members: fanOut.members.map((member) => ({
        key: member.key,
        selection: member.selection,
        prompt: Schema.encodeSync(Prompt.Prompt)(member.prompt),
        sessionId: member.sessionId ?? null,
        metadata: member.metadata ?? {},
      })),
    })),
  ])
