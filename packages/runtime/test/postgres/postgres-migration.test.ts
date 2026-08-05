import { describe, expect, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { PgClient } from "@effect/sql-pg"
import { SchemaChecksumMismatch, SchemaDirty, SchemaVersionUnsupported } from "../../src/sql/errors.js"
import { RunSchema } from "../../src/sql/postgres/run-schema.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/sql/postgres/schema.js"
import { postgresAvailable, postgresUrl } from "./helpers.js"

const describePostgres = postgresAvailable ? describe.sequential : describe.skip
const client = PgClient.layer({ url: Redacted.make(postgresUrl!) })

const resetSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(`DROP TABLE IF EXISTS
    baton_run_registrations, baton_executable_registrations, baton_program_operations, baton_program_runs,
    baton_tree_event_index, baton_tree_roots, baton_fan_out_members, baton_fan_outs, baton_run_steering,
    baton_run_links, baton_run_waits, baton_run_operations, baton_run_events, baton_runs, baton_lanes,
    baton_runtime_locks, baton_sql_migrations, baton_schema_meta CASCADE`)
})

const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const columns = yield* sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'baton_runs'
  `
  const meta = yield* sql<{
    version: number
    checksum: string
  }>`SELECT version, checksum FROM baton_schema_meta WHERE id = 1`
  const migrations = yield* sql<{ migration_id: number }>`
    SELECT migration_id FROM baton_sql_migrations ORDER BY migration_id
  `
  expect({ version: Number(meta[0]?.version), checksum: meta[0]?.checksum }).toEqual({
    version: SCHEMA_VERSION,
    checksum: schemaChecksum(),
  })
  expect(migrations.map(({ migration_id }) => Number(migration_id))).toEqual([1])
  expect(columns.map((row) => row.column_name)).toEqual(
    expect.arrayContaining([
      "executable_ref_json",
      "executable_manifest_json",
      "continuation_json",
      "pending_outcome_json",
    ]),
  )
})

describePostgres("postgres schema baseline", () => {
  it.live("creates the current v1 baseline and applies idempotently", () =>
    Effect.gen(function* () {
      yield* resetSchema
      yield* RunSchema.apply("postgres-migration-test")
      yield* RunSchema.apply("postgres-migration-test")
      yield* inspectSchema
    }).pipe(Effect.provide(client), Effect.scoped),
  )

  it.live.each([
    ["dirty", "UPDATE baton_schema_meta SET dirty = TRUE WHERE id = 1", SchemaDirty],
    ["checksum", "UPDATE baton_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
    ["future", `UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`, SchemaVersionUnsupported],
  ] as const)("rejects a %s schema", ([, update, expected]) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* resetSchema
      yield* RunSchema.apply("postgres-migration-test")
      yield* sql.unsafe(update)
      expect(yield* RunSchema.apply("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(expected)
    }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie)), Effect.provide(client), Effect.scoped),
  )
})
