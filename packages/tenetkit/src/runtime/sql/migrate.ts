import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SchemaChecksumMismatch, SchemaDirty, SchemaMigrationFailed, SchemaVersionUnsupported } from "./errors.js"
import {
  MIGRATIONS_TABLE,
  MIGRATION_NAME,
  SCHEMA_META_TABLE,
  SCHEMA_STATEMENTS,
  SCHEMA_TABLES,
  SCHEMA_VERSION,
  schemaChecksum,
} from "./codec/schema.js"
import { mapSqlError } from "./effect.js"

const migrationEffect = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS ${sql(MIGRATIONS_TABLE)} (
    migration_id integer PRIMARY KEY NOT NULL,
    created_at datetime NOT NULL DEFAULT current_timestamp,
    name VARCHAR(255) NOT NULL
  )`
  for (const statement of SCHEMA_STATEMENTS) yield* sql.unsafe(statement)
  const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
  yield* sql`
    INSERT INTO ${sql(SCHEMA_META_TABLE)} (id, version, checksum, dirty, applied_at)
    VALUES (1, ${SCHEMA_VERSION}, ${schemaChecksum()}, 0, ${now})
  `
  yield* sql`INSERT INTO ${sql(MIGRATIONS_TABLE)} (migration_id, name) VALUES (1, ${MIGRATION_NAME})`
})

export const verifySchema = (
  source: string,
): Effect.Effect<
  void,
  SchemaDirty | SchemaChecksumMismatch | SchemaVersionUnsupported | SchemaMigrationFailed,
  SqlClient.SqlClient
> =>
  mapSqlError(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ version: number; checksum: string; dirty: number }>`
        SELECT version, checksum, dirty FROM ${sql(SCHEMA_META_TABLE)} WHERE id = 1
      `
      const row = rows[0]
      if (row === undefined) {
        return yield* SchemaMigrationFailed.make({ source, message: "schema meta missing after migration" })
      }
      if (row.dirty === 1) return yield* SchemaDirty.make({ source, version: row.version })
      if (row.version !== SCHEMA_VERSION) {
        return yield* SchemaVersionUnsupported.make({
          source,
          version: row.version,
          supported: SCHEMA_VERSION,
        })
      }
      const expected = schemaChecksum()
      if (row.checksum !== expected) {
        return yield* SchemaChecksumMismatch.make({ source, expected, actual: row.checksum })
      }
      const migrations = yield* sql<{ migration_id: number; name: string }>`
        SELECT migration_id, name FROM ${sql(MIGRATIONS_TABLE)} ORDER BY migration_id
      `
      if (migrations.length !== 1 || migrations[0]?.migration_id !== 1 || migrations[0]?.name !== MIGRATION_NAME) {
        return yield* SchemaMigrationFailed.make({ source, message: "migration identity or checksum mismatch" })
      }
    }),
  ).pipe(
    Effect.mapError((error) =>
      "_tag" in error && error._tag === "tenetkit/runtime/RuntimeUnavailable"
        ? SchemaMigrationFailed.make({ source, message: error.message })
        : error,
    ),
  )

export const markDirty = (source: string): Effect.Effect<void, SchemaMigrationFailed, SqlClient.SqlClient> =>
  mapSqlError(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET dirty = 1 WHERE id = 1`
    }),
  ).pipe(
    Effect.mapError((error) =>
      SchemaMigrationFailed.make({
        source,
        message: "message" in error ? error.message : "failed to mark schema dirty",
      }),
    ),
  )

export const migrate = (
  source: string,
): Effect.Effect<
  void,
  SchemaDirty | SchemaChecksumMismatch | SchemaVersionUnsupported | SchemaMigrationFailed,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* mapSqlError(sql`PRAGMA foreign_keys = ON`).pipe(
      Effect.mapError((error) =>
        SchemaMigrationFailed.make({
          source,
          message: "message" in error ? error.message : "pragma failed",
        }),
      ),
    )
    const existing = yield* mapSqlError(sql<{ meta_present: number; application_tables: number }>`
      SELECT
        SUM(CASE WHEN name = ${SCHEMA_META_TABLE} THEN 1 ELSE 0 END) AS meta_present,
        SUM(CASE WHEN name = ${MIGRATIONS_TABLE} THEN 0 ELSE 1 END) AS application_tables
      FROM sqlite_master WHERE type = 'table' AND name IN ${sql.in(SCHEMA_TABLES)}
    `).pipe(Effect.mapError(() => SchemaMigrationFailed.make({ source, message: "schema meta read failed" })))
    if ((existing[0]?.meta_present ?? 0) > 0) return yield* verifySchema(source)
    if ((existing[0]?.application_tables ?? 0) > 0) {
      return yield* SchemaMigrationFailed.make({
        source,
        message: "cannot create the baseline over an existing TenetKit schema",
      })
    }

    yield* mapSqlError(sql.withTransaction(migrationEffect)).pipe(
      Effect.mapError((error) =>
        SchemaMigrationFailed.make({
          source,
          message: "message" in error ? error.message : "migration failed",
        }),
      ),
    )
    yield* verifySchema(source)
  })
