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
export * as Supermemory from "./supermemory.js"
export * as VectorStore from "./vector-store.js"
export * as WorkingMemory from "./working-memory.js"
export interface Options {
  readonly working?: WorkingMemoryOptions
  readonly semantic?: SemanticRecallOptions
}

/** Hosted semantic Memory backed by Supermemory. */
export { layer as layerSupermemory, SupermemoryError, type Options as SupermemoryOptions } from "./supermemory.js"
/** Persistent PostgreSQL vector store. Requires the `vector` extension. */
export { layer as layerPgVector, type Options as PgVectorOptions } from "./pgvector.js"

/** @internal The ambient LanguageModel is required only when working memory summarizes without an explicit model layer. */
export type WorkingRequirement<O> = O extends { readonly working?: infer W }
  ? [Extract<W, WorkingMemoryOptions>] extends [never]
    ? never
    : SummaryRequirement<Extract<W, WorkingMemoryOptions>>
  : never
export function layer(): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel>
export function layer<O extends Options>(
  options: O,
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | WorkingRequirement<O>>
export function layer(
  options: Options = {},
): Layer.Layer<Memory, never, VectorStore | EmbeddingModel.EmbeddingModel | LanguageModel.LanguageModel> {
  return Layer.effect(
    Memory,
    Effect.all([makeWorkingMemory(options.working ?? {}), makeSemanticRecall(options.semantic)]).pipe(
      Effect.map(([working, semantic]) => Memory.of(merge(working, semantic))),
    ),
  )
}
