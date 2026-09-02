import { beforeAll } from "vitest"
import { describe, expect, layer } from "@effect/vitest"
import { Effect, Metric } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "generalist/runtime/sql-driver"
import { apply as applyRunSchema } from "../../../src/mysql/schema/migrations.js"
import { SCHEMA_STATEMENTS, SCHEMA_VERSION, schemaChecksum } from "../../../src/mysql/schema/definition.js"
import { inspectLogicalSqlSchema } from "../../../../generalist/test/runtime/sql/schema-conformance.js"
import { mysqlAvailable, mysqlDatabase } from "../runtime/environment.js"

const describeMysql = describe.runIf(mysqlAvailable)
const database = mysqlDatabase("migration")
const client = database.client
const tables = [
  "generalist_session_entries",
  "generalist_sessions",
  "generalist_run_registrations",
  "generalist_executable_registrations",
  "generalist_program_operations",
  "generalist_program_runs",
  "generalist_tree_event_index",
  "generalist_tree_roots",
  "generalist_fan_out_members",
  "generalist_fan_outs",
  "generalist_run_steering",
  "generalist_messages",
  "generalist_agent_names",
  "generalist_external_child_placements",
  "generalist_external_roots",
  "generalist_run_links",
  "generalist_run_waits",
  "generalist_run_operations",
  "generalist_run_acknowledgements",
  "generalist_run_events",
  "generalist_runs",
  "generalist_host_sessions",
  "generalist_lanes",
  "generalist_permission_rules",
  "generalist_runtime_locks",
  "generalist_sql_migrations",
  "generalist_schema_meta",
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
    SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'generalist_runs'
  `
  const meta = yield* sql<{
    version: number
    checksum: string
  }>`SELECT version, checksum FROM generalist_schema_meta WHERE id = 1`
  const migrations = yield* sql<{ migration_id: number }>`
    SELECT migration_id FROM generalist_sql_migrations ORDER BY migration_id
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
      "last_turn_completed_sequence",
    ]),
  )
  expect(runColumns).not.toContain("transcript_json")
  const sessionTables = yield* sql<{ table_name: string }>`
    SELECT TABLE_NAME AS table_name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name IN ('generalist_sessions', 'generalist_session_entries')
    ORDER BY table_name
  `
  const placementTables = yield* sql<{ table_name: string }>`
    SELECT TABLE_NAME AS table_name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'generalist_external_child_placements'
  `
  const acknowledgementTables = yield* sql<{ table_name: string }>`
    SELECT TABLE_NAME AS table_name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'generalist_run_acknowledgements'
  `
  expect(sessionTables.map((row) => row.table_name)).toEqual(["generalist_session_entries", "generalist_sessions"])
  expect(placementTables.map((row) => row.table_name)).toEqual(["generalist_external_child_placements"])
  expect(acknowledgementTables.map((row) => row.table_name)).toEqual(["generalist_run_acknowledgements"])
  expect(migrations.map((row) => row.migration_id)).toEqual([1])
  expect(yield* inspectLogicalSqlSchema).toEqual([])
})

describeMysql("mysql schema baseline", () => {
  beforeAll(database.provisioned, 60_000)

  layer(client, { excludeTestServices: true })("creates the current baseline and applies idempotently", (suite) => {
    suite.effect("creates the current baseline and applies idempotently", () =>
      Effect.gen(function* () {
        // The migration timer is a module-level metric: its hooks bind to the first registry that
        // updates it, and the provision hook has already applied the schema once in this file's
        // module graph. Providing a fresh registry here can therefore never observe the metric, so
        // assert the delta on the ambient registry instead.
        const lockWaits = (yield* Metric.snapshot).find(
          (item) =>
            item.id === "generalist_runtime_sql_migration_lock_wait_duration" && item.attributes?.backend === "mysql",
        )
        const appliedBefore = lockWaits?.type === "Histogram" ? lockWaits.state.count : 0
        yield* resetSchema
        yield* applyRunSchema("mysql-migration-test")
        yield* applyRunSchema("mysql-migration-test")
        yield* inspectSchema
        const snapshot = (yield* Metric.snapshot).find(
          (item) =>
            item.id === "generalist_runtime_sql_migration_lock_wait_duration" && item.attributes?.backend === "mysql",
        )
        expect(snapshot?.type).toBe("Histogram")
        if (snapshot?.type === "Histogram") expect(snapshot.state.count - appliedBefore).toBe(1)
      }),
    )
  })

  layer(client, { excludeTestServices: true })("refuses a foreign schema", (suite) => {
    suite.effect("refuses to create the baseline over unrelated generalist tables", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* sql`CREATE TABLE generalist_runs (run_id VARCHAR(255) PRIMARY KEY)
          ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`

        expect(yield* applyRunSchema("mysql-migration-test").pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
        expect(
          yield* sql`SELECT TABLE_NAME AS table_name FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = 'generalist_schema_meta'`,
        ).toEqual([])
        yield* resetSchema
      }),
    )
  })

  layer(client, { excludeTestServices: true })("detects partial physical DDL", (suite) => {
    suite.effect("preserves implicit-commit DDL and refuses to pretend bootstrap rolled back", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        for (const statement of SCHEMA_STATEMENTS.slice(0, 4)) yield* sql.unsafe(statement).unprepared

        expect(yield* applyRunSchema("mysql-migration-test").pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
        expect(
          (yield* sql<{ table_name: string }>`
              SELECT TABLE_NAME AS table_name FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name LIKE 'generalist_%'
              ORDER BY table_name
            `).map((row) => row.table_name),
        ).toEqual([
          "generalist_lanes",
          "generalist_runtime_locks",
          "generalist_schema_meta",
          "generalist_sql_migrations",
        ])
      }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie))),
    )
  })

  layer(client, { excludeTestServices: true })("verifies migration identity", (suite) => {
    suite.effect("rejects a changed migration identity", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* applyRunSchema("mysql-migration-test")
        yield* sql`UPDATE generalist_sql_migrations SET name = 'wrong' WHERE migration_id = 1`

        expect(yield* applyRunSchema("mysql-migration-test").pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
        yield* resetSchema
      }),
    )
  })

  for (const [label, update, expected] of [
    ["dirty", "UPDATE generalist_schema_meta SET dirty = 1 WHERE id = 1", SchemaDirty],
    ["checksum", "UPDATE generalist_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
    ["old", `UPDATE generalist_schema_meta SET version = ${SCHEMA_VERSION - 1} WHERE id = 1`, SchemaVersionUnsupported],
    [
      "future",
      `UPDATE generalist_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`,
      SchemaVersionUnsupported,
    ],
  ] as const) {
    layer(client, { excludeTestServices: true })(`rejects a ${label} schema`, (suite) => {
      suite.effect(`rejects a ${label} schema`, () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* resetSchema
          yield* applyRunSchema("mysql-migration-test")
          yield* sql.unsafe(update)
          expect(yield* applyRunSchema("mysql-migration-test").pipe(Effect.flip)).toBeInstanceOf(expected)
          yield* resetSchema
        }),
      )
    })
  }
})
