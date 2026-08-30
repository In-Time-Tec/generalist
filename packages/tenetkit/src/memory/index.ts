import { Effect, Layer } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { Memory, merge } from "../core/context/memory.js"
import { make as makeSemanticRecall, type Options as SemanticRecallOptions } from "./semantic-recall.js"
import type { VectorStore } from "./vector-store.js"
import {
  make as makeWorkingMemory,
  type Options as WorkingMemoryOptions,
  type SummarizeOptions,
  type SummaryModel,
} from "./working-memory.js"

export * as SemanticRecall from "./semantic-recall.js"
export * as VectorStore from "./vector-store.js"
export * as WorkingMemory from "./working-memory.js"

/** @experimental */
export interface Options {
  readonly working?: WorkingMemoryOptions
  readonly semantic?: SemanticRecallOptions
}

type WithoutSummaryOptions = Options & {
  readonly working?: WorkingMemoryOptions & { readonly summarize?: undefined }
}

/** @experimental */
export function layer(
  options: Options & {
    readonly working: WorkingMemoryOptions & {
      readonly summarize: SummarizeOptions
    }
  },
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | SummaryModel>
/** @experimental */
export function layer(
  options?: WithoutSummaryOptions,
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel>
/** @experimental */
export function layer(
  options: Options,
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | SummaryModel>
export function layer(
  options: Options = {},
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | SummaryModel> {
  return Layer.effect(
    Memory,
    Effect.all([
      options.working === undefined ? makeWorkingMemory() : makeWorkingMemory(options.working),
      makeSemanticRecall(options.semantic),
    ]).pipe(Effect.map(([working, semantic]) => Memory.of(merge(working, semantic)))),
  )
}
