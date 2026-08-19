import { Effect } from "effect"
import { SqlClient, type SqlError } from "effect/unstable/sql"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "tenetkit/runtime/driver/sql/errors"
import {
  MIGRATION_LOCK,
  MIGRATION_NAME,
  MIGRATIONS_TABLE,
  SCHEMA_META_TABLE,
  SCHEMA_STATEMENTS,
  SCHEMA_TABLES,
  SCHEMA_VERSION,
  schemaChecksum,
} from "./schema.js"

export interface SchemaPlan {
  readonly current: number
  readonly required: number
  readonly checksum: string
  readonly statements: ReadonlyArray<string>
  readonly upgradeRequired: boolean
}

const migrationFailure = (source: string, fallback: string) => (error: unknown) =>
  SchemaMigrationFailed.make({
    source,
    message: typeof error === "object" && error !== null && "message" in error ? String(error.message) : fallback,
  })

const verifyMigrationIdentity = (
  source: string,
  migrations: ReadonlyArray<{ readonly migration_id: number; readonly name: string }>,
) =>
  migrations.length === 1 && Number(migrations[0]?.migration_id) === 1 && migrations[0]?.name === MIGRATION_NAME
    ? Effect.void
    : SchemaMigrationFailed.make({ source, message: "migration identity mismatch" })

const readMeta = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const tables = yield* sql<{ present: number }>`
      SELECT COUNT(*) AS present FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ${SCHEMA_META_TABLE}
    `
    if (Number(tables[0]?.present ?? 0) === 0) {
      return { version: 0, checksum: "", dirty: false, present: false as const }
    }
    const rows = yield* sql<{ version: number; checksum: string; dirty: number | boolean }>`
      SELECT version, checksum, dirty FROM ${sql(SCHEMA_META_TABLE)} WHERE id = 1
    `
    const row = rows[0]
    if (row === undefined) return { version: 0, checksum: "", dirty: false, present: false as const }
    return {
      version: Number(row.version),
      checksum: row.checksum,
      dirty: row.dirty === true || Number(row.dirty) === 1,
      present: true as const,
    }
  }).pipe(Effect.mapError(migrationFailure(source, "schema meta read failed")))

export const plan = (source: string): Effect.Effect<SchemaPlan, SchemaMigrationFailed, SqlClient.SqlClient> =>
  Effect.map(readMeta(source), (meta) => ({
    current: meta.version,
    required: SCHEMA_VERSION,
    checksum: schemaChecksum(),
    statements: meta.present ? [] : SCHEMA_STATEMENTS,
    upgradeRequired: meta.version < SCHEMA_VERSION,
  }))

export const check = (source: string) =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    if (!meta.present) return yield* SchemaUpgradeRequired.make({ source, current: 0, required: SCHEMA_VERSION })
    if (meta.dirty) return yield* SchemaDirty.make({ source, version: meta.version })
    if (meta.version > SCHEMA_VERSION) {
      return yield* SchemaVersionUnsupported.make({ source, version: meta.version, supported: SCHEMA_VERSION })
    }
    const expected = schemaChecksum()
    if (meta.version !== SCHEMA_VERSION || meta.checksum !== expected) {
      return yield* SchemaChecksumMismatch.make({ source, expected, actual: meta.checksum })
    }
    const sql = yield* SqlClient.SqlClient
    const migrations = yield* sql<{ migration_id: number; name: string }>`
      SELECT migration_id, name FROM ${sql(MIGRATIONS_TABLE)} ORDER BY migration_id
    `.pipe(Effect.mapError(migrationFailure(source, "migration identity read failed")))
    yield* verifyMigrationIdentity(source, migrations)
  })

export const apply = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const meta = yield* readMeta(source)
    if (meta.present) return yield* check(source)

    return yield* Effect.gen(function* () {
      const connection = yield* sql.reserve
      const query = <A extends object>(statement: string, params: ReadonlyArray<unknown> = []) =>
        connection.execute(statement, params, undefined) as Effect.Effect<ReadonlyArray<A>, SqlError.SqlError>

      const acquired = yield* query<{ acquired: number | null }>("SELECT GET_LOCK(?, 30) AS acquired", [MIGRATION_LOCK])
      if (Number(acquired[0]?.acquired) !== 1) {
        return yield* SchemaMigrationFailed.make({ source, message: "timed out acquiring MySQL migration lock" })
      }
      yield* Effect.addFinalizer(() => query("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK]).pipe(Effect.ignore))

      const lockedMeta = yield* readMeta(source)
      if (lockedMeta.present) return yield* check(source)

      const existing = yield* query<{ present: number }>(
        `SELECT COUNT(*) AS present FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name IN (${SCHEMA_TABLES.map(() => "?").join(", ")})`,
        SCHEMA_TABLES,
      )
      if (Number(existing[0]?.present ?? 0) > 0) {
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
      yield* query(`INSERT INTO ${MIGRATIONS_TABLE} (migration_id, name, applied_at) VALUES (1, ?, NOW(3))`, [
        MIGRATION_NAME,
      ])
      yield* check(source)
    }).pipe(Effect.mapError(migrationFailure(source, "migration failed")), Effect.scoped)
  })

export const markDirty = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE ${sql(SCHEMA_META_TABLE)} SET dirty = 1 WHERE id = 1`
  }).pipe(Effect.mapError(migrationFailure(source, "failed to mark schema dirty")))

export const MysqlRunSchema = { plan, check, apply, markDirty } as const
