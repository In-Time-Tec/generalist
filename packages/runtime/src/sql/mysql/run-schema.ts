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
  EXECUTABLE_MIGRATION_STATEMENTS,
  MIGRATION_LOCK,
  MIGRATION_MANIFEST,
  MIGRATION_STATEMENTS,
  OPERATION_RESOLUTION_MIGRATION_STATEMENTS,
  SCHEMA_META_TABLE,
  SCHEMA_VERSION,
  schemaChecksum,
  steeringSchemaChecksum,
  treeSchemaChecksum,
  fanOutSchemaChecksum,
  executableSchemaChecksum,
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

interface ColumnDefinition {
  readonly column_name: string
  readonly data_type: string
  readonly is_nullable: string
  readonly character_maximum_length: number | string | null
}

const readMigrationColumns = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<ColumnDefinition>`
    SELECT column_name, data_type, is_nullable, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND ((table_name = 'baton_runs' AND column_name IN (
        'agent_json', 'executable_ref_json', 'executable_manifest_json'
      )) OR (table_name = 'baton_run_operations' AND column_name IN (
        'resolution_idempotency_key', 'resolution_json'
      )))
  `
})

const requireColumn = (
  source: string,
  columns: ReadonlyMap<string, ColumnDefinition>,
  migrationId: number,
  name: string,
  dataType: string,
  nullable: boolean,
  maximumLength?: number,
): Effect.Effect<boolean, SchemaMigrationFailed> => {
  const column = columns.get(name)
  if (column === undefined) return Effect.succeed(false)
  const valid =
    column.data_type.toLowerCase() === dataType &&
    (column.is_nullable === "YES") === nullable &&
    (maximumLength === undefined || Number(column.character_maximum_length) === maximumLength)
  return valid
    ? Effect.succeed(true)
    : SchemaMigrationFailed.make({
        source,
        message: `incompatible partial MySQL migration ${migrationId} state: ${name} has an unexpected definition`,
      })
}

const reconcileExecutableMigration = (source: string, alreadyApplied: boolean) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const columns = new Map((yield* readMigrationColumns).map((column) => [column.column_name, column]))
    const agentPresent = yield* requireColumn(source, columns, 5, "agent_json", "longtext", false)
    const referencePresent = yield* requireColumn(source, columns, 5, "executable_ref_json", "longtext", false)
    const manifestPresent = yield* requireColumn(source, columns, 5, "executable_manifest_json", "longtext", false)

    if (alreadyApplied) {
      if (!referencePresent || !manifestPresent || agentPresent) {
        return yield* SchemaMigrationFailed.make({
          source,
          message: "incompatible partial MySQL migration 5 state: recorded migration is incomplete",
        })
      }
      return
    }

    const runs = yield* sql<{ present: number }>`SELECT EXISTS (SELECT 1 FROM baton_runs) AS present`
    if (Number(runs[0]?.present ?? 0) === 1) {
      return yield* SchemaMigrationFailed.make({
        source,
        message: "cannot migrate nonempty baton_runs to executable manifests",
      })
    }
    if (!agentPresent && (!referencePresent || !manifestPresent)) {
      return yield* SchemaMigrationFailed.make({
        source,
        message:
          "incompatible partial MySQL migration 5 state: agent_json was dropped before replacement columns exist",
      })
    }
    if (!referencePresent) yield* sql.unsafe(EXECUTABLE_MIGRATION_STATEMENTS[0]!)
    if (!manifestPresent) yield* sql.unsafe(EXECUTABLE_MIGRATION_STATEMENTS[1]!)
    if (agentPresent) yield* sql.unsafe(EXECUTABLE_MIGRATION_STATEMENTS[2]!)

    const completed = new Map((yield* readMigrationColumns).map((column) => [column.column_name, column]))
    if (
      !(yield* requireColumn(source, completed, 5, "executable_ref_json", "longtext", false)) ||
      !(yield* requireColumn(source, completed, 5, "executable_manifest_json", "longtext", false)) ||
      completed.has("agent_json")
    ) {
      return yield* SchemaMigrationFailed.make({
        source,
        message: "incompatible partial MySQL migration 5 state: migration did not reach its canonical state",
      })
    }
  })

