import { DateTime, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { OperationRef } from "../core/context/memory.js"
import { type Embedded, type Match, type Service, VectorStore, VectorStoreError } from "./vector-store.js"

/** PostgreSQL pgvector storage configuration. */
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
  version: Schema.Int,
  evidence: Schema.Array(OperationRef),
  supersedes: Schema.NullOr(Schema.Int),
  applied_at: Schema.String,
  score: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
})

const VersionRow = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  subject: Schema.String,
  text: Schema.String,
  metadata: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  embedding: Schema.String,
  version: Schema.Int,
  evidence: Schema.Array(OperationRef),
  supersedes: Schema.NullOr(Schema.Int),
  applied_at: Schema.String,
  active: Schema.Boolean,
})

const VersionStateRow = Schema.Struct({
  agent: Schema.String,
  subject: Schema.String,
  version: Schema.Union([Schema.Int, Schema.String]),
  active: Schema.Boolean,
})

const vectorText = (embedding: ReadonlyArray<number>): string => JSON.stringify(embedding)
const encodeEvidence = Schema.encodeSync(Schema.fromJsonString(Schema.Array(OperationRef)))
const error = (operation: string, cause: unknown): VectorStoreError =>
  VectorStoreError.make({ message: `pgvector ${operation} failed: ${String(cause)}` })
const storeError = (operation: string, cause: unknown): VectorStoreError =>
  Schema.is(VectorStoreError)(cause) ? cause : error(operation, cause)
const validateVector = (label: string, vector: ReadonlyArray<number>): Effect.Effect<void, VectorStoreError> =>
  vector.every(Number.isFinite)
    ? Effect.void
    : Effect.fail(VectorStoreError.make({ message: `${label} contains a non-finite value` }))

const validateVersion = (
  document: Embedded,
  rows: ReadonlyArray<typeof VersionStateRow.Type>,
): VectorStoreError | undefined => {
  const current = rows[0]
  if (current !== undefined && (current.agent !== document.key.agent || current.subject !== document.key.subject)) {
    return VectorStoreError.make({ message: `entry id ${document.id} already belongs to another memory key` })
  }
  const latest = current === undefined ? 0 : Number(current.version)
  if (document.version !== latest + 1) {
    return VectorStoreError.make({
      message: `entry ${document.id} version ${document.version} must follow version ${latest}`,
    })
  }
  const active = rows.find((row) => row.active)
  const validSupersession =
    latest === 0
      ? document.supersedes === undefined
      : document.supersedes !== undefined &&
        rows.some((row) => Number(row.version) === document.supersedes) &&
        (active === undefined || Number(active.version) === document.supersedes)
  return validSupersession
    ? undefined
    : VectorStoreError.make({
        message: `entry ${document.id} does not have active version ${document.supersedes}`,
      })
}

