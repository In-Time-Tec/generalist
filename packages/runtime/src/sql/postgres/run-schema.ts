import { DateTime, Effect, Layer, Redacted } from "effect"
import { Migrator, SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { PgClient } from "@effect/sql-pg"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "../errors.js"
import { mapSqlError } from "../sql-effect.js"
import { MIGRATIONS_TABLE, SCHEMA_META_TABLE, SCHEMA_STATEMENTS, SCHEMA_VERSION, schemaChecksum } from "./schema.js"

export interface SchemaPlan {
  readonly current: number
  readonly required: number
  readonly checksum: string
  readonly statements: ReadonlyArray<string>
  readonly upgradeRequired: boolean
}

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
      return { version: Number(row.version), checksum: row.checksum, dirty: row.dirty, present: true as const }
    }),
  ).pipe(
    Effect.mapError((error) =>
      SchemaMigrationFailed.make({
        source,
        message: "message" in error ? String(error.message) : "schema meta read failed",
      }),
    ),
  )

const migrationEffect = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const statement of SCHEMA_STATEMENTS) yield* sql.unsafe(statement)
  const now = yield* DateTime.nowAsDate
  yield* sql`
    INSERT INTO ${sql(SCHEMA_META_TABLE)} (id, version, checksum, dirty, applied_at)
    VALUES (1, ${SCHEMA_VERSION}, ${schemaChecksum()}, FALSE, ${now})
  `
})

export const plan = (source: string): Effect.Effect<SchemaPlan, SchemaMigrationFailed, SqlClient.SqlClient> =>
  Effect.map(readMeta(source), (meta) => ({
    current: meta.version,
    required: SCHEMA_VERSION,
    checksum: schemaChecksum(),
    statements: meta.present ? [] : SCHEMA_STATEMENTS,
    upgradeRequired: !meta.present,
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
  })

export const apply = (source: string) =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    if (meta.present) return yield* check(source)
    const sql = yield* SqlClient.SqlClient
    const existing = yield* sql<{ present: number }>`
      SELECT COUNT(*) AS present FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name LIKE 'baton\_%' ESCAPE '\'
    `
    if (Number(existing[0]?.present ?? 0) > 0) {
      return yield* SchemaMigrationFailed.make({
        source,
        message: "cannot create the baseline over an existing Baton schema",
      })
    }
    const runMigrations = Migrator.make({})
    yield* runMigrations({
      loader: Migrator.fromRecord({ "0001_baton_runtime": migrationEffect }),
      table: MIGRATIONS_TABLE,
    }).pipe(
      Effect.mapError((error) =>
        SchemaMigrationFailed.make({
          source,
          message: "message" in error ? String(error.message) : "migration failed",
        }),
      ),
    )
    yield* check(source).pipe(
      Effect.catchTag("@batonfx/runtime/SchemaUpgradeRequired", (error) =>
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
        message: "message" in error ? String(error.message) : "failed to mark schema dirty",
      }),
    ),
  )

export const RunSchema = { plan, check, apply, markDirty } as const

export const layerClient = (url: string): Layer.Layer<SqlClient.SqlClient | PgClient.PgClient, SqlError> =>
  PgClient.layer({ url: Redacted.make(url) })
