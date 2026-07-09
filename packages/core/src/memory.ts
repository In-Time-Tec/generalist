import { Context, Effect, Layer, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
/** @experimental */
export type Metadata = Readonly<Record<string, unknown>>

/** @experimental */
export interface Key {
  readonly agent: string
  readonly subject: string
}

/** @experimental */
export interface Item {
  readonly id: string
  readonly parts: ReadonlyArray<Prompt.Part>
  readonly metadata?: Metadata
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
export class MemoryError extends Schema.TaggedErrorClass<MemoryError>()("@batonfx/core/MemoryError", {
  message: Schema.String,
}) {}

/** @experimental */
export interface Interface {
  readonly recall: (input: RecallInput) => Effect.Effect<ReadonlyArray<Item>, MemoryError>
  readonly remember: (input: RememberInput) => Effect.Effect<void, MemoryError>
}

/** @experimental */
export class Memory extends Context.Service<Memory, Interface>()("@batonfx/core/Memory") {}

const noop: Interface = {
  recall: () => Effect.succeed([]),
  remember: () => Effect.void,
}

/** @experimental */
export const merge = (first: Interface, second: Interface): Interface => ({
  recall: (input) =>
    Effect.all([first.recall(input), second.recall(input)]).pipe(
      Effect.map(([firstItems, secondItems]) => [...firstItems, ...secondItems]),
    ),
  remember: (input) => Effect.all([first.remember(input), second.remember(input)], { discard: true }),
})

/** @experimental */
export const noopLayer: Layer.Layer<Memory> = Layer.succeed(Memory, Memory.of(noop))

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<Memory> =>
  Layer.succeed(Memory, Memory.of(implementation))
