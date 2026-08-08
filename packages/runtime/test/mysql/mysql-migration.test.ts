import { describe, expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SchemaChecksumMismatch, SchemaDirty, SchemaVersionUnsupported } from "../../src/sql/errors.js"
import { MysqlRunSchema } from "../../src/sql/mysql/run-schema.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/sql/mysql/schema.js"
import { mysqlAvailable, mysqlClient, mysqlUrl } from "./helpers.js"

const describeMysql = mysqlAvailable ? describe.sequential : describe.skip
const client = mysqlClient(mysqlUrl!)
const tables = [
  "baton_run_registrations",
  "baton_executable_registrations",
  "baton_program_operations",
  "baton_program_runs",
  "baton_tree_event_index",
  "baton_tree_roots",
  "baton_fan_out_members",
  "baton_fan_outs",
  "baton_run_steering",
  "baton_run_links",
  "baton_run_waits",
  "baton_run_operations",
  "baton_run_acks",
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

const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const columns = yield* sql<{ column_name: string }>`
    SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'baton_runs'
  `
  const meta = yield* sql<{
    version: number
    checksum: string
  }>`SELECT version, checksum FROM baton_schema_meta WHERE id = 1`
  const migrations = yield* sql<{ migration_id: number }>`SELECT migration_id FROM baton_sql_migrations`
  expect({ version: Number(meta[0]?.version), checksum: meta[0]?.checksum }).toEqual({
    version: SCHEMA_VERSION,
    checksum: schemaChecksum(),
  })
  expect(columns.map((row) => row.column_name)).toEqual(
    expect.arrayContaining([
      "executable_ref_json",
      "executable_manifest_json",
      "continuation_json",
      "pending_outcome_json",
    ]),
  )
  expect(migrations.map((row) => Number(row.migration_id))).toEqual([1])
})

describeMysql("mysql schema baseline", () => {
  layer(client, { excludeTestServices: true })("creates the current v1 baseline and applies idempotently", (suite) => {
    suite.effect("creates the current v1 baseline and applies idempotently", () =>
      Effect.gen(function* () {
        yield* resetSchema
        yield* MysqlRunSchema.apply("mysql-migration-test")
        yield* MysqlRunSchema.apply("mysql-migration-test")
        yield* inspectSchema
      }),
    )
  })

  for (const [label, update, expected] of [
    ["dirty", "UPDATE baton_schema_meta SET dirty = 1 WHERE id = 1", SchemaDirty],
    ["checksum", "UPDATE baton_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
    ["future", `UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`, SchemaVersionUnsupported],
  ] as const) {
    layer(client, { excludeTestServices: true })(`rejects a ${label} schema`, (suite) => {
      suite.effect(`rejects a ${label} schema`, () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* resetSchema
          yield* MysqlRunSchema.apply("mysql-migration-test")
          yield* sql.unsafe(update)
          expect(yield* MysqlRunSchema.apply("mysql-migration-test").pipe(Effect.flip)).toBeInstanceOf(expected)
          yield* resetSchema
        }),
      )
    })
  }
})