const reconcileOperationResolutionMigration = (source: string, alreadyApplied: boolean) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const columns = new Map((yield* readMigrationColumns).map((column) => [column.column_name, column]))
    const keyPresent = yield* requireColumn(source, columns, 6, "resolution_idempotency_key", "varchar", true, 255)
    const resolutionPresent = yield* requireColumn(source, columns, 6, "resolution_json", "longtext", true)

    if (alreadyApplied && (!keyPresent || !resolutionPresent)) {
      return yield* SchemaMigrationFailed.make({
        source,
        message: "incompatible partial MySQL migration 6 state: recorded migration is incomplete",
      })
    }
    if (!keyPresent) yield* sql.unsafe(OPERATION_RESOLUTION_MIGRATION_STATEMENTS[0]!)
    if (!resolutionPresent) yield* sql.unsafe(OPERATION_RESOLUTION_MIGRATION_STATEMENTS[1]!)

    const completed = new Map((yield* readMigrationColumns).map((column) => [column.column_name, column]))
    const completedKey = yield* requireColumn(source, completed, 6, "resolution_idempotency_key", "varchar", true, 255)
    const completedResolution = yield* requireColumn(source, completed, 6, "resolution_json", "longtext", true)
    if (!completedKey || !completedResolution) {
      return yield* SchemaMigrationFailed.make({
        source,
        message: "incompatible partial MySQL migration 6 state: migration did not reach its canonical state",
      })
    }
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
            for (const migration of MIGRATION_MANIFEST) {
              const applied = yield* sql<{ migration_id: number }>`
                SELECT migration_id FROM baton_sql_migrations WHERE migration_id = ${migration.id}
              `
              const alreadyApplied = applied.length > 0
              if (migration.id === 5) {
                yield* reconcileExecutableMigration(source, alreadyApplied)
              } else if (migration.id === 6) {
                yield* reconcileOperationResolutionMigration(source, alreadyApplied)
              } else {
                if (alreadyApplied) continue
                for (const statement of migration.statements) yield* sql.unsafe(statement)
              }
              if (!alreadyApplied) {
                yield* sql`
                  INSERT INTO baton_sql_migrations (migration_id, name, applied_at)
                  VALUES (${migration.id}, ${migration.name}, NOW(3))
                `
              }
              if (alreadyApplied && meta.version >= migration.id && !meta.dirty) continue
              if (migration.id === 2) {
                yield* sql`
                  UPDATE baton_schema_meta
                  SET version = 2, checksum = ${steeringSchemaChecksum()}, dirty = 0, applied_at = NOW(3)
                  WHERE id = 1
                `
              } else if (migration.id === 3) {
                yield* sql`
                  UPDATE baton_schema_meta
                  SET version = 3, checksum = ${fanOutSchemaChecksum()}, dirty = 0, applied_at = NOW(3)
                  WHERE id = 1
                `
              } else if (migration.id === 4) {
                yield* sql`
                  UPDATE baton_schema_meta
                  SET version = 4, checksum = ${treeSchemaChecksum()}, dirty = 0, applied_at = NOW(3)
                  WHERE id = 1
                `
              } else if (migration.id === 5) {
                yield* sql`
                  UPDATE baton_schema_meta
                  SET version = 5, checksum = ${executableSchemaChecksum()}, dirty = 0, applied_at = NOW(3)
                  WHERE id = 1
                `
              } else if (migration.id === 6) {
                yield* sql`
                  UPDATE baton_schema_meta
                  SET version = ${SCHEMA_VERSION}, checksum = ${schemaChecksum()}, dirty = 0, applied_at = NOW(3)
                  WHERE id = 1
                `
              }
            }
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
