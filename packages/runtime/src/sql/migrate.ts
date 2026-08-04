import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SqliteMigrator } from "@effect/sql-sqlite-bun"
import { SchemaChecksumMismatch, SchemaDirty, SchemaMigrationFailed, SchemaVersionUnsupported } from "./errors.js"
import {
  KERNEL_MIGRATION_STATEMENTS,
  MIGRATIONS_TABLE,
  SCHEMA_META_TABLE,
  SCHEMA_VERSION,
  STEERING_MIGRATION_STATEMENTS,
  kernelSchemaChecksum,
  schemaChecksum,
} from "./schema.js"
import { mapSqlError } from "./sql-effect.js"

const migrationEffect = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`PRAGMA foreign_keys = ON`
  for (const statement of KERNEL_MIGRATION_STATEMENTS) {
    yield* sql.unsafe(statement)
  }
  const checksum = kernelSchemaChecksum()
  const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
  yield* sql`
    INSERT INTO ${sql(SCHEMA_META_TABLE)} (id, version, checksum, dirty, applied_at)
    VALUES (1, 1, ${checksum}, 0, ${now})
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      checksum = excluded.checksum,
      dirty = 0,
      applied_at = excluded.applied_at
  `
})

const steeringMigrationEffect = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const statement of STEERING_MIGRATION_STATEMENTS) yield* sql.unsafe(statement)
  const now = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
  yield* sql`
    UPDATE ${sql(SCHEMA_META_TABLE)}
    SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = 0, applied_at = ${now}
    WHERE id = 1
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
      const rows = yield* sql<{
        version: number
        checksum: string
        dirty: number
      }>`SELECT version, checksum, dirty FROM ${sql(SCHEMA_META_TABLE)} WHERE id = 1`
      const row = rows[0]
      if (row === undefined) {
        return yield* SchemaMigrationFailed.make({ source, message: "schema meta missing after migration" })
      }
      if (Number(row.dirty) === 1) {
        return yield* SchemaDirty.make({ source, version: Number(row.version) })
      }
      if (Number(row.version) > SCHEMA_VERSION) {
        return yield* SchemaVersionUnsupported.make({
          source,
          version: Number(row.version),
          supported: SCHEMA_VERSION,
        })
      }
      const expected = schemaChecksum()
      if (row.checksum !== expected) {
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
    yield* SqliteMigrator.run({
      loader: SqliteMigrator.fromRecord({
        "0001_baton_runtime_kernel": migrationEffect,
        "0002_baton_runtime_steering": steeringMigrationEffect,
      }),
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
