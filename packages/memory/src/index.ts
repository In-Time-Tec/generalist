import { Effect, Layer } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { makeSemanticRecall } from "./semantic-recall.js"
import { VectorStore } from "./vector-store.js"
import { makeWorkingMemory, SummaryModel } from "./working-memory.js"

export * as SemanticRecall from "./semantic-recall.js"
export * as VectorStore from "./vector-store.js"
export * as WorkingMemory from "./working-memory.js"

/** @experimental */
export interface CombinedOptions {
  readonly working?: import("./working-memory.js").Options
  readonly semantic?: import("./semantic-recall.js").Options
}

/** @experimental */
export interface CombinedComposedOptions {
  readonly working: import("./working-memory.js").ComposedOptions
  readonly semantic?: import("./semantic-recall.js").Options
}

/** @experimental */
export function combinedLayer(
  options: CombinedComposedOptions,
): Layer.Layer<Memory.Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | SummaryModel>
/** @experimental */
export function combinedLayer(
  options?: CombinedOptions,
): Layer.Layer<Memory.Memory, never, VectorStore | EmbeddingModel.EmbeddingModel>
export function combinedLayer(
  options: CombinedOptions | CombinedComposedOptions = {},
): Layer.Layer<Memory.Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | SummaryModel> {
  return Layer.effect(
    Memory.Memory,
    Effect.gen(function* () {
      const working =
        options.working === undefined ? yield* makeWorkingMemory() : yield* makeWorkingMemory(options.working)
      const semantic = yield* makeSemanticRecall(options.semantic)
      return Memory.Memory.of(Memory.merge(working, semantic))
    }),
  )
}
