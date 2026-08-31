import { Effect, Option } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentError } from "../agent/event.js"
import { isMessageFromRecall, replaceRecalledMessage } from "../context/memory.js"
import type { Middleware, TurnContext } from "../model/middleware.js"

interface RedactOptions {
  readonly pattern: RegExp
  readonly replacement?: string
}

const replacement = (options: RedactOptions): string => options.replacement ?? "[redacted]"

const redactText = (text: string, options: RedactOptions): string => text.replace(options.pattern, replacement(options))

const redactUserPart = (part: Prompt.UserMessagePart, options: RedactOptions): Prompt.UserMessagePart =>
  part.type === "text" ? Prompt.makePart("text", { text: redactText(part.text, options), options: part.options }) : part

const redactAssistantPart = (
  part: Prompt.AssistantMessagePart,
  options: RedactOptions,
): Prompt.AssistantMessagePart => {
  switch (part.type) {
    case "text":
      return Prompt.makePart("text", { text: redactText(part.text, options), options: part.options })
    case "reasoning":
      return Prompt.makePart("reasoning", { text: redactText(part.text, options), options: part.options })
    default:
      return part
  }
}

const redactToolPart = (part: Prompt.ToolMessagePart, options: RedactOptions): Prompt.ToolMessagePart => {
  if (part.type !== "tool-approval-response" || part.reason === undefined) return part
  return Prompt.makePart("tool-approval-response", {
    approvalId: part.approvalId,
    approved: part.approved,
    reason: redactText(part.reason, options),
    options: part.options,
  })
}

const redactPromptText = (prompt: Prompt.Prompt, options: RedactOptions): Prompt.Prompt =>
  Prompt.fromMessages(
    prompt.content.map((message): Prompt.Message => {
      switch (message.role) {
        case "system":
          return Prompt.makeMessage("system", {
            content: redactText(message.content, options),
            options: message.options,
          })
        case "user":
          return isMessageFromRecall(message)
            ? replaceRecalledMessage(
                message,
                message.content.map((part) => redactUserPart(part, options)),
              )
            : Prompt.makeMessage("user", {
                content: message.content.map((part) => redactUserPart(part, options)),
                options: message.options,
              })
        case "assistant":
          return Prompt.makeMessage("assistant", {
            content: message.content.map((part) => redactAssistantPart(part, options)),
            options: message.options,
          })
        case "tool":
          return Prompt.makeMessage("tool", {
            content: message.content.map((part) => redactToolPart(part, options)),
            options: message.options,
          })
      }
    }),
  )

/** @experimental Fail the run when `check` rejects the input prompt. */
export const validateInput = (
  check: (prompt: Prompt.Prompt, context: TurnContext) => Effect.Effect<Option.Option<string>>,
): Middleware => ({
  transformPrompt: (prompt, context) =>
    check(prompt, context).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(prompt),
          onSome: (reason) =>
            Effect.fail(AgentError.make({ message: `Input guardrail blocked: ${reason}`, turn: context.turn })),
        }),
      ),
    ),
})

/** @experimental Redact matches in text-bearing prompt fields before the model sees them. */
export const redactInput = (options: RedactOptions): Middleware => ({
  transformPrompt: (prompt) => Effect.succeed(redactPromptText(prompt, options)),
})

/** @experimental Redact matches in streamed text deltas before Generalist folds or emits them. */
export const redactOutput = (options: RedactOptions): Middleware => ({
  transformPart: (part) => {
    if (part.type !== "text-delta") return Effect.succeed(Option.some(part))
    return Effect.succeed(
      Option.some(
        Response.makePart("text-delta", {
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
  keep: (part: Response.StreamPart<Record<string, Tool.Any>>, context: TurnContext) => boolean,
): Middleware => ({
  transformPart: (part, context) =>
    Effect.succeed(part.type === "tool-call" || keep(part, context) ? Option.some(part) : Option.none()),
})
