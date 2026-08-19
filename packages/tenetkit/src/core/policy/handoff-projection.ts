import { Effect, Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

export const HandoffInput = Schema.Struct({
  prompt: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  context: Schema.optionalKey(Schema.Unknown),
})

export type HandoffInput = typeof HandoffInput.Type

export const HandoffOutput = Schema.Struct({
  summary: Schema.optionalKey(Schema.String),
})

export type HandoffOutput = typeof HandoffOutput.Type

export class HandoffProjectionInvalid extends Schema.TaggedError<HandoffProjectionInvalid>()(
  "tenetkit/core/HandoffProjectionInvalid",
  { message: Schema.String },
) {}

export type ContextProjection = (
  history: Prompt.Prompt,
  input: HandoffInput,
) => Effect.Effect<{ readonly history: Prompt.Prompt; readonly prompt: Prompt.RawInput }, HandoffProjectionInvalid>

const hasUnresolvedToolCall = (
  messages: ReadonlyArray<Prompt.Message>,
  excluding: ReadonlySet<string> = new Set(),
): boolean => {
  const pending = new Set<string>()
  for (const message of messages) {
    if (typeof message.content === "string") continue
    for (const part of message.content) {
      if (part.type === "tool-call" && part.providerExecuted !== true && !excluding.has(part.id)) pending.add(part.id)
      if (part.type === "tool-result") pending.delete(part.id)
    }
  }
  return pending.size > 0
}

export const defaultContextProjection: {
  (
    input: HandoffInput,
  ): (
    history: Prompt.Prompt,
  ) => Effect.Effect<{ readonly history: Prompt.Prompt; readonly prompt: Prompt.RawInput }, HandoffProjectionInvalid>
  (
    history: Prompt.Prompt,
    input: HandoffInput,
  ): Effect.Effect<{ readonly history: Prompt.Prompt; readonly prompt: Prompt.RawInput }, HandoffProjectionInvalid>
} = Function.dual(
  2,
  (
    history: Prompt.Prompt,
    input: HandoffInput,
  ): Effect.Effect<{ readonly history: Prompt.Prompt; readonly prompt: Prompt.RawInput }, HandoffProjectionInvalid> => {
    const excluding =
      input.context !== undefined &&
      typeof input.context === "object" &&
      input.context !== null &&
      "resolvingToolCallIds" in input.context &&
      Array.isArray((input.context as { resolvingToolCallIds: unknown }).resolvingToolCallIds)
        ? new Set((input.context as { resolvingToolCallIds: ReadonlyArray<string> }).resolvingToolCallIds.map(String))
        : new Set<string>()
    if (hasUnresolvedToolCall(history.content, excluding)) {
      return Effect.fail(
        HandoffProjectionInvalid.make({
          message: "Handoff context projection cannot include unresolved tool calls",
        }),
      )
    }
    const prompt =
      input.prompt === undefined
        ? Prompt.empty
        : typeof input.prompt === "string"
          ? Prompt.make(input.prompt)
          : Prompt.make(input.prompt)
    return Effect.succeed({ history, prompt })
  },
)

export const filterContextProjection =
  (predicate: (message: Prompt.Message) => boolean): ContextProjection =>
  (history, input) =>
    defaultContextProjection(Prompt.fromMessages(history.content.filter(predicate)), input)
