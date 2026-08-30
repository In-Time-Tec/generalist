import { Context, Effect, Layer, Option, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"

const provenanceOption = "tenetkit/memory"
const recallLineage = new WeakMap<Prompt.Message, Prompt.Message>()

/** @experimental */
export type Metadata = Readonly<Record<string, typeof Schema.Unknown.Type>>

const RecallProvenance = Schema.Struct({ origin: Schema.Literal("memoryRecall") })

/** @experimental */
export interface Key {
  readonly agent: string
  readonly subject: string
}

/** @experimental */
export type ItemPart = Prompt.UserMessagePart

/** @experimental */
export interface Item {
  readonly id: string
  readonly content: ReadonlyArray<ItemPart>
  readonly metadata?: Metadata
}

/** @experimental */
export const itemFromPromptPart = Option.liftPredicate(
  (part: Prompt.Part): part is ItemPart => part.type === "text" || part.type === "file",
)

/** @experimental */
export const isMessageFromRecall = (message: Prompt.Message): boolean => {
  const provenance = message.options[provenanceOption]
  return Schema.is(RecallProvenance)(provenance)
}

/** @experimental */
export const messageFromRecall = (content: ReadonlyArray<ItemPart>): Prompt.UserMessage => {
  const message = Prompt.makeMessage("user", {
    content,
    options: { [provenanceOption]: { origin: "memoryRecall" } },
  })
  recallLineage.set(message, message)
  return message
}

/** @experimental */
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

/** @experimental */
export const recalledMessageIdentity = (message: Prompt.Message): Prompt.Message =>
  recallLineage.get(message) ?? message

/** @experimental */
export const projectTranscript = (transcript: Prompt.Prompt): Prompt.Prompt => {
  const content = transcript.content.filter((message) => !isMessageFromRecall(message))
  return content.length === transcript.content.length ? transcript : Prompt.fromMessages(content)
}

/** @experimental */
export interface RecallInput {
  readonly key: Key
  readonly turn: number
  readonly prompt: Prompt.Prompt
}

/** @experimental */
export interface RememberInput {
  readonly key: Key
  readonly turn: number
  readonly transcript: Prompt.Prompt
  readonly terminal: boolean
}

/** @experimental */
export interface ForgetInput {
  readonly key: Key
  readonly id?: string | undefined
}

/** @experimental */
export class MemoryError extends Schema.TaggedError<MemoryError>()("tenetkit/core/MemoryError", {
  message: Schema.String,
}) {}

/** @experimental */
export interface Service {
  readonly recall: (input: RecallInput) => Effect.Effect<ReadonlyArray<Item>, MemoryError>
  readonly remember: (input: RememberInput) => Effect.Effect<void, MemoryError>
  readonly forget: (input: ForgetInput) => Effect.Effect<void, MemoryError>
}

/** @experimental */
export class Memory extends Context.Service<Memory, Service>()("tenetkit/core/context/memory") {}

const noop: Service = {
  recall: () => Effect.succeed([]),
  remember: () => Effect.void,
  forget: () => Effect.void,
}

/** @experimental */
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

/** @experimental Memory implementation that recalls and records nothing. */
export const layerNoop: Layer.Layer<Memory> = Layer.succeed(Memory, Memory.of(noop))

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<Memory> =>
  Layer.succeed(Memory, Memory.of(implementation))
