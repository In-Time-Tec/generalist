import { describe, expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "generalist/runtime/sql-driver"
import { apply as applyRunSchema } from "../../src/pg/run-schema.js"
import { SCHEMA_STATEMENTS, SCHEMA_VERSION, schemaChecksum } from "../../src/pg/schema.js"
import { inspectLogicalSqlSchema } from "../../../generalist/test/runtime/sql/schema-conformance.js"
import { postgresAvailable, postgresDatabase } from "./database.js"

const describePostgres = postgresAvailable ? describe : describe.skip
const database = postgresDatabase("migration")
const client = database.client

const resetSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(`DROP TABLE IF EXISTS
    generalist_session_entries, generalist_sessions,
    generalist_run_registrations, generalist_executable_registrations, generalist_program_operations, generalist_program_runs,
    generalist_tree_event_index, generalist_tree_roots, generalist_fan_out_members, generalist_fan_outs, generalist_run_steering,
    generalist_messages, generalist_agent_names,
    generalist_external_child_placements,
    generalist_run_links, generalist_run_waits, generalist_run_operations, generalist_run_acknowledgements,
    generalist_run_events, generalist_runs, generalist_host_sessions, generalist_lanes, generalist_permission_rules,
    generalist_runtime_locks, generalist_sql_migrations, generalist_schema_meta CASCADE`)
})

const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const columns = yield* sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'generalist_runs'
  `
  const sessionTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name IN ('generalist_sessions', 'generalist_session_entries')
    ORDER BY table_name
  `
  const placementTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'generalist_external_child_placements'
  `
  const acknowledgementTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'generalist_run_acknowledgements'
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
  expect(migrations.map(({ migration_id }) => migration_id)).toEqual([1])
  expect(columns.map((row) => row.column_name)).toEqual(
    expect.arrayContaining([
      "executable_ref_json",
      "executable_manifest_json",
      "continuation_json",
      "pending_outcome_json",
      "last_turn_completed_sequence",
    ]),
  )
  expect(columns.map((row) => row.column_name)).not.toContain("transcript_json")
  expect(sessionTables.map((row) => row.table_name)).toEqual(["generalist_session_entries", "generalist_sessions"])
  expect(placementTables.map((row) => row.table_name)).toEqual(["generalist_external_child_placements"])
  expect(acknowledgementTables.map((row) => row.table_name)).toEqual(["generalist_run_acknowledgements"])
  expect(yield* inspectLogicalSqlSchema).toEqual([])
})

describePostgres("postgres schema baseline", () => {
  layer(database.provisionEmpty(client), { excludeTestServices: true })(
    "creates the current baseline and applies idempotently",
    (suite) => {
      suite.effect("creates the current baseline and applies idempotently", () =>
        Effect.gen(function* () {
          yield* resetSchema
          yield* applyRunSchema("postgres-migration-test")
          yield* applyRunSchema("postgres-migration-test")
          yield* inspectSchema
        }),
      )
    },
  )

  layer(database.provisionEmpty(client), { excludeTestServices: true })("refuses a foreign schema", (suite) => {
    suite.effect("refuses to create the baseline over unrelated generalist tables", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* sql`CREATE TABLE generalist_runs (run_id TEXT PRIMARY KEY)`

        expect(yield* applyRunSchema("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
        expect(
          yield* sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'generalist_schema_meta'`,
        ).toEqual([])
      }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie))),
    )
  })

  layer(database.provisionEmpty(client), { excludeTestServices: true })("rolls back partial physical DDL", (suite) => {
    suite.effect("rolls transactional physical DDL back when bootstrap fails", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* Effect.exit(
          sql.withTransaction(
            Effect.gen(function* () {
              for (const statement of SCHEMA_STATEMENTS.slice(0, 3)) yield* sql.unsafe(statement)
              return yield* Effect.fail("forced PostgreSQL DDL failure")
            }),
          ),
        )
        expect(
          yield* sql<{ table_name: string }>`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_name LIKE 'generalist_%'
          `,
        ).toEqual([])
      }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie))),
    )
  })

  layer(database.provisionEmpty(client), { excludeTestServices: true })("verifies migration identity", (suite) => {
    suite.effect("rejects a changed migration identity", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* applyRunSchema("postgres-migration-test")
        yield* sql`UPDATE generalist_sql_migrations SET name = 'wrong' WHERE migration_id = 1`

        expect(yield* applyRunSchema("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
      }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie))),
    )
  })

  for (const [label, update, expected] of [
    ["dirty", "UPDATE generalist_schema_meta SET dirty = TRUE WHERE id = 1", SchemaDirty],
    ["checksum", "UPDATE generalist_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
    ["old", `UPDATE generalist_schema_meta SET version = ${SCHEMA_VERSION - 1} WHERE id = 1`, SchemaVersionUnsupported],
    [
      "future",
      `UPDATE generalist_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`,
      SchemaVersionUnsupported,
    ],
  ] as const) {
    layer(database.provisionEmpty(client), { excludeTestServices: true })(`rejects a ${label} schema`, (suite) => {
      suite.effect(`rejects a ${label} schema`, () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* resetSchema
          yield* applyRunSchema("postgres-migration-test")
          yield* sql.unsafe(update)
          expect(yield* applyRunSchema("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(expected)
        }).pipe(Effect.ensuring(resetSchema.pipe(Effect.orDie))),
      )
    })
  }
})
