import { describe, expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "tenetkit/runtime/driver/sql/errors"
import { RunSchema } from "../../src/postgres/run-schema.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../src/postgres/schema.js"
import { postgresAvailable, postgresDatabase } from "./database.js"

const describePostgres = postgresAvailable ? describe : describe.skip
const database = postgresDatabase("migration")
const client = database.client

const resetSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(`DROP TABLE IF EXISTS
    tenetkit_session_entries, tenetkit_sessions,
    tenetkit_run_registrations, tenetkit_executable_registrations, tenetkit_program_operations, tenetkit_program_runs,
    tenetkit_tree_event_index, tenetkit_tree_roots, tenetkit_fan_out_members, tenetkit_fan_outs, tenetkit_run_steering,
    tenetkit_messages, tenetkit_agent_names,
    tenetkit_external_child_placements,
    tenetkit_run_links, tenetkit_run_waits, tenetkit_run_operations, tenetkit_run_events, tenetkit_runs, tenetkit_lanes,
    tenetkit_runtime_locks, tenetkit_sql_migrations, tenetkit_schema_meta CASCADE`)
})

const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const columns = yield* sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'tenetkit_runs'
  `
  const sessionTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name IN ('tenetkit_sessions', 'tenetkit_session_entries')
    ORDER BY table_name
  `
  const placementTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'tenetkit_external_child_placements'
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
  expect(migrations.map(({ migration_id }) => migration_id)).toEqual([1])
  expect(columns.map((row) => row.column_name)).toEqual(
    expect.arrayContaining([
      "executable_ref_json",
      "executable_manifest_json",
      "continuation_json",
      "pending_outcome_json",
    ]),
  )
  expect(columns.map((row) => row.column_name)).not.toContain("transcript_json")
  expect(sessionTables.map((row) => row.table_name)).toEqual(["tenetkit_session_entries", "tenetkit_sessions"])
  expect(placementTables.map((row) => row.table_name)).toEqual(["tenetkit_external_child_placements"])
})

describePostgres("postgres schema baseline", () => {
  layer(database.provisionEmpty(client), { excludeTestServices: true })(
    "creates the current baseline and applies idempotently",
    (suite) => {
      suite.effect("creates the current baseline and applies idempotently", () =>
        Effect.gen(function* () {
          yield* resetSchema
          yield* RunSchema.apply("postgres-migration-test")
          yield* RunSchema.apply("postgres-migration-test")
          yield* inspectSchema
        }),
      )
    },
  )

  layer(database.provisionEmpty(client), { excludeTestServices: true })("refuses a foreign schema", (suite) => {
    suite.effect("refuses to create the baseline over unrelated tenetkit tables", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* sql`CREATE TABLE tenetkit_runs (run_id TEXT PRIMARY KEY)`

        expect(yield* RunSchema.apply("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(
          SchemaMigrationFailed,
        )
        expect(
          yield* sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'tenetkit_schema_meta'`,
        ).toEqual([])
      }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie))),
    )
  })

  layer(database.provisionEmpty(client), { excludeTestServices: true })("verifies migration identity", (suite) => {
    suite.effect("rejects a changed migration identity", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* RunSchema.apply("postgres-migration-test")
        yield* sql`UPDATE tenetkit_sql_migrations SET name = 'wrong' WHERE migration_id = 1`

        expect(yield* RunSchema.apply("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(
          SchemaMigrationFailed,
        )
      }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie))),
    )
  })

  for (const [label, update, expected] of [
    ["dirty", "UPDATE tenetkit_schema_meta SET dirty = TRUE WHERE id = 1", SchemaDirty],
    ["checksum", "UPDATE tenetkit_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
    ["old", `UPDATE tenetkit_schema_meta SET version = ${SCHEMA_VERSION - 1} WHERE id = 1`, SchemaVersionUnsupported],
    [
      "future",
      `UPDATE tenetkit_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`,
      SchemaVersionUnsupported,
    ],
  ] as const) {
    layer(database.provisionEmpty(client), { excludeTestServices: true })(`rejects a ${label} schema`, (suite) => {
      suite.effect(`rejects a ${label} schema`, () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* resetSchema
          yield* RunSchema.apply("postgres-migration-test")
          yield* sql.unsafe(update)
          expect(yield* RunSchema.apply("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(expected)
        }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie))),
      )
    })
  }
})
