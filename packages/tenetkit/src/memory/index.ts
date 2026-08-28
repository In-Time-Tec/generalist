import { Context, Effect, Layer } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { Memory } from "../core/index.js"
import { make as SemanticRecall_make, layer as SemanticRecall_layer } from "./semantic-recall.js"
export const SemanticRecall = {
  make: SemanticRecall_make,
  makeSemanticRecall: SemanticRecall_make,
  layer: SemanticRecall_layer,
}
export namespace SemanticRecall {
  export type make = typeof import("./semantic-recall.js").make
  export type makeSemanticRecall = typeof import("./semantic-recall.js").makeSemanticRecall
  export type layer = typeof import("./semantic-recall.js").layer
  export type Options = import("./semantic-recall.js").Options
}
import {
  VectorStoreError as VectorStore_VectorStoreError,
  VectorStore as VectorStore_VectorStore,
  VectorStore as VectorStoreService,
  layerMemory as VectorStore_layerMemory,
  layerTest as VectorStore_layerTest,
} from "./vector-store.js"
export const VectorStore = {
  VectorStoreError: VectorStore_VectorStoreError,
  VectorStore: VectorStore_VectorStore,
  layerMemory: VectorStore_layerMemory,
  layerTest: VectorStore_layerTest,
}
export namespace VectorStore {
  export type VectorStoreError = import("./vector-store.js").VectorStoreError
  export type VectorStore = import("./vector-store.js").VectorStore
  export type layerMemory = typeof import("./vector-store.js").layerMemory
  export type layerTest = typeof import("./vector-store.js").layerTest
  export type DeleteInput = import("./vector-store.js").DeleteInput
  export type Document = import("./vector-store.js").Document
  export type Embedded = import("./vector-store.js").Embedded
  export type Interface = import("./vector-store.js").Interface
  export type Match = import("./vector-store.js").Match
  export type Query = import("./vector-store.js").Query
}
import {
  SummaryModel as WorkingMemory_SummaryModel,
  SummaryModel,
  layerSummaryModel as WorkingMemory_layerSummaryModel,
  make as WorkingMemory_make,
  layer as WorkingMemory_layer,
} from "./working-memory.js"
export const WorkingMemory = {
  SummaryModel: WorkingMemory_SummaryModel,
  layerSummaryModel: WorkingMemory_layerSummaryModel,
  make: WorkingMemory_make,
  makeWorkingMemory: WorkingMemory_make,
  layer: WorkingMemory_layer,
}
export namespace WorkingMemory {
  export type SummaryModel = import("./working-memory.js").SummaryModel
  export type layerSummaryModel = typeof import("./working-memory.js").layerSummaryModel
  export type make = typeof import("./working-memory.js").make
  export type makeWorkingMemory = typeof import("./working-memory.js").makeWorkingMemory
  export type layer = typeof import("./working-memory.js").layer
  export type Options = import("./working-memory.js").Options
  export type SummarizeOptions = import("./working-memory.js").SummarizeOptions
}
/** @experimental */
export interface CombinedOptions {
  readonly working?: import("./working-memory.js").Options
  readonly semantic?: import("./semantic-recall.js").Options
}

type WithoutSummaryCombinedOptions = CombinedOptions & {
  readonly working?: import("./working-memory.js").Options & { readonly summarize?: undefined }
}

/** @experimental */
export function layerCombined(
  options: CombinedOptions & {
    readonly working: import("./working-memory.js").Options & {
      readonly summarize: import("./working-memory.js").SummarizeOptions
    }
  },
): Layer.Layer<Memory.Memory, never, VectorStoreService | EmbeddingModel.EmbeddingModel | SummaryModel>
/** @experimental */
export function layerCombined(
  options?: WithoutSummaryCombinedOptions,
): Layer.Layer<Memory.Memory, never, VectorStoreService | EmbeddingModel.EmbeddingModel>
/** @experimental */
export function layerCombined(
  options: CombinedOptions,
): Layer.Layer<Memory.Memory, never, VectorStoreService | EmbeddingModel.EmbeddingModel | SummaryModel>
export function layerCombined(
  options: CombinedOptions = {},
): Layer.Layer<Memory.Memory, never, VectorStoreService | EmbeddingModel.EmbeddingModel | SummaryModel> {
  return Layer.effect(
    Memory.Memory,
    Effect.gen(function* () {
      const workingContext = yield* Layer.build(
        options.working === undefined ? WorkingMemory_layer() : WorkingMemory_layer(options.working),
      )
      const semanticContext = yield* Layer.build(SemanticRecall_layer(options.semantic))
      const working = Context.get(workingContext, Memory.Memory)
      const semantic = Context.get(semanticContext, Memory.Memory)
      return Memory.Memory.of(Memory.merge(working, semantic))
    }),
  )
}
