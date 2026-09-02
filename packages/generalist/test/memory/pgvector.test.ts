import { describe, it } from "@effect/vitest"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { layer as layerMemory, layerPgVector } from "generalist/memory"
import { Testing } from "generalist/testing"

const url = Effect.runSync(
  Config.option(Config.string("GENERALIST_DATABASE_URL").pipe(Config.orElse(() => Config.string("DATABASE_URL")))).pipe(
    Effect.map(Option.getOrUndefined),
  ),
)

if (url === undefined || url.length === 0) {
  describe.skip("pgvector Memory conformance", () => {
    it("skipped: set GENERALIST_DATABASE_URL or DATABASE_URL", () => undefined)
  })
} else {
  const client = PgClient.layer({ url: Redacted.make(url), maxConnections: 4 })
  const embedding = Layer.effect(
    EmbeddingModel.EmbeddingModel,
    EmbeddingModel.make({
      embedMany: ({ inputs }) =>
        Effect.succeed({
          results: inputs.map((input) => {
            const marker = /concurrent-memory-(\d+)/.exec(input)?.[1]
            if (marker !== undefined) return [Number(marker) + 2, 1]
            return input.includes("galax") || input.includes("astronom") ? [1, 0] : [0, 1]
          }),
          usage: { inputTokens: undefined },
        }),
    }),
  )
  const memory = layerMemory({ semantic: { limit: 16 } }).pipe(
    Layer.provide(
      Layer.merge(
        layerPgVector({ table: "generalist_memory_conformance", dimensions: 2 }).pipe(Layer.provide(client)),
        embedding,
      ),
    ),
  )
  Testing.memory({ layer: memory, persistent: true })
}