/** Persistent PostgreSQL vector store. Requires the `vector` extension. */
export const layer = (options: Options): Layer.Layer<VectorStore, VectorStoreError, SqlClient.SqlClient> =>
  Layer.effect(
    VectorStore,
    Effect.gen(function* () {
      if (!Number.isSafeInteger(options.dimensions) || options.dimensions <= 0) {
        return yield* VectorStoreError.make({ message: "pgvector dimensions must be a positive safe integer" })
      }
      const sql = yield* SqlClient.SqlClient
      const table = sql(options.table)
      const historyTable = sql(`${options.table}_history`)
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
      yield* sql`
        CREATE TABLE IF NOT EXISTS ${historyTable} (
          agent TEXT NOT NULL,
          subject TEXT NOT NULL,
          id TEXT NOT NULL,
          version INTEGER NOT NULL,
          text TEXT NOT NULL,
          metadata JSONB,
          embedding vector(${sql.literal(String(options.dimensions))}) NOT NULL,
          evidence JSONB NOT NULL,
          supersedes INTEGER,
          applied_at TEXT NOT NULL,
          active BOOLEAN NOT NULL,
          PRIMARY KEY (agent, subject, id, version)
        )
      `.pipe(Effect.mapError((cause) => error("history initialization", cause)))
      yield* sql`
        CREATE UNIQUE INDEX IF NOT EXISTS ${sql(`${options.table}_history_active`)}
        ON ${historyTable} (agent, subject, id) WHERE active
      `.pipe(Effect.mapError((cause) => error("history index initialization", cause)))
      yield* sql`
        CREATE UNIQUE INDEX IF NOT EXISTS ${sql(`${options.table}_history_identity`)}
        ON ${historyTable} (id, version)
      `.pipe(Effect.mapError((cause) => error("history identity initialization", cause)))
      const migratedAt = DateTime.formatIso(yield* DateTime.now)
      yield* sql`
        INSERT INTO ${historyTable}
          (agent, subject, id, version, text, metadata, embedding, evidence, supersedes, applied_at, active)
        SELECT active.agent, active.subject, active.id, 1, active.text, active.metadata, active.embedding,
          '[]'::jsonb, NULL, ${migratedAt}, TRUE
        FROM ${table} active
        WHERE NOT EXISTS (SELECT 1 FROM ${historyTable} history WHERE history.id = active.id)
      `.pipe(Effect.mapError((cause) => error("legacy history backfill", cause)))

      const decodeRows = Schema.decodeUnknownEffect(Schema.Array(Row))
      const decodeVersionRows = Schema.decodeUnknownEffect(Schema.Array(VersionRow))
      const decodeVersionStateRows = Schema.decodeUnknownEffect(Schema.Array(VersionStateRow))
      const decodeEmbedding = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Schema.Finite)))

      const upsertDocument = Effect.fn("PgVector.upsertDocument")(function* (document: Embedded) {
        yield* validateVector(`document ${document.id} embedding`, document.embedding)
        if (document.embedding.length !== options.dimensions) {
          return yield* VectorStoreError.make({
            message: `document ${document.id} embedding dimension ${document.embedding.length} does not match configured dimension ${options.dimensions}`,
          })
        }
        const currentRows = yield* sql`
          SELECT agent, subject, version, active
          FROM ${historyTable}
          WHERE id = ${document.id}
          ORDER BY version DESC
          FOR UPDATE
        `.pipe(
          Effect.mapError((cause) => error("version read", cause)),
          Effect.flatMap((rows) =>
            decodeVersionStateRows(rows).pipe(Effect.mapError((cause) => error("version row decoding", cause))),
          ),
        )
        const invalid = validateVersion(document, currentRows)
        if (invalid !== undefined) return yield* invalid
        yield* sql`
          UPDATE ${historyTable} SET active = FALSE
          WHERE agent = ${document.key.agent} AND subject = ${document.key.subject} AND id = ${document.id}
        `.pipe(Effect.mapError((cause) => error("version deactivation", cause)))
        yield* sql`
          INSERT INTO ${historyTable}
            (agent, subject, id, version, text, metadata, embedding, evidence, supersedes, applied_at, active)
          VALUES (${document.key.agent}, ${document.key.subject}, ${document.id}, ${document.version},
            ${document.text}, ${document.metadata ?? null}, ${vectorText(document.embedding)}::vector,
            ${encodeEvidence(document.evidence)}::jsonb, ${document.supersedes ?? null}, ${document.appliedAt}, TRUE)
        `.pipe(Effect.mapError((cause) => error("version insert", cause)))
        yield* sql`
          INSERT INTO ${table} (agent, subject, id, text, metadata, embedding)
          VALUES (${document.key.agent}, ${document.key.subject}, ${document.id}, ${document.text},
            ${document.metadata ?? null}, ${vectorText(document.embedding)}::vector)
          ON CONFLICT (agent, subject, id) DO UPDATE SET
            text = EXCLUDED.text,
            metadata = EXCLUDED.metadata,
            embedding = EXCLUDED.embedding
        `.pipe(Effect.mapError((cause) => error("upsert", cause)))
      })

      const embedded = (row: typeof VersionRow.Type): Effect.Effect<Embedded, VectorStoreError> =>
        decodeEmbedding(row.embedding).pipe(
          Effect.mapError((cause) => error("embedding decoding", cause)),
          Effect.map((embedding) => ({
            id: row.id,
            key: { agent: row.agent, subject: row.subject },
            text: row.text,
            embedding,
            version: row.version,
            evidence: row.evidence,
            ...(row.metadata === null ? undefined : { metadata: row.metadata }),
            ...(row.supersedes === null ? undefined : { supersedes: row.supersedes }),
            appliedAt: row.applied_at,
          })),
        )

      const service: Service = {
        upsert: (documents) =>
          sql
            .withTransaction(Effect.forEach(documents, upsertDocument, { concurrency: 1, discard: true }))
            .pipe(Effect.mapError((cause) => storeError("upsert transaction", cause))),
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
              SELECT d.id, d.agent, d.subject, d.text, d.metadata, d.embedding::text AS embedding,
                h.version, h.evidence, h.supersedes, h.applied_at,
                1 - (d.embedding <=> ${vector}::vector) AS score
              FROM ${table} d
              JOIN ${historyTable} h
                ON h.agent = d.agent AND h.subject = d.subject AND h.id = d.id AND h.active
              WHERE d.agent = ${input.key.agent} AND d.subject = ${input.key.subject}
                ${input.minScore === undefined ? sql.literal("") : sql`AND 1 - (d.embedding <=> ${vector}::vector) >= ${input.minScore}`}
              ORDER BY d.embedding <=> ${vector}::vector, d.id
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
                      version: row.version,
                      evidence: row.evidence,
                      ...(row.supersedes === null ? undefined : { supersedes: row.supersedes }),
                      appliedAt: row.applied_at,
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
        history: (entryId) =>
          sql`
            SELECT id, agent, subject, text, metadata, embedding::text AS embedding,
              version, evidence, supersedes, applied_at, active
            FROM ${historyTable}
            WHERE id = ${entryId}
            ORDER BY version
          `.pipe(
            Effect.mapError((cause) => error("history", cause)),
            Effect.flatMap((rows) =>
              decodeVersionRows(rows).pipe(Effect.mapError((cause) => error("history row decoding", cause))),
            ),
            Effect.flatMap((rows) => Effect.forEach(rows, embedded)),
          ),
        revert: (input) =>
          sql
            .withTransaction(
              Effect.gen(function* () {
                const rows = yield* sql`
                SELECT id, agent, subject, text, metadata, embedding::text AS embedding,
                  version, evidence, supersedes, applied_at, active
                FROM ${historyTable}
                WHERE id = ${input.entryId} AND version = ${input.to}
                FOR UPDATE
              `.pipe(
                  Effect.flatMap((values) =>
                    decodeVersionRows(values).pipe(Effect.mapError((cause) => error("revert row decoding", cause))),
                  ),
                )
                const target = rows[0]
                if (target === undefined) {
                  return yield* VectorStoreError.make({
                    message: `entry ${input.entryId} has no version ${input.to}`,
                  })
                }
                // The partial unique index on active rows is checked per row, so deactivate before activating.
                yield* sql`UPDATE ${historyTable} SET active = FALSE WHERE id = ${input.entryId} AND active`
                yield* sql`UPDATE ${historyTable} SET active = TRUE WHERE id = ${input.entryId} AND version = ${input.to}`
                yield* sql`
                INSERT INTO ${table} (agent, subject, id, text, metadata, embedding)
                VALUES (${target.agent}, ${target.subject}, ${target.id}, ${target.text},
                  ${target.metadata}, ${target.embedding}::vector)
                ON CONFLICT (agent, subject, id) DO UPDATE SET
                  text = EXCLUDED.text,
                  metadata = EXCLUDED.metadata,
                  embedding = EXCLUDED.embedding
              `
              }),
            )
            .pipe(Effect.mapError((cause) => storeError("revert", cause))),
      }
      return VectorStore.of(service)
    }),
  )
