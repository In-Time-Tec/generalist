import { Cause, DateTime, Effect } from "effect"
import { Migrator, SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  checkSqlMigrationIdentity,
  checkSqlSchemaMeta,
  mapSqlError,
  SchemaMigrationFailed,
  planSqlSchema,
  type SqlSchemaPlan,
} from "tenetkit/runtime/sql-driver"
import {
  MIGRATION_NAME,
  MIGRATIONS_TABLE,
  SCHEMA_META_TABLE,
  SCHEMA_STATEMENTS,
  SCHEMA_TABLES,
  SCHEMA_VERSION,
  schemaChecksum,
} from "./schema.js"
import { layerClient as postgresClient } from "./client.js"

export type SchemaPlan = SqlSchemaPlan

const migrationFailure = (source: string, fallback: string) => (error: SqlError | SchemaMigrationFailed) =>
  SchemaMigrationFailed.make({
    source,
    message: error.message || fallback,
  })

const readMeta = (source: string) =>
  mapSqlError(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const exists = yield* sql<{ exists: boolean }>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = ${SCHEMA_META_TABLE}
        ) AS exists
      `
      if (exists[0]?.exists !== true) return { version: 0, checksum: "", dirty: false, present: false as const }
      const rows = yield* sql<{ version: number; checksum: string; dirty: boolean }>`
        SELECT version, checksum, dirty FROM ${sql(SCHEMA_META_TABLE)} WHERE id = 1
      `
      const row = rows[0]
      if (row === undefined) return { version: 0, checksum: "", dirty: false, present: false as const }
      return { version: row.version, checksum: row.checksum, dirty: row.dirty, present: true as const }
    }),
  ).pipe(
    Effect.mapError((error) =>
      SchemaMigrationFailed.make({
        source,
        message: "message" in error ? error.message : "schema meta read failed",
      }),
    ),
  )

const verifyMigrationIdentity = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const migrations = yield* sql<{ migration_id: number; name: string }>`
      SELECT migration_id, name FROM ${sql(MIGRATIONS_TABLE)} ORDER BY migration_id
    `
    yield* checkSqlMigrationIdentity(migrations, source)
  }).pipe(Effect.mapError(migrationFailure(source, "migration identity read failed")))

const baselineMigration = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const statement of SCHEMA_STATEMENTS) yield* sql.unsafe(statement)
  const now = yield* DateTime.nowAsDate
  yield* sql`
    INSERT INTO ${sql(SCHEMA_META_TABLE)} (id, version, checksum, dirty, applied_at)
    VALUES (1, ${SCHEMA_VERSION}, ${schemaChecksum()}, FALSE, ${now})
  `
})

const runMigrations = (source: string) => {
  const migrate = Migrator.make({})
  return migrate({
    loader: Migrator.fromRecord({ [`0001_${MIGRATION_NAME}`]: baselineMigration }),
    table: MIGRATIONS_TABLE,
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.interrupt
        : SchemaMigrationFailed.make({ source, message: Cause.pretty(cause) || "migration failed" }),
    ),
  )
}

export const plan = (source: string): Effect.Effect<SchemaPlan, SchemaMigrationFailed, SqlClient.SqlClient> =>
  Effect.map(readMeta(source), (meta) => planSqlSchema(meta, SCHEMA_STATEMENTS))

export const check = (source: string) =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    yield* checkSqlSchemaMeta(meta, source)
    yield* verifyMigrationIdentity(source)
  })

export const apply = (source: string) =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    if (meta.present) return yield* check(source)
    const sql = yield* SqlClient.SqlClient
    const existing = yield* sql<{ present: number }>`
      SELECT COUNT(*) AS present FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name IN ${sql.in(SCHEMA_TABLES)}
    `
    if ((existing[0]?.present ?? 0) > 0) {
      return yield* SchemaMigrationFailed.make({
        source,
        message: "cannot create the baseline over an existing TenetKit schema",
      })
    }
    yield* runMigrations(source)
    yield* check(source).pipe(
      Effect.catchTag("tenetkit/runtime/SchemaUpgradeRequired", (error) =>
        SchemaMigrationFailed.make({ source, message: `schema absent after apply: ${error.current}` }),
      ),
    )
  })

export const markDirty = (source: string): Effect.Effect<void, SchemaMigrationFailed, SqlClient.SqlClient> =>
  mapSqlError(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET dirty = TRUE WHERE id = 1`
    }),
  ).pipe(
    Effect.mapError((error) =>
      SchemaMigrationFailed.make({
        source,
        message: "message" in error ? error.message : "failed to mark schema dirty",
      }),
    ),
  )

export const layerClient = (options: { readonly url: string; readonly maxConnections?: number }) =>
  postgresClient(options)
