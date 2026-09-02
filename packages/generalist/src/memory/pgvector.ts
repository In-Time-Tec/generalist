import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { type Match, type Service, VectorStore, VectorStoreError } from "./vector-store.js"

/** @experimental PostgreSQL pgvector storage configuration. */
export interface Options {
  readonly table: string
  readonly dimensions: number
}

const Row = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  metadata: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  embedding: Schema.String,
  score: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
})

const vectorText = (embedding: ReadonlyArray<number>): string => JSON.stringify(embedding)
const error = (operation: string, cause: unknown): VectorStoreError =>
  VectorStoreError.make({ message: `pgvector ${operation} failed: ${String(cause)}` })
const validateVector = (label: string, vector: ReadonlyArray<number>): Effect.Effect<void, VectorStoreError> =>
  vector.every(Number.isFinite)
    ? Effect.void
    : Effect.fail(VectorStoreError.make({ message: `${label} contains a non-finite value` }))

/** @experimental Persistent PostgreSQL vector store. Requires the `vector` extension. */
export const layer = (options: Options): Layer.Layer<VectorStore, VectorStoreError, SqlClient.SqlClient> =>
  Layer.effect(
    VectorStore,
    Effect.gen(function* () {
      if (!Number.isSafeInteger(options.dimensions) || options.dimensions <= 0) {
        return yield* VectorStoreError.make({ message: "pgvector dimensions must be a positive safe integer" })
      }
      const sql = yield* SqlClient.SqlClient
      const table = sql(options.table)
      yield* sql`
        CREATE TABLE IF NOT EXISTS ${table} (
          agent TEXT NOT NULL,
          subject TEXT NOT NULL,
          id TEXT NOT NULL,
          text TEXT NOT NULL,
          metadata JSONB,
          embedding vector(${sql.literal(String(options.dimensions))}) NOT NULL,
          PRIMARY KEY (agent, subject, id)
        )
      `.pipe(Effect.mapError((cause) => error("initialization", cause)))

      const decodeRows = Schema.decodeUnknownEffect(Schema.Array(Row))
      const decodeEmbedding = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Schema.Finite)))
      const service: Service = {
        upsert: (documents) =>
          Effect.gen(function* () {
            for (const document of documents) {
              yield* validateVector(`document ${document.id} embedding`, document.embedding)
              if (document.embedding.length !== options.dimensions) {
                return yield* VectorStoreError.make({
                  message: `document ${document.id} embedding dimension ${document.embedding.length} does not match configured dimension ${options.dimensions}`,
                })
              }
              yield* sql`
                INSERT INTO ${table} (agent, subject, id, text, metadata, embedding)
                VALUES (${document.key.agent}, ${document.key.subject}, ${document.id}, ${document.text},
                  ${document.metadata ?? null}, ${vectorText(document.embedding)}::vector)
                ON CONFLICT (agent, subject, id) DO UPDATE SET
                  text = EXCLUDED.text,
                  metadata = EXCLUDED.metadata,
                  embedding = EXCLUDED.embedding
              `.pipe(Effect.mapError((cause) => error("upsert", cause)))
            }
          }),
        query: (input) =>
          Effect.gen(function* () {
            if (input.limit <= 0) return []
            yield* validateVector("query embedding", input.embedding)
            if (input.embedding.length !== options.dimensions) {
              return yield* VectorStoreError.make({
                message: `query embedding dimension ${input.embedding.length} does not match configured dimension ${options.dimensions}`,
              })
            }
            const vector = vectorText(input.embedding)
            const rows = yield* sql`
              SELECT id, agent, subject, text, metadata, embedding::text AS embedding,
                1 - (embedding <=> ${vector}::vector) AS score
              FROM ${table}
              WHERE agent = ${input.key.agent} AND subject = ${input.key.subject}
                ${input.minScore === undefined ? sql.literal("") : sql`AND 1 - (embedding <=> ${vector}::vector) >= ${input.minScore}`}
              ORDER BY embedding <=> ${vector}::vector, id
              LIMIT ${Math.floor(input.limit)}
            `.pipe(Effect.mapError((cause) => error("query", cause)))
            const decoded = yield* decodeRows(rows).pipe(Effect.mapError((cause) => error("row decoding", cause)))
            return yield* Effect.forEach(decoded, (row) =>
              decodeEmbedding(row.embedding).pipe(
                Effect.mapError((cause) => error("embedding decoding", cause)),
                Effect.map(
                  (embedding): Match => ({
                    document: {
                      id: row.id,
                      key: { agent: row.agent, subject: row.subject },
                      text: row.text,
                      embedding,
                      ...(row.metadata === null ? undefined : { metadata: row.metadata }),
                    },
                    score: Number(row.score ?? 0),
                  }),
                ),
              ),
            )
          }),
        delete: (input) =>
          sql`
            DELETE FROM ${table}
            WHERE agent = ${input.key.agent} AND subject = ${input.key.subject}
              ${input.id === undefined ? sql.literal("") : sql`AND id = ${input.id}`}
          `.pipe(
            Effect.mapError((cause) => error("delete", cause)),
            Effect.asVoid,
          ),
      }
      return VectorStore.of(service)
    }),
  )
