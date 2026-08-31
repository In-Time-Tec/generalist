import { Role, type Message } from "@a2a-js/sdk"
import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { MessageRejected } from "./errors.js"

const reject = (message: string, part?: number): MessageRejected =>
  part === undefined ? MessageRejected.make({ message }) : MessageRejected.make({ message, part })

/** @experimental Decode an A2A message strictly as untrusted user content. */
export const decode = (message: Message): Effect.Effect<Prompt.Prompt, MessageRejected> => {
  if (message.role !== Role.ROLE_USER) return Effect.fail(reject("only ROLE_USER messages are accepted"))
  if (message.parts.length === 0) return Effect.fail(reject("at least one message part is required"))

  return Effect.forEach(message.parts, (part, index) => {
    if (part.content?.$case === "text" && part.mediaType === "text/plain") {
      return Effect.succeed(Prompt.makePart("text", { text: part.content.value }))
    }
    if (part.content?.$case === "data" && part.mediaType === "application/json") {
      return Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(part.content.value).pipe(
        Effect.map((text) => Prompt.makePart("text", { text })),
        Effect.mapError((cause) => reject(`application/json part is not serializable: ${cause.message}`, index)),
      )
    }
    return Effect.fail(reject(`unsupported message part or media type '${part.mediaType}'`, index))
  }).pipe(Effect.map((content) => Prompt.fromMessages([Prompt.makeMessage("user", { content })])))
}
