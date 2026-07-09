import { Effect, Layer } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { makeSemanticRecall } from "./semantic-recall"
import { VectorStore } from "./vector-store"
import { makeWorkingMemory } from "./working-memory"

export * as SemanticRecall from "./semantic-recall"
export * as VectorStore from "./vector-store"
export * as WorkingMemory from "./working-memory"

/** @experimental */
export interface CombinedOptions {
  readonly working?: import("./working-memory").Options
  readonly semantic?: import("./semantic-recall").Options
}

/** @experimental */
export const combinedLayer = (
  options: CombinedOptions = {},
): Layer.Layer<Memory.Memory, never, VectorStore | EmbeddingModel.EmbeddingModel> =>
  Layer.effect(
    Memory.Memory,
    Effect.gen(function* () {
      const working = yield* makeWorkingMemory(options.working)
      const semantic = yield* makeSemanticRecall(options.semantic)
      return Memory.Memory.of(Memory.merge(working, semantic))
    }),
  )
