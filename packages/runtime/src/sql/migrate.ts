import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SqliteMigrator } from "@effect/sql-sqlite-bun"
import { SchemaChecksumMismatch, SchemaDirty, SchemaMigrationFailed, SchemaVersionUnsupported } from "./errors.js"
import { MIGRATIONS_TABLE, SCHEMA_META_TABLE, SCHEMA_STATEMENTS, SCHEMA_VERSION, schemaChecksum } from "./schema.js"
import { mapSqlError } from "./sql-effect.js"

const migrationEffect = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`PRAGMA foreign_keys = ON`
  for (const statement of SCHEMA_STATEMENTS) yield* sql.unsafe(statement)
  const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
  yield* sql`
    INSERT INTO ${sql(SCHEMA_META_TABLE)} (id, version, checksum, dirty, applied_at)
    VALUES (1, ${SCHEMA_VERSION}, ${schemaChecksum()}, 0, ${now})
  `
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
      if (Number(row.dirty) === 1) return yield* SchemaDirty.make({ source, version: Number(row.version) })
      if (Number(row.version) > SCHEMA_VERSION) {
        return yield* SchemaVersionUnsupported.make({
          source,
          version: Number(row.version),
          supported: SCHEMA_VERSION,
        })
      }
      const expected = schemaChecksum()
      if (Number(row.version) !== SCHEMA_VERSION || row.checksum !== expected) {
        return yield* SchemaChecksumMismatch.make({ source, expected, actual: row.checksum })
      }
    }),
  ).pipe(
    Effect.mapError((error) =>
      "_tag" in error && error._tag === "@batonfx/runtime/RuntimeUnavailable"
        ? SchemaMigrationFailed.make({ source, message: error.message })
        : (error as SchemaDirty | SchemaChecksumMismatch | SchemaVersionUnsupported | SchemaMigrationFailed),
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
        message: "message" in error ? String(error.message) : "failed to mark schema dirty",
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
          message: "message" in error ? String(error.message) : "pragma failed",
        }),
      ),
    )
    const existing = yield* mapSqlError(sql<{ meta_present: number; baton_tables: number }>`
      SELECT
        SUM(CASE WHEN name = ${SCHEMA_META_TABLE} THEN 1 ELSE 0 END) AS meta_present,
        COUNT(*) AS baton_tables
      FROM sqlite_master WHERE type = 'table' AND name LIKE 'baton_%'
    `).pipe(Effect.mapError(() => SchemaMigrationFailed.make({ source, message: "schema meta read failed" })))
    if (Number(existing[0]?.meta_present ?? 0) > 0) return yield* verifySchema(source)
    if (Number(existing[0]?.baton_tables ?? 0) > 0) {
      return yield* SchemaMigrationFailed.make({
        source,
        message: "cannot create the baseline over an existing Baton schema",
      })
    }

    yield* SqliteMigrator.run({
      loader: SqliteMigrator.fromRecord({ "0001_baton_runtime": migrationEffect }),
      table: MIGRATIONS_TABLE,
    }).pipe(
      Effect.mapError((error) =>
        SchemaMigrationFailed.make({
          source,
          message: "message" in error ? String(error.message) : "migration failed",
        }),
      ),
    )
    yield* verifySchema(source)
  })
