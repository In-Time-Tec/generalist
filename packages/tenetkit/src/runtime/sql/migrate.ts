import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "./errors.js"
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
import { checkSqlMigrationIdentity, checkSqlSchemaMeta, planSqlSchema, type SqlSchemaPlan } from "./schema/contract.js"

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

const readMeta = (
  source: string,
): Effect.Effect<
  { readonly version: number; readonly checksum: string; readonly dirty: boolean; readonly present: boolean },
  SchemaMigrationFailed,
  SqlClient.SqlClient
> =>
  mapSqlError(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const tables = yield* sql<{ readonly present: number }>`
        SELECT COUNT(*) AS present FROM sqlite_master
        WHERE type = 'table' AND name = ${SCHEMA_META_TABLE}
      `
      if ((tables[0]?.present ?? 0) === 0) {
        return { version: 0, checksum: "", dirty: false, present: false }
      }
      const rows = yield* sql<{ version: number; checksum: string; dirty: number }>`
        SELECT version, checksum, dirty FROM ${sql(SCHEMA_META_TABLE)} WHERE id = 1
      `
      const row = rows[0]
      if (row === undefined) return { version: 0, checksum: "", dirty: false, present: false }
      return { version: row.version, checksum: row.checksum, dirty: row.dirty === 1, present: true }
    }),
  ).pipe(Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: error.message })))

export const plan = (source: string): Effect.Effect<SqlSchemaPlan, SchemaMigrationFailed, SqlClient.SqlClient> =>
  Effect.map(readMeta(source), (meta) => planSqlSchema(meta, SCHEMA_STATEMENTS))

export const check = (
  source: string,
): Effect.Effect<
  void,
  SchemaUpgradeRequired | SchemaDirty | SchemaChecksumMismatch | SchemaVersionUnsupported | SchemaMigrationFailed,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    yield* checkSqlSchemaMeta(meta, source)
    const sql = yield* SqlClient.SqlClient
    const migrations = yield* mapSqlError(
      sql<{ migration_id: number; name: string }>`
        SELECT migration_id, name FROM ${sql(MIGRATIONS_TABLE)} ORDER BY migration_id
      `,
    ).pipe(Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: error.message })))
    yield* checkSqlMigrationIdentity(migrations, source)
  })

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

export const apply = (
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
    if ((existing[0]?.meta_present ?? 0) > 0) {
      return yield* check(source).pipe(
        Effect.catchTag("tenetkit/runtime/SchemaUpgradeRequired", () =>
          SchemaMigrationFailed.make({ source, message: "schema meta missing after migration" }),
        ),
      )
    }
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
    yield* check(source).pipe(
      Effect.catchTag("tenetkit/runtime/SchemaUpgradeRequired", () =>
        SchemaMigrationFailed.make({ source, message: "schema absent after apply" }),
      ),
    )
  })

export const RunSchema = { plan, check, apply, markDirty } as const
