import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SchemaMigrationFailed } from "../../src/sql/errors.js"
import { MysqlRunSchema } from "../../src/sql/mysql/run-schema.js"
import {
  EXECUTABLE_MIGRATION_STATEMENTS,
  FAN_OUT_MIGRATION_STATEMENTS,
  LEGACY_MIGRATION_STATEMENTS,
  OPERATION_RESOLUTION_MIGRATION_STATEMENTS,
  SCHEMA_VERSION,
  TREE_MIGRATION_STATEMENTS,
  executableSchemaChecksum,
  schemaChecksum,
  treeSchemaChecksum,
} from "../../src/sql/mysql/schema.js"
import { mysqlAvailable, mysqlClient, mysqlUrl } from "./helpers.js"

const describeMysql = mysqlAvailable ? describe.sequential : describe.skip
const url = mysqlUrl!
const legacyMessage = "cannot migrate nonempty baton_runs to executable manifests"
const client = mysqlClient(url)

const tables = [
  "baton_tree_event_index",
  "baton_tree_roots",
  "baton_fan_out_members",
  "baton_fan_outs",
  "baton_run_steering",
  "baton_run_links",
  "baton_run_waits",
  "baton_run_operations",
  "baton_run_events",
  "baton_runs",
  "baton_lanes",
  "baton_runtime_locks",
  "baton_sql_migrations",
  "baton_schema_meta",
] as const

const resetSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=0")
  for (const table of tables) yield* sql.unsafe(`DROP TABLE IF EXISTS ${table}`)
  yield* sql.unsafe("SET FOREIGN_KEY_CHECKS=1")
})

const makeV4Fixture = (populated: boolean) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* resetSchema
    for (const statement of [
      ...LEGACY_MIGRATION_STATEMENTS,
      ...FAN_OUT_MIGRATION_STATEMENTS,
      ...TREE_MIGRATION_STATEMENTS,
    ]) {
      yield* sql.unsafe(statement)
    }
    yield* sql.unsafe(`INSERT INTO baton_sql_migrations (migration_id, name, applied_at) VALUES
      (1, 'baton_runtime_mysql_kernel', '1970-01-01T00:00:00.000Z'),
      (2, 'baton_runtime_mysql_steering', '1970-01-01T00:00:00.000Z'),
      (3, 'baton_runtime_mysql_fan_out', '1970-01-01T00:00:00.000Z'),
      (4, 'baton_runtime_mysql_tree_projection', '1970-01-01T00:00:00.000Z')`)
    yield* sql`
      INSERT INTO baton_schema_meta (id, version, checksum, dirty, applied_at)
      VALUES (1, 4, ${treeSchemaChecksum()}, 0, '1970-01-01T00:00:00.000Z')
    `
    if (populated) {
      yield* sql.unsafe(`INSERT INTO baton_runs (
        run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
        agent_json, root_run_id, accepted_sequence, responded_wait_ids_json, created_at, updated_at
      ) VALUES (
        'legacy-run', 'queued', 'agent', 'session', 'message', '{}', 'digest', 'key',
        '{}', 'legacy-run', 0, '[]', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
      )`)
    }
    const columns = yield* sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'baton_runs'
    `
    const meta = yield* sql<{ version: number; checksum: string }>`
      SELECT version, checksum FROM baton_schema_meta WHERE id = 1
    `
    expect({ version: Number(meta[0]?.version), checksum: meta[0]?.checksum }).toEqual({
      version: 4,
      checksum: treeSchemaChecksum(),
    })
    expect(columns.map((row) => row.column_name)).toContain("agent_json")
    expect(columns.map((row) => row.column_name)).not.toContain("executable_ref_json")
    expect(columns.map((row) => row.column_name)).not.toContain("executable_manifest_json")
  })

const makeV5Fixture = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* makeV4Fixture(false)
  for (const statement of EXECUTABLE_MIGRATION_STATEMENTS) yield* sql.unsafe(statement)
  yield* sql.unsafe(`INSERT INTO baton_sql_migrations (migration_id, name, applied_at)
    VALUES (5, 'baton_runtime_mysql_executable_manifest', '1970-01-01T00:00:00.000Z')`)
  yield* sql`
    UPDATE baton_schema_meta
    SET version = 5, checksum = ${executableSchemaChecksum()}, dirty = 0
    WHERE id = 1
  `
})

const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const columns = yield* sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'baton_runs'
  `
  const meta = yield* sql<{ version: number }>`SELECT version FROM baton_schema_meta WHERE id = 1`
  const operationColumns = yield* sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'baton_run_operations'
  `
  const migrations = yield* sql<{ migration_id: number }>`
    SELECT migration_id FROM baton_sql_migrations ORDER BY migration_id
  `
  const checksum = yield* sql<{ checksum: string }>`SELECT checksum FROM baton_schema_meta WHERE id = 1`
  const pinTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE '%pin%'
  `
  expect(Number(meta[0]?.version)).toBe(SCHEMA_VERSION)
  expect(columns.map((row) => row.column_name)).toContain("executable_ref_json")
  expect(columns.map((row) => row.column_name)).toContain("executable_manifest_json")
  expect(columns.map((row) => row.column_name)).not.toContain("agent_json")
  expect(operationColumns.map((row) => row.column_name)).toContain("resolution_idempotency_key")
  expect(operationColumns.map((row) => row.column_name)).toContain("resolution_json")
  expect(migrations.map((row) => Number(row.migration_id))).toEqual([1, 2, 3, 4, 5, 6])
  expect(checksum[0]?.checksum).toBe(schemaChecksum())
  expect(pinTables).toEqual([])
})

