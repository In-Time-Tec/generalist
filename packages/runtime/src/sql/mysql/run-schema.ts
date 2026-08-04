import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "../errors.js"
import {
  MIGRATION_LOCK,
  MIGRATION_MANIFEST,
  MIGRATION_STATEMENTS,
  SCHEMA_META_TABLE,
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
    statements: meta.version < SCHEMA_VERSION ? MIGRATION_STATEMENTS : [],
    upgradeRequired: meta.version < SCHEMA_VERSION,
  }))

export const check = (source: string) =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    if (!meta.present || meta.version < SCHEMA_VERSION) {
      return yield* SchemaUpgradeRequired.make({ source, current: meta.version, required: SCHEMA_VERSION })
    }
    if (meta.dirty) return yield* SchemaDirty.make({ source, version: meta.version })
    if (meta.version > SCHEMA_VERSION) {
      return yield* SchemaVersionUnsupported.make({ source, version: meta.version, supported: SCHEMA_VERSION })
    }
    const expected = schemaChecksum()
    if (meta.checksum !== expected) {
      return yield* SchemaChecksumMismatch.make({ source, expected, actual: meta.checksum })
    }
  })

export const apply = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const meta = yield* readMeta(source)
    if (meta.version > SCHEMA_VERSION) {
      return yield* SchemaVersionUnsupported.make({ source, version: meta.version, supported: SCHEMA_VERSION })
    }
    if (meta.present && !meta.dirty && meta.version === SCHEMA_VERSION && meta.checksum === schemaChecksum()) return
    return yield* sql.withTransaction(
      Effect.acquireUseRelease(
        sql<{ acquired: number }>`SELECT GET_LOCK(${MIGRATION_LOCK}, 30) AS acquired`.pipe(
          Effect.flatMap((rows) =>
            Number(rows[0]?.acquired) === 1
              ? Effect.void
              : SchemaMigrationFailed.make({ source, message: "timed out acquiring MySQL migration lock" }),
          ),
        ),
        () =>
          Effect.gen(function* () {
            yield* sql.unsafe(MIGRATION_STATEMENTS[0]!)
            yield* sql`
          INSERT INTO baton_schema_meta (id, version, checksum, dirty, applied_at)
          VALUES (1, 0, '', 1, NOW(3))
          ON DUPLICATE KEY UPDATE dirty = 1
        `
            for (const statement of MIGRATION_STATEMENTS.slice(1)) yield* sql.unsafe(statement)
            const migration = MIGRATION_MANIFEST[0]
            yield* sql`
          INSERT INTO baton_sql_migrations (migration_id, name, applied_at)
          VALUES (${migration.id}, ${migration.name}, NOW(3))
          ON DUPLICATE KEY UPDATE name = VALUES(name)
        `
            yield* sql`
          UPDATE baton_schema_meta
          SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = 0, applied_at = NOW(3)
          WHERE id = 1
        `
            yield* check(source)
          }).pipe(Effect.mapError(migrationFailure(source, "migration failed"))),
        () => sql`SELECT RELEASE_LOCK(${MIGRATION_LOCK})`.pipe(Effect.ignore),
      ),
    )
  })

export const markDirty = (source: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE baton_schema_meta SET dirty = 1 WHERE id = 1`
  }).pipe(Effect.mapError(migrationFailure(source, "failed to mark schema dirty")))

export const MysqlRunSchema = { plan, check, apply, markDirty } as const
