import { Effect, Layer } from "effect"
import * as Ai from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import * as SemanticRecall from "./semantic-recall"
import * as VectorStore from "./vector-store"
import * as WorkingMemory from "./working-memory"

export * as SemanticRecall from "./semantic-recall"
export * as VectorStore from "./vector-store"
export * as WorkingMemory from "./working-memory"

/** @experimental */
export interface CombinedOptions {
  readonly working?: WorkingMemory.Options
  readonly semantic?: SemanticRecall.Options
}

/** @experimental */
export const combinedLayer = (
  options: CombinedOptions = {},
): Layer.Layer<Memory.Memory, never, VectorStore.VectorStore | Ai.EmbeddingModel.EmbeddingModel> =>
  Layer.effect(
    Memory.Memory,
    Effect.gen(function* () {
      const working = yield* WorkingMemory.make(options.working)
      const semantic = yield* SemanticRecall.make(options.semantic)
      return Memory.Memory.of(Memory.merge(working, semantic))
    }),
  )
