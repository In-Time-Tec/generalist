import { Context, Effect, Layer } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { Memory, merge } from "../core/context/memory.js"
import { type Options as SemanticRecallOptions, layer as semanticRecallLayer } from "./semantic-recall.js"
import type { VectorStore } from "./vector-store.js"
import {
  type Options as WorkingMemoryOptions,
  type SummarizeOptions,
  type SummaryModel,
  layer as workingMemoryLayer,
} from "./working-memory.js"

export * as SemanticRecall from "./semantic-recall.js"
export * as VectorStore from "./vector-store.js"
export * as WorkingMemory from "./working-memory.js"

/** @experimental */
export interface CombinedOptions {
  readonly working?: WorkingMemoryOptions
  readonly semantic?: SemanticRecallOptions
}

type WithoutSummaryCombinedOptions = CombinedOptions & {
  readonly working?: WorkingMemoryOptions & { readonly summarize?: undefined }
}

/** @experimental */
export function layerCombined(
  options: CombinedOptions & {
    readonly working: WorkingMemoryOptions & {
      readonly summarize: SummarizeOptions
    }
  },
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | SummaryModel>
/** @experimental */
export function layerCombined(
  options?: WithoutSummaryCombinedOptions,
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel>
/** @experimental */
export function layerCombined(
  options: CombinedOptions,
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | SummaryModel>
export function layerCombined(
  options: CombinedOptions = {},
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | SummaryModel> {
  return Layer.effect(
    Memory,
    Effect.gen(function* () {
      const workingContext = yield* Layer.build(
        options.working === undefined ? workingMemoryLayer() : workingMemoryLayer(options.working),
      )
      const semanticContext = yield* Layer.build(semanticRecallLayer(options.semantic))
      const working = Context.get(workingContext, Memory)
      const semantic = Context.get(semanticContext, Memory)
      return Memory.of(merge(working, semantic))
    }),
  )
}