describeMysql("mysql schema migration", () => {
  it.live("migrates an empty genuine v4 schema to v5", () =>
    Effect.gen(function* () {
      yield* makeV4Fixture(false)
      yield* MysqlRunSchema.apply("mysql-migration-test")
      yield* inspectSchema
    }).pipe(Effect.provide(client), Effect.scoped),
  )

  it.live("rejects a populated genuine v4 schema with a typed failure", () =>
    Effect.gen(function* () {
      yield* makeV4Fixture(true)
      const failure = yield* MysqlRunSchema.apply("mysql-migration-test").pipe(Effect.flip)
      expect(failure).toBeInstanceOf(SchemaMigrationFailed)
      expect(failure.message).toBe(legacyMessage)
    }).pipe(Effect.provide(client), Effect.scoped),
  )

  it.live("resumes a partially applied v5 migration", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* makeV4Fixture(false)
      yield* sql.unsafe(EXECUTABLE_MIGRATION_STATEMENTS[0]!)
      yield* MysqlRunSchema.apply("mysql-migration-test")
      yield* inspectSchema
    }).pipe(Effect.provide(client), Effect.scoped),
  )

  it.live("resumes a partially applied v6 migration", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* makeV5Fixture
      yield* sql.unsafe(OPERATION_RESOLUTION_MIGRATION_STATEMENTS[0]!)
      yield* MysqlRunSchema.apply("mysql-migration-test")
      yield* inspectSchema
    }).pipe(Effect.provide(client), Effect.scoped),
  )

  it.live("rejects an incompatible partial migration with a typed failure", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* makeV4Fixture(false)
      yield* sql.unsafe("ALTER TABLE baton_runs ADD COLUMN executable_ref_json TEXT")
      const failure = yield* MysqlRunSchema.apply("mysql-migration-test").pipe(Effect.flip)
      expect(failure).toBeInstanceOf(SchemaMigrationFailed)
      expect(failure.message).toContain("incompatible partial MySQL migration 5 state")
      const migrations = yield* sql<{ migration_id: number }>`
        SELECT migration_id FROM baton_sql_migrations WHERE migration_id = 5
      `
      expect(migrations).toEqual([])
    }).pipe(Effect.provide(client), Effect.scoped),
  )

  it.live("creates a fresh v6 schema", () =>
    Effect.gen(function* () {
      yield* resetSchema
      yield* MysqlRunSchema.apply("mysql-migration-test")
      yield* inspectSchema
    }).pipe(Effect.provide(client), Effect.scoped),
  )
})
