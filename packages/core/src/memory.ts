import { Context, Effect, Layer, Option, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"
/** @experimental */
export type Metadata = Readonly<Record<string, unknown>>

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
export class MemoryError extends Schema.TaggedErrorClass<MemoryError>()("@batonfx/core/MemoryError", {
  message: Schema.String,
}) {}

/** @experimental */
export interface Interface {
  readonly recall: (input: RecallInput) => Effect.Effect<ReadonlyArray<Item>, MemoryError>
  readonly remember: (input: RememberInput) => Effect.Effect<void, MemoryError>
  readonly forget: (input: ForgetInput) => Effect.Effect<void, MemoryError>
}

/** @experimental */
export class Memory extends Context.Service<Memory, Interface>()("@batonfx/core/memory") {}

const noop: Interface = {
  recall: () => Effect.succeed([]),
  remember: () => Effect.void,
  forget: () => Effect.void,
}

/** @experimental */
export const merge: {
  (second: Interface): (first: Interface) => Interface
  (first: Interface, second: Interface): Interface
} = dual(
  2,
  (first: Interface, second: Interface): Interface => ({
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

/**
 * @experimental
 * @deprecated Use {@link layerNoop}. This alias will not be removed before 1.0.0 and only in a separately planned major release.
 */
export const noopLayer: typeof layerNoop = layerNoop

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<Memory> =>
  Layer.succeed(Memory, Memory.of(implementation))
