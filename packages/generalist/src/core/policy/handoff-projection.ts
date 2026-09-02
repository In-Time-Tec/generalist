import { Effect, Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

export const Input = Schema.Struct({
  prompt: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  context: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
})

export type Input = typeof Input.Type

export const Output = Schema.Struct({
  summary: Schema.optionalKey(Schema.String),
})

export type Output = typeof Output.Type

export class ProjectionInvalid extends ActionableTaggedError<ProjectionInvalid>()(
  "generalist/core/HandoffProjectionInvalid",
  {
    message: Schema.String,
    hint: errorHint("Return a prompt history with every tool call paired to its result."),
  },
) {}

export type ContextProjection = (
  history: Prompt.Prompt,
  input: Input,
) => Effect.Effect<{ readonly history: Prompt.Prompt; readonly prompt: Prompt.RawInput }, ProjectionInvalid>

const hasUnresolvedToolCall = (
  messages: ReadonlyArray<Prompt.Message>,
  excluding: ReadonlySet<string> = new Set(),
): boolean => {
  const pending = new Set<string>()
  for (const message of messages) {
    if (Schema.is(Schema.String)(message.content)) continue
    for (const part of message.content) {
      if (part.type === "tool-call" && part.providerExecuted !== true && !excluding.has(part.id)) pending.add(part.id)
      if (part.type === "tool-result") pending.delete(part.id)
    }
  }
  return pending.size > 0
}

export const defaultContextProjection: {
  (
    input: Input,
  ): (
    history: Prompt.Prompt,
  ) => Effect.Effect<{ readonly history: Prompt.Prompt; readonly prompt: Prompt.RawInput }, ProjectionInvalid>
  (
    history: Prompt.Prompt,
    input: Input,
  ): Effect.Effect<{ readonly history: Prompt.Prompt; readonly prompt: Prompt.RawInput }, ProjectionInvalid>
} = Function.dual(
  2,
  (
    history: Prompt.Prompt,
    input: Input,
  ): Effect.Effect<{ readonly history: Prompt.Prompt; readonly prompt: Prompt.RawInput }, ProjectionInvalid> => {
    const resolvingToolCallIds = Schema.is(Schema.Array(Schema.String))(input.context?.resolvingToolCallIds)
      ? input.context.resolvingToolCallIds
      : []
    const excluding = new Set(resolvingToolCallIds)
    if (hasUnresolvedToolCall(history.content, excluding)) {
      return Effect.fail(
        ProjectionInvalid.make({
          message: "Handoff context projection cannot include unresolved tool calls",
        }),
      )
    }
    const prompt = input.prompt === undefined ? Prompt.empty : Prompt.make(input.prompt)
    return Effect.succeed({ history, prompt })
  },
)

export const filterContextProjection =
  (predicate: (message: Prompt.Message) => boolean): ContextProjection =>
  (history, input) =>
    defaultContextProjection(Prompt.fromMessages(history.content.filter(predicate)), input)
