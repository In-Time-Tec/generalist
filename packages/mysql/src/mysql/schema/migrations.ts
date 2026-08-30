import { Effect, Metric, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  checkSqlMigrationIdentity,
  checkSqlSchemaMeta,
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
  planSqlSchema,
  type SqlSchemaPlan,
} from "tenetkit/runtime/sql-driver"
import {
  MIGRATION_LOCK,
  MIGRATION_NAME,
  MIGRATIONS_TABLE,
  SCHEMA_META_TABLE,
  SCHEMA_STATEMENTS,
  SCHEMA_TABLES,
  SCHEMA_VERSION,
  schemaChecksum,
} from "./definition.js"

export type SchemaPlan = SqlSchemaPlan

const migrationFailure = (source: string, fallback: string) => (error: SqlError) =>
  SchemaMigrationFailed.make({
    source,
    message: error.message || fallback,
  })

const AcquiredRows = Schema.Array(Schema.Tuple([Schema.NullOr(Schema.Finite)]))
const PresentRows = Schema.Array(Schema.Tuple([Schema.Finite]))

const migrationLockWait = Metric.timer("tenetkit_runtime_sql_migration_lock_wait_duration", {
  description: "Runtime SQL migration lock acquisition duration",
  attributes: { backend: "mysql" },
})

const readMeta = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const tables = yield* sql<{ present: number }>`
      SELECT COUNT(*) AS present FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ${SCHEMA_META_TABLE}
    `
    if ((tables[0]?.present ?? 0) === 0) {
      return { version: 0, checksum: "", dirty: false, present: false as const }
    }
    const rows = yield* sql<{ version: number; checksum: string; dirty: number | boolean }>`
      SELECT version, checksum, dirty FROM ${sql(SCHEMA_META_TABLE)} WHERE id = 1
    `
    const row = rows[0]
    if (row === undefined) return { version: 0, checksum: "", dirty: false, present: false as const }
    return {
      version: row.version,
      checksum: row.checksum,
      dirty: row.dirty === true || Number(row.dirty) === 1,
      present: true as const,
    }
  }).pipe(Effect.mapError(migrationFailure(source, "schema meta read failed")))

export const plan = (source: string): Effect.Effect<SchemaPlan, SchemaMigrationFailed, SqlClient.SqlClient> =>
  Effect.map(readMeta(source), (meta) => planSqlSchema(meta, SCHEMA_STATEMENTS))

export const check = (source: string) =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    yield* checkSqlSchemaMeta(meta, source)
    const sql = yield* SqlClient.SqlClient
    const migrations = yield* sql<{ migration_id: number; name: string }>`
      SELECT migration_id, name FROM ${sql(MIGRATIONS_TABLE)} ORDER BY migration_id
    `.pipe(Effect.mapError(migrationFailure(source, "migration identity read failed")))
    yield* checkSqlMigrationIdentity(migrations, source)
  })

export const apply = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const meta = yield* readMeta(source)
    if (meta.present) return yield* check(source)

    return yield* Effect.gen(function* () {
      const connection = yield* sql.reserve
      const query = (statement: string, params: ReadonlyArray<unknown> = []) =>
        connection.executeValues(statement, params)

      const acquired = yield* query("SELECT GET_LOCK(?, 30) AS acquired", [MIGRATION_LOCK]).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(AcquiredRows)),
        Effect.trackDuration(migrationLockWait),
        Effect.withSpan("TenetKit.Runtime.sqlMigrationLock", {
          attributes: { "tenetkit.runtime.sql.backend": "mysql" },
        }),
      )
      if (acquired[0]?.[0] !== 1) {
        return yield* SchemaMigrationFailed.make({ source, message: "timed out acquiring MySQL migration lock" })
      }
      yield* Effect.addFinalizer(() => query("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK]).pipe(Effect.ignore))

      const lockedMeta = yield* readMeta(source)
      if (lockedMeta.present) return yield* check(source)

      const existing = yield* query(
        `SELECT COUNT(*) AS present FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name IN (${SCHEMA_TABLES.map(() => "?").join(", ")})`,
        SCHEMA_TABLES,
      ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(PresentRows)))
      if ((existing[0]?.[0] ?? 0) > 0) {
        return yield* SchemaMigrationFailed.make({
          source,
          message: "cannot create the baseline over an existing TenetKit schema",
        })
      }
      for (const statement of SCHEMA_STATEMENTS) yield* query(statement)
      yield* query(
        `INSERT INTO ${SCHEMA_META_TABLE} (id, version, checksum, dirty, applied_at) VALUES (1, ?, ?, 0, NOW(3))`,
        [SCHEMA_VERSION, schemaChecksum()],
      )
      yield* query(`INSERT INTO ${MIGRATIONS_TABLE} (migration_id, name, created_at) VALUES (1, ?, NOW(3))`, [
        MIGRATION_NAME,
      ])
      yield* check(source)
    }).pipe(
      Effect.mapError((error) =>
        Schema.is(SchemaChecksumMismatch)(error) ||
        Schema.is(SchemaDirty)(error) ||
        Schema.is(SchemaMigrationFailed)(error) ||
        Schema.is(SchemaUpgradeRequired)(error) ||
        Schema.is(SchemaVersionUnsupported)(error)
          ? error
          : SchemaMigrationFailed.make({ source, message: String(error) }),
      ),
      Effect.scoped,
    )
  })

export const markDirty = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET dirty = 1 WHERE id = 1`
  }).pipe(Effect.mapError(migrationFailure(source, "failed to mark schema dirty")))

export const RunSchema = { plan, check, apply, markDirty } as const
