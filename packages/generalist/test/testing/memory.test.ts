import { Effect, Layer } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { SemanticRecall, VectorStore } from "generalist/memory"
import { Testing } from "generalist/testing"

const embedding = Layer.effect(
  EmbeddingModel.EmbeddingModel,
  EmbeddingModel.make({
    embedMany: ({ inputs }) =>
      Effect.succeed({
        results: inputs.map((input) => {
          const vector = Array<number>(32).fill(0)
          for (const word of input.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
            const normalized = ["astronomy", "observatory", "galaxies", "facility"].includes(word) ? "space" : word
            let hash = 0
            for (const character of normalized) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
            vector[hash % vector.length] = (vector[hash % vector.length] ?? 0) + 1
          }
          return vector
        }),
        usage: { inputTokens: undefined },
      }),
  }),
)

const memory = SemanticRecall.layer({ limit: 16 }).pipe(Layer.provide(Layer.merge(VectorStore.layerMemory, embedding)))

Testing.memory({ layer: memory, versioning: true })
