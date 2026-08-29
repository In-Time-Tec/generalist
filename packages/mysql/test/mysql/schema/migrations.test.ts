import { beforeAll } from "vitest"
import { describe, expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "tenetkit/runtime/driver/sql/errors"
import { RunSchema } from "../../../src/mysql/schema/migrations.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"
import { mysqlAvailable, mysqlDatabase } from "../runtime/environment.js"

const describeMysql = describe.runIf(mysqlAvailable)
const database = mysqlDatabase("migration")
const client = database.client
const tables = [
  "tenetkit_session_entries",
  "tenetkit_sessions",
  "tenetkit_run_registrations",
  "tenetkit_executable_registrations",
  "tenetkit_program_operations",
  "tenetkit_program_runs",
  "tenetkit_tree_event_index",
  "tenetkit_tree_roots",
  "tenetkit_fan_out_members",
  "tenetkit_fan_outs",
  "tenetkit_run_steering",
  "tenetkit_messages",
  "tenetkit_agent_names",
  "tenetkit_external_child_placements",
  "tenetkit_run_links",
  "tenetkit_run_waits",
  "tenetkit_run_operations",
  "tenetkit_run_events",
  "tenetkit_runs",
  "tenetkit_lanes",
  "tenetkit_runtime_locks",
  "tenetkit_sql_migrations",
  "tenetkit_schema_meta",
] as const

const resetSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=0")
  for (const table of tables) yield* sql.unsafe(`DROP TABLE IF EXISTS ${table}`)
  yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=1")
})

const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const columns = yield* sql<{ column_name: string }>`
    SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenetkit_runs'
  `
  const meta = yield* sql<{
    version: number
    checksum: string
  }>`SELECT version, checksum FROM tenetkit_schema_meta WHERE id = 1`
  const migrations = yield* sql<{ migration_id: number }>`
    SELECT migration_id FROM tenetkit_sql_migrations ORDER BY migration_id
  `
  expect({ version: Number(meta[0]?.version), checksum: meta[0]?.checksum }).toEqual({
    version: SCHEMA_VERSION,
    checksum: schemaChecksum(),
  })
  const runColumns = columns.map((row) => row.column_name)
  expect(runColumns).toEqual(
    expect.arrayContaining([
      "executable_ref_json",
      "executable_manifest_json",
      "continuation_json",
      "pending_outcome_json",
    ]),
  )
  expect(runColumns).not.toContain("transcript_json")
  const sessionTables = yield* sql<{ table_name: string }>`
    SELECT TABLE_NAME AS table_name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name IN ('tenetkit_sessions', 'tenetkit_session_entries')
    ORDER BY table_name
  `
  const placementTables = yield* sql<{ table_name: string }>`
    SELECT TABLE_NAME AS table_name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'tenetkit_external_child_placements'
  `
  expect(sessionTables.map((row) => row.table_name)).toEqual(["tenetkit_session_entries", "tenetkit_sessions"])
  expect(placementTables.map((row) => row.table_name)).toEqual(["tenetkit_external_child_placements"])
  expect(migrations.map((row) => row.migration_id)).toEqual([1])
})

describeMysql("mysql schema baseline", () => {
  beforeAll(database.provisioned, 60_000)

  layer(client, { excludeTestServices: true })("creates the current baseline and applies idempotently", (suite) => {
    suite.effect("creates the current baseline and applies idempotently", () =>
      Effect.gen(function* () {
        yield* resetSchema
        yield* RunSchema.apply("mysql-migration-test")
        yield* RunSchema.apply("mysql-migration-test")
        yield* inspectSchema
      }),
    )
  })

  layer(client, { excludeTestServices: true })("refuses a foreign schema", (suite) => {
    suite.effect("refuses to create the baseline over unrelated tenetkit tables", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* sql`CREATE TABLE tenetkit_runs (run_id VARCHAR(255) PRIMARY KEY)
          ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`

        expect(yield* RunSchema.apply("mysql-migration-test").pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
        expect(
          yield* sql`SELECT TABLE_NAME AS table_name FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = 'tenetkit_schema_meta'`,
        ).toEqual([])
        yield* resetSchema
      }),
    )
  })

  layer(client, { excludeTestServices: true })("verifies migration identity", (suite) => {
    suite.effect("rejects a changed migration identity", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* RunSchema.apply("mysql-migration-test")
        yield* sql`UPDATE tenetkit_sql_migrations SET name = 'wrong' WHERE migration_id = 1`

        expect(yield* RunSchema.apply("mysql-migration-test").pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
        yield* resetSchema
      }),
    )
  })

  for (const [label, update, expected] of [
    ["dirty", "UPDATE tenetkit_schema_meta SET dirty = 1 WHERE id = 1", SchemaDirty],
    ["checksum", "UPDATE tenetkit_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
    [
      "future",
      `UPDATE tenetkit_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`,
      SchemaVersionUnsupported,
    ],
  ] as const) {
    layer(client, { excludeTestServices: true })(`rejects a ${label} schema`, (suite) => {
      suite.effect(`rejects a ${label} schema`, () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* resetSchema
          yield* RunSchema.apply("mysql-migration-test")
          yield* sql.unsafe(update)
          expect(yield* RunSchema.apply("mysql-migration-test").pipe(Effect.flip)).toBeInstanceOf(expected)
          yield* resetSchema
        }),
      )
    })
  }
})
