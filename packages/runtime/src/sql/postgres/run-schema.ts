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
import { MIGRATION_STATEMENTS, MIGRATIONS_TABLE, SCHEMA_META_TABLE, SCHEMA_VERSION, schemaChecksum } from "./schema.js"

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
          WHERE table_name = ${SCHEMA_META_TABLE}
        ) AS exists
      `
      if (exists[0]?.exists !== true) {
        return { version: 0, checksum: "", dirty: false, present: false as const }
      }
      const rows = yield* sql<{
        version: number
        checksum: string
        dirty: boolean
      }>`SELECT version, checksum, dirty FROM ${sql(SCHEMA_META_TABLE)} WHERE id = 1`
      const row = rows[0]
      if (row === undefined) {
        return { version: 0, checksum: "", dirty: false, present: false as const }
      }
      return {
        version: Number(row.version),
        checksum: row.checksum,
        dirty: row.dirty === true,
        present: true as const,
      }
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
  for (const statement of MIGRATION_STATEMENTS) {
    yield* sql.unsafe(statement)
  }
  const checksum = schemaChecksum()
  const now = yield* DateTime.nowAsDate
  yield* sql`
    INSERT INTO ${sql(SCHEMA_META_TABLE)} (id, version, checksum, dirty, applied_at)
    VALUES (1, ${SCHEMA_VERSION}, ${checksum}, FALSE, ${now})
    ON CONFLICT (id) DO UPDATE SET
      version = EXCLUDED.version,
      checksum = EXCLUDED.checksum,
      dirty = FALSE,
      applied_at = EXCLUDED.applied_at
  `
})

export const plan = (source: string): Effect.Effect<SchemaPlan, SchemaMigrationFailed, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    return {
      current: meta.version,
      required: SCHEMA_VERSION,
      checksum: schemaChecksum(),
      statements: MIGRATION_STATEMENTS,
      upgradeRequired: meta.version < SCHEMA_VERSION,
    }
  })

export const check = (
  source: string,
): Effect.Effect<
  void,
  SchemaDirty | SchemaChecksumMismatch | SchemaVersionUnsupported | SchemaUpgradeRequired | SchemaMigrationFailed,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const meta = yield* readMeta(source)
    if (!meta.present || meta.version < SCHEMA_VERSION) {
      return yield* SchemaUpgradeRequired.make({
        source,
        current: meta.version,
        required: SCHEMA_VERSION,
      })
    }
    if (meta.dirty) {
      return yield* SchemaDirty.make({ source, version: meta.version })
    }
    if (meta.version > SCHEMA_VERSION) {
      return yield* SchemaVersionUnsupported.make({
        source,
        version: meta.version,
        supported: SCHEMA_VERSION,
      })
    }
    const expected = schemaChecksum()
    if (meta.checksum !== expected) {
      return yield* SchemaChecksumMismatch.make({ source, expected, actual: meta.checksum })
    }
  })

export const apply = (
  source: string,
): Effect.Effect<
  void,
  SchemaDirty | SchemaChecksumMismatch | SchemaVersionUnsupported | SchemaMigrationFailed,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const runMigrations = Migrator.make({})
    yield* runMigrations({
      loader: Migrator.fromRecord({
        "0001_baton_runtime_postgres_kernel": migrationEffect,
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
    yield* check(source).pipe(
      Effect.catchTag("@batonfx/runtime/SchemaUpgradeRequired", (error) =>
        SchemaMigrationFailed.make({
          source,
          message: `upgrade still required after apply: ${error.current} -> ${error.required}`,
        }),
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

export const RunSchema = {
  plan,
  check,
  apply,
  markDirty,
} as const

export const layerClient = (url: string): Layer.Layer<SqlClient.SqlClient | PgClient.PgClient, SqlError> =>
  PgClient.layer({ url: Redacted.make(url) })
