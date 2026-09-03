/* oxlint-disable effecttsgo/strict-effect-provide -- This adapter test is the Layer composition root. */
import { describe, it } from "@effect/vitest"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { SqlClient } from "effect/unstable/sql"
import { layerPgVector, SemanticRecall } from "generalist/memory"
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
  const extensionInstalled = await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ installed: boolean }>`
        SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed
      `
      return rows[0]?.installed === true
    }).pipe(Effect.provide(client)),
  )
  if (!extensionInstalled) {
    describe.skip("pgvector Memory conformance", () => {
      it("skipped: install and enable the PostgreSQL vector extension with CREATE EXTENSION vector", () => undefined)
    })
  } else {
    // Version assertions need a table without entries left by earlier runs.
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`DROP TABLE IF EXISTS generalist_memory_conformance_history`
        yield* sql`DROP TABLE IF EXISTS generalist_memory_conformance`
      }).pipe(Effect.provide(client)),
    )
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
    const memory = SemanticRecall.layer({ limit: 16 }).pipe(
      Layer.provide(
        Layer.merge(
          layerPgVector({ table: "generalist_memory_conformance", dimensions: 2 }).pipe(Layer.provide(client)),
          embedding,
        ),
      ),
    )
    Testing.memory({ layer: memory, persistent: true, versioning: true })
  }
}
