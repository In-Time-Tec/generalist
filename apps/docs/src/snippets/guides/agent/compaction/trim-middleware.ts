import { Effect, Layer, Schema } from "effect"
import { ModelMiddleware } from "generalist"
import { Prompt } from "effect/unstable/ai"

const maxUserChars = 8_000

const trimPart = (part: Prompt.UserMessagePart): Prompt.UserMessagePart =>
  part.type === "text" && part.text.length > maxUserChars
    ? Prompt.makePart("text", { text: `${part.text.slice(0, maxUserChars)}\n[truncated]` })
    : part

const trimUserText: ModelMiddleware.Middleware = {
  transformPrompt: (prompt) =>
    Effect.succeed(
      Prompt.fromMessages(
        prompt.content.map((message) =>
          message.role === "user" && !Schema.is(Schema.String)(message.content)
            ? Prompt.makeMessage("user", { content: message.content.map(trimPart) })
            : message,
        ),
      ),
    ),
}

export const middlewareLayer: Layer.Layer<ModelMiddleware.ModelMiddleware> = ModelMiddleware.layer([trimUserText])
