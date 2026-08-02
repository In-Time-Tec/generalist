import { Effect, Layer } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { makeSemanticRecall } from "./memory/semantic-recall.js"
import { VectorStore as VectorStoreService } from "./memory/vector-store.js"
import { makeWorkingMemory, SummaryModel } from "./memory/working-memory.js"

import {
  make as SemanticRecall_make,
  makeSemanticRecall as SemanticRecall_makeSemanticRecall,
  layer as SemanticRecall_layer,
} from "./memory/semantic-recall.js"
export const SemanticRecall = {
  make: SemanticRecall_make,
  makeSemanticRecall: SemanticRecall_makeSemanticRecall,
  layer: SemanticRecall_layer,
} as typeof import("./memory/semantic-recall.js")
export namespace SemanticRecall {
  export type make = typeof import("./memory/semantic-recall.js").make
  export type makeSemanticRecall = typeof import("./memory/semantic-recall.js").makeSemanticRecall
  export type layer = typeof import("./memory/semantic-recall.js").layer
  export type Options = import("./memory/semantic-recall.js").Options
}
import {
  VectorStoreError as VectorStore_VectorStoreError,
  VectorStore as VectorStore_VectorStore,
  layerMemory as VectorStore_layerMemory,
  layerTest as VectorStore_layerTest,
} from "./memory/vector-store.js"
export const VectorStore = {
  VectorStoreError: VectorStore_VectorStoreError,
  VectorStore: VectorStore_VectorStore,
  layerMemory: VectorStore_layerMemory,
  layerTest: VectorStore_layerTest,
} as typeof import("./memory/vector-store.js")
export namespace VectorStore {
  export type VectorStoreError = import("./memory/vector-store.js").VectorStoreError
  export type VectorStore = import("./memory/vector-store.js").VectorStore
  export type layerMemory = typeof import("./memory/vector-store.js").layerMemory
  export type layerTest = typeof import("./memory/vector-store.js").layerTest
  export type DeleteInput = import("./memory/vector-store.js").DeleteInput
  export type Document = import("./memory/vector-store.js").Document
  export type Embedded = import("./memory/vector-store.js").Embedded
  export type Interface = import("./memory/vector-store.js").Interface
  export type Match = import("./memory/vector-store.js").Match
  export type Query = import("./memory/vector-store.js").Query
}
import {
  SummaryModel as WorkingMemory_SummaryModel,
  layerSummaryModel as WorkingMemory_layerSummaryModel,
  make as WorkingMemory_make,
  makeWorkingMemory as WorkingMemory_makeWorkingMemory,
  layer as WorkingMemory_layer,
} from "./memory/working-memory.js"
export const WorkingMemory = {
  SummaryModel: WorkingMemory_SummaryModel,
  layerSummaryModel: WorkingMemory_layerSummaryModel,
  make: WorkingMemory_make,
  makeWorkingMemory: WorkingMemory_makeWorkingMemory,
  layer: WorkingMemory_layer,
} as typeof import("./memory/working-memory.js")
export namespace WorkingMemory {
  export type SummaryModel = import("./memory/working-memory.js").SummaryModel
  export type layerSummaryModel = typeof import("./memory/working-memory.js").layerSummaryModel
  export type make = typeof import("./memory/working-memory.js").make
  export type makeWorkingMemory = typeof import("./memory/working-memory.js").makeWorkingMemory
  export type layer = typeof import("./memory/working-memory.js").layer
  export type Options = import("./memory/working-memory.js").Options
  export type SummarizeOptions = import("./memory/working-memory.js").SummarizeOptions
}
/** @experimental */
export interface CombinedOptions {
  readonly working?: import("./memory/working-memory.js").Options
  readonly semantic?: import("./memory/semantic-recall.js").Options
}

type WithoutSummaryCombinedOptions = CombinedOptions & {
  readonly working?: import("./memory/working-memory.js").Options & { readonly summarize?: undefined }
}

/** @experimental */
export function layerCombined(
  options: CombinedOptions & {
    readonly working: import("./memory/working-memory.js").Options & {
      readonly summarize: import("./memory/working-memory.js").SummarizeOptions
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
      const working =
        options.working === undefined ? yield* makeWorkingMemory() : yield* makeWorkingMemory(options.working)
      const semantic = yield* makeSemanticRecall(options.semantic)
      return Memory.Memory.of(Memory.merge(working, semantic))
    }),
  )
}
