import { Context, Effect, HashMap, Layer, Ref, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { Key, Metadata } from "../core/context/memory.js"

/** @experimental */
export interface Document {
  readonly id: string
  readonly key: Key
  readonly text: string
  readonly metadata?: Metadata
}

/** @experimental */
export interface Embedded extends Document {
  readonly embedding: ReadonlyArray<number>
}

/** @experimental */
export interface Match {
  readonly document: Embedded
  readonly score: number
}

/** @experimental */
export interface Query {
  readonly key: Key
  readonly embedding: ReadonlyArray<number>
  readonly limit: number
  readonly minScore?: number
}

/** @experimental */
export interface DeleteInput {
  readonly key: Key
  readonly id?: string | undefined
}

/** @experimental PostgreSQL pgvector storage configuration. */
export interface PgVectorOptions {
  readonly table: string
  readonly dimensions: number
}

/** @experimental */
export class VectorStoreError extends Schema.TaggedError<VectorStoreError>()("generalist/memory/VectorStoreError", {
  message: Schema.String,
}) {}

/** @experimental */
export interface Service {
  readonly upsert: (documents: ReadonlyArray<Embedded>) => Effect.Effect<void, VectorStoreError>
  readonly query: (query: Query) => Effect.Effect<ReadonlyArray<Match>, VectorStoreError>
  readonly delete: (input: DeleteInput) => Effect.Effect<void, VectorStoreError>
}

/** @experimental */
export class VectorStore extends Context.Service<VectorStore, Service>()(
  "generalist/memory/vector-store/VectorStore",
) {}

const storageKey = (key: Key, id: string): string => JSON.stringify([key.agent, key.subject, id])

const sameKey = (left: Key, right: Key): boolean => left.agent === right.agent && left.subject === right.subject

const validateVector = (label: string, vector: ReadonlyArray<number>): Effect.Effect<void, VectorStoreError> => {
  const invalid = vector.find((value) => !Number.isFinite(value))
  return invalid === undefined
    ? Effect.void
    : Effect.fail(VectorStoreError.make({ message: `${label} contains a non-finite value` }))
}

const cosine = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): number => {
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    dot += leftValue * rightValue
    leftMagnitude += leftValue * leftValue
    rightMagnitude += rightValue * rightValue
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

const make = Ref.make(HashMap.empty<string, Embedded>()).pipe(
  Effect.map(
    (documents): Service => ({
      upsert: (nextDocuments) =>
        Effect.gen(function* () {
          for (const document of nextDocuments) {
            yield* validateVector(`document ${document.id} embedding`, document.embedding)
          }
          yield* Ref.update(documents, (current) => {
            let next = current
            for (const document of nextDocuments) {
              next = HashMap.set(next, storageKey(document.key, document.id), document)
            }
            return next
          })
        }),
      query: (input) =>
        Effect.gen(function* () {
          if (input.limit <= 0) return []
          yield* validateVector("query embedding", input.embedding)
          const current = yield* Ref.get(documents)
          const matches: Array<Match> = []
          for (const [, document] of current) {
            if (!sameKey(document.key, input.key)) continue
            if (document.embedding.length !== input.embedding.length) {
              return yield* VectorStoreError.make({
                message: `document ${document.id} embedding dimension ${document.embedding.length} does not match query dimension ${input.embedding.length}`,
              })
            }
            const score = cosine(document.embedding, input.embedding)
            if (input.minScore !== undefined && score < input.minScore) continue
            matches.push({ document, score })
          }
          return matches.toSorted((left, right) => right.score - left.score).slice(0, input.limit)
        }),
      delete: (input) =>
        Ref.update(documents, (current) =>
          HashMap.filter(current, (document) => {
            if (!sameKey(document.key, input.key)) return true
            return input.id === undefined ? false : document.id !== input.id
          }),
        ),
    }),
  ),
)

/** @experimental Ref-backed non-durable vector store. */
export const layerMemory: Layer.Layer<VectorStore> = Layer.effect(VectorStore, make.pipe(Effect.map(VectorStore.of)))

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<VectorStore> =>
  Layer.succeed(VectorStore, VectorStore.of(implementation))

const PgVectorRow = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  metadata: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  embedding: Schema.String,
  score: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
})

const vectorText = (embedding: ReadonlyArray<number>): string => JSON.stringify(embedding)

const pgError = (operation: string, cause: unknown): VectorStoreError =>
  VectorStoreError.make({ message: `pgvector ${operation} failed: ${String(cause)}` })

/** @experimental Persistent PostgreSQL vector store. Requires the `vector` extension. */
export const layerPgVector = (
  options: PgVectorOptions,
): Layer.Layer<VectorStore, VectorStoreError, SqlClient.SqlClient> =>
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
      `.pipe(Effect.mapError((error) => pgError("initialization", error)))

      const decodeRows = Schema.decodeUnknownEffect(Schema.Array(PgVectorRow))
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
              `.pipe(Effect.mapError((error) => pgError("upsert", error)))
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
            `.pipe(Effect.mapError((error) => pgError("query", error)))
            const decoded = yield* decodeRows(rows).pipe(Effect.mapError((error) => pgError("row decoding", error)))
            return yield* Effect.forEach(decoded, (row) =>
              decodeEmbedding(row.embedding).pipe(
                Effect.mapError((error) => pgError("embedding decoding", error)),
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
            Effect.mapError((error) => pgError("delete", error)),
            Effect.asVoid,
          ),
      }
      return VectorStore.of(service)
    }),
  )
