import { Context, Effect, Layer, Option, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

const provenanceOption = "generalist/memory"
const recallLineage = new WeakMap<Prompt.Message, Prompt.Message>()
export type Metadata = Readonly<Record<string, typeof Schema.Unknown.Type>>

const RecallProvenance = Schema.Struct({ origin: Schema.Literal("memoryRecall") })
export interface Key {
  readonly agent: string
  readonly subject: string
}
export type ItemPart = Prompt.UserMessagePart
export interface Item {
  readonly id: string
  readonly content: ReadonlyArray<ItemPart>
  readonly metadata?: Metadata
}
export const itemFromPromptPart = Option.liftPredicate(
  (part: Prompt.Part): part is ItemPart => part.type === "text" || part.type === "file",
)
export const isMessageFromRecall = (message: Prompt.Message): boolean => {
  const provenance = message.options[provenanceOption]
  return Schema.is(RecallProvenance)(provenance)
}
export const messageFromRecall = (content: ReadonlyArray<ItemPart>): Prompt.UserMessage => {
  const message = Prompt.makeMessage("user", {
    content,
    options: { [provenanceOption]: { origin: "memoryRecall" } },
  })
  recallLineage.set(message, message)
  return message
}
export const replaceRecalledMessage: {
  (content: ReadonlyArray<Prompt.UserMessagePart>): (message: Prompt.UserMessage) => Prompt.UserMessage
  (message: Prompt.UserMessage, content: ReadonlyArray<Prompt.UserMessagePart>): Prompt.UserMessage
} = dual(2, (message: Prompt.UserMessage, content: ReadonlyArray<Prompt.UserMessagePart>): Prompt.UserMessage => {
  const options = isMessageFromRecall(message)
    ? { ...message.options, [provenanceOption]: { origin: "memoryRecall" } }
    : { ...message.options }
  const replacement = Prompt.makeMessage("user", { content, options })
  if (isMessageFromRecall(message)) recallLineage.set(replacement, recallLineage.get(message) ?? message)
  return replacement
})
export const recalledMessageIdentity = (message: Prompt.Message): Prompt.Message =>
  recallLineage.get(message) ?? message
export const projectTranscript = (transcript: Prompt.Prompt): Prompt.Prompt => {
  const content = transcript.content.filter((message) => !isMessageFromRecall(message))
  return content.length === transcript.content.length ? transcript : Prompt.fromMessages(content)
}
export interface RecallInput {
  readonly key: Key
  readonly turn: number
  readonly prompt: Prompt.Prompt
}
export interface RememberInput {
  readonly key: Key
  readonly turn: number
  readonly transcript: Prompt.Prompt
  readonly terminal: boolean
}
export interface ForgetInput {
  readonly key: Key
  readonly id?: string | undefined
}
export class MemoryError extends ActionableTaggedError<MemoryError>()("generalist/core/MemoryError", {
  reason: Schema.optionalKey(Schema.Literals(["embedding", "vector-store", "language-model"])),
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
  hint: errorHint("Inspect reason and cause, restore the failing memory dependency, then retry the operation."),
}) {}
export interface Service {
  readonly recall: (input: RecallInput) => Effect.Effect<ReadonlyArray<Item>, MemoryError>
  readonly remember: (input: RememberInput) => Effect.Effect<void, MemoryError>
  readonly forget: (input: ForgetInput) => Effect.Effect<void, MemoryError>
}
export class Memory extends Context.Service<Memory, Service>()("generalist/core/context/memory") {}

const noop: Service = {
  recall: () => Effect.succeed([]),
  remember: () => Effect.void,
  forget: () => Effect.void,
}
export const merge: {
  (second: Service): (first: Service) => Service
  (first: Service, second: Service): Service
} = dual(
  2,
  (first: Service, second: Service): Service => ({
    recall: (input) =>
      Effect.all([first.recall(input), second.recall(input)]).pipe(
        Effect.map(([firstItems, secondItems]) => [...firstItems, ...secondItems]),
      ),
    remember: (input) => Effect.all([first.remember(input), second.remember(input)], { discard: true }),
    forget: (input) => Effect.all([first.forget(input), second.forget(input)], { discard: true }),
  }),
)

/** Memory implementation that recalls and records nothing. */
export const layerNoop: Layer.Layer<Memory> = Layer.succeed(Memory, Memory.of(noop))
export const layerTest = (implementation: Service): Layer.Layer<Memory> =>
  Layer.succeed(Memory, Memory.of(implementation))
