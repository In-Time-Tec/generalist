import { Effect, Option } from "effect"
import * as Ai from "effect/unstable/ai"
import * as AgentEvent from "./agent-event"
import type * as ModelMiddleware from "./model-middleware"

interface RedactOptions {
  readonly pattern: RegExp
  readonly replacement?: string
}

const replacement = (options: RedactOptions): string => options.replacement ?? "[redacted]"

const redactText = (text: string, options: RedactOptions): string => text.replace(options.pattern, replacement(options))

const redactUserPart = (part: Ai.Prompt.UserMessagePart, options: RedactOptions): Ai.Prompt.UserMessagePart =>
  part.type === "text"
    ? Ai.Prompt.makePart("text", { text: redactText(part.text, options), options: part.options })
    : part

const redactAssistantPart = (
  part: Ai.Prompt.AssistantMessagePart,
  options: RedactOptions,
): Ai.Prompt.AssistantMessagePart => {
  switch (part.type) {
    case "text":
      return Ai.Prompt.makePart("text", { text: redactText(part.text, options), options: part.options })
    case "reasoning":
      return Ai.Prompt.makePart("reasoning", { text: redactText(part.text, options), options: part.options })
    default:
      return part
  }
}

const redactToolPart = (part: Ai.Prompt.ToolMessagePart, options: RedactOptions): Ai.Prompt.ToolMessagePart => {
  if (part.type !== "tool-approval-response" || part.reason === undefined) return part
  return Ai.Prompt.makePart("tool-approval-response", {
    approvalId: part.approvalId,
    approved: part.approved,
    reason: redactText(part.reason, options),
    options: part.options,
  })
}

const redactPromptText = (prompt: Ai.Prompt.Prompt, options: RedactOptions): Ai.Prompt.Prompt =>
  Ai.Prompt.fromMessages(
    prompt.content.map((message): Ai.Prompt.Message => {
      switch (message.role) {
        case "system":
          return Ai.Prompt.makeMessage("system", {
            content: redactText(message.content, options),
            options: message.options,
          })
        case "user":
          return Ai.Prompt.makeMessage("user", {
            content: message.content.map((part) => redactUserPart(part, options)),
            options: message.options,
          })
        case "assistant":
          return Ai.Prompt.makeMessage("assistant", {
            content: message.content.map((part) => redactAssistantPart(part, options)),
            options: message.options,
          })
        case "tool":
          return Ai.Prompt.makeMessage("tool", {
            content: message.content.map((part) => redactToolPart(part, options)),
            options: message.options,
          })
      }
    }),
  )

/** @experimental Fail the run when `check` rejects the input prompt. */
export const validateInput = (
  check: (prompt: Ai.Prompt.Prompt, context: ModelMiddleware.TurnContext) => Effect.Effect<Option.Option<string>>,
): ModelMiddleware.Middleware => ({
  transformPrompt: (prompt, context) =>
    check(prompt, context).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(prompt),
          onSome: (reason) =>
            Effect.fail(
              new AgentEvent.AgentError({ message: `Input guardrail blocked: ${reason}`, turn: context.turn }),
            ),
        }),
      ),
    ),
})

/** @experimental Redact matches in text-bearing prompt fields before the model sees them. */
export const redactInput = (options: RedactOptions): ModelMiddleware.Middleware => ({
  transformPrompt: (prompt) => Effect.succeed(redactPromptText(prompt, options)),
})

/** @experimental Redact matches in streamed text deltas before Baton folds or emits them. */
export const redactOutput = (options: RedactOptions): ModelMiddleware.Middleware => ({
  transformPart: (part) => {
    if (part.type !== "text-delta") return Effect.succeed(Option.some(part))
    return Effect.succeed(
      Option.some(
        Ai.Response.makePart("text-delta", {
          id: part.id,
          delta: redactText(part.delta, options),
          metadata: part.metadata,
        }),
      ),
    )
  },
})

/** @experimental Drop streamed non-tool-call parts when `keep` returns false. */
export const filterOutput = (
  keep: (part: Ai.Response.StreamPart<any>, context: ModelMiddleware.TurnContext) => boolean,
): ModelMiddleware.Middleware => ({
  transformPart: (part, context) =>
    Effect.succeed(part.type === "tool-call" || keep(part, context) ? Option.some(part) : Option.none()),
})
