import { Effect, Layer } from "effect"
import { EmbeddingModel, LanguageModel } from "effect/unstable/ai"
import { Memory, merge } from "../core/context/memory.js"
import { make as makeSemanticRecall, type Options as SemanticRecallOptions } from "./semantic-recall.js"
import type { VectorStore } from "./vector-store.js"
import {
  make as makeWorkingMemory,
  type Options as WorkingMemoryOptions,
  type SummaryRequirement,
} from "./working-memory.js"

export * as SemanticRecall from "./semantic-recall.js"
export * as VectorStore from "./vector-store.js"
export * as WorkingMemory from "./working-memory.js"

/** @experimental */
export interface Options {
  readonly working?: WorkingMemoryOptions
  readonly semantic?: SemanticRecallOptions
}

/** @internal The ambient LanguageModel is required only when working memory summarizes without an explicit model layer. */
export type WorkingRequirement<O> = O extends { readonly working?: infer W }
  ? [Extract<W, WorkingMemoryOptions>] extends [never]
    ? never
    : SummaryRequirement<Extract<W, WorkingMemoryOptions>>
  : never

/** @experimental */
export function layer(): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel>
/** @experimental */
export function layer<O extends Options>(
  options: O,
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | WorkingRequirement<O>>
export function layer(
  options: Options = {},
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | LanguageModel.LanguageModel> {
  return Layer.effect(
    Memory,
    Effect.all([
      makeWorkingMemory((options.working ?? {}) as WorkingMemoryOptions),
      makeSemanticRecall(options.semantic),
    ]).pipe(Effect.map(([working, semantic]) => Memory.of(merge(working, semantic)))),
  )
}
