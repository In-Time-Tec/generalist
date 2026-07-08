import { Effect, Layer } from "effect"
import * as Ai from "effect/unstable/ai"
import { ModelMiddleware } from "@batonfx/core"

const maxUserChars = 8_000

const trimPart = (part: Ai.Prompt.UserMessagePart): Ai.Prompt.UserMessagePart =>
  part.type === "text" && part.text.length > maxUserChars
    ? Ai.Prompt.makePart("text", { text: `${part.text.slice(0, maxUserChars)}\n[truncated]` })
    : part

const trimUserText: ModelMiddleware.Middleware = {
  transformPrompt: (prompt) =>
    Effect.succeed(
      Ai.Prompt.fromMessages(
        prompt.content.map((message) =>
          message.role === "user" && typeof message.content !== "string"
            ? Ai.Prompt.makeMessage("user", { content: message.content.map(trimPart) })
            : message,
        ),
      ),
    ),
}

export const middlewareLayer: Layer.Layer<ModelMiddleware.ModelMiddleware> = ModelMiddleware.layer([trimUserText])
