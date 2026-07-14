import { Config, Layer } from "effect"
import { Memory } from "@batonfx/core"
import { SemanticRecall, VectorStore, WorkingMemory } from "@batonfx/memory"
import { Embedding } from "@batonfx/providers"

const embeddingLayer = Embedding.withOpenAiEmbeddingFetch({
  model: "text-embedding-3-small",
  apiKey: Config.redacted("OPENAI_API_KEY"),
})

export const semanticLayer: Layer.Layer<Memory.Memory, Config.ConfigError> = SemanticRecall.layer({
  limit: 5,
  minScore: 0.4,
}).pipe(Layer.provide(Layer.mergeAll(VectorStore.memoryLayer, embeddingLayer)))

export const workingLayer: Layer.Layer<Memory.Memory> = WorkingMemory.layer({ maxMessages: 20 })
