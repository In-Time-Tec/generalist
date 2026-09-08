import { Context, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { MessageSource } from "../run/steering.js"

/** Authenticated identity supplied at the application or executing Run boundary. @experimental */
export class SessionSender extends Context.Service<SessionSender, MessageSource>()(
  "generalist/runtime/session/message/SessionSender",
) {}

export const MessageInput = Schema.Struct({
  sessionId: Schema.String,
  commandId: Schema.String.check(Schema.isNonEmpty()),
  prompt: Prompt.Prompt,
  from: MessageSource,
})
export type MessageInput = typeof MessageInput.Type
