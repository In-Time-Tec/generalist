import { Config, Layer } from "effect"
import { Memory } from "generalist"
import { SemanticRecall, VectorStore, WorkingMemory } from "generalist/memory"
import { layer as openAiEmbeddingLayer } from "generalist/providers/openai-embedding"
import { FetchHttpClient } from "effect/unstable/http"

const embeddingLayer = openAiEmbeddingLayer({
  model: "text-embedding-3-small",
  apiKey: Config.redacted("OPENAI_API_KEY"),
})

export const semanticLayer: Layer.Layer<Memory.Memory, Config.ConfigError> = SemanticRecall.layer({
  limit: 5,
  minScore: 0.4,
}).pipe(Layer.provide(Layer.mergeAll(VectorStore.layerMemory, embeddingLayer)), Layer.provide(FetchHttpClient.layer))

export const workingLayer: Layer.Layer<Memory.Memory> = WorkingMemory.layer({ maxMessages: 20 })
