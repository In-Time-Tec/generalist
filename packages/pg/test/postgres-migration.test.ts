import { describe, expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "tenetkit/runtime/driver/sql/errors"
import { RunSchema } from "../src/postgres/run-schema.js"
import { SCHEMA_VERSION, V7_SCHEMA_CHECKSUM, V7_SCHEMA_STATEMENTS, schemaChecksum } from "../src/postgres/schema.js"
import { postgresAvailable, postgresDatabase } from "./helpers.js"

const describePostgres = postgresAvailable ? describe.sequential : describe.skip
const database = postgresDatabase("migration")
const client = database.client

const resetSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(`DROP TABLE IF EXISTS
    baton_session_entries, baton_sessions,
    baton_run_registrations, baton_executable_registrations, baton_program_operations, baton_program_runs,
    baton_tree_event_index, baton_tree_roots, baton_fan_out_members, baton_fan_outs, baton_run_steering,
    baton_messages, baton_agent_names,
    baton_external_child_placements,
    baton_run_links, baton_run_waits, baton_run_operations, baton_run_events, baton_runs, baton_lanes,
    baton_runtime_locks, baton_sql_migrations, baton_schema_meta CASCADE`)
})

const bootstrapV7 = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const statement of V7_SCHEMA_STATEMENTS) yield* sql.unsafe(statement)
  yield* sql`INSERT INTO baton_schema_meta (id, version, checksum, dirty, applied_at)
    VALUES (1, 7, ${V7_SCHEMA_CHECKSUM}, FALSE, NOW())`
  yield* sql`CREATE TABLE baton_sql_migrations (
    migration_id INTEGER PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    name TEXT NOT NULL
  )`
  yield* sql`INSERT INTO baton_sql_migrations (migration_id, name) VALUES (1, 'baton_runtime')`
})

const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const columns = yield* sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'baton_runs'
  `
  const sessionTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name IN ('baton_sessions', 'baton_session_entries')
    ORDER BY table_name
  `
  const placementTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'baton_external_child_placements'
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
  expect(migrations.map(({ migration_id }) => Number(migration_id))).toEqual([1, 2])
  expect(columns.map((row) => row.column_name)).toEqual(
    expect.arrayContaining([
      "executable_ref_json",
      "executable_manifest_json",
      "continuation_json",
      "pending_outcome_json",
    ]),
  )
  expect(columns.map((row) => row.column_name)).not.toContain("transcript_json")
  expect(sessionTables.map((row) => row.table_name)).toEqual(["baton_session_entries", "baton_sessions"])
  expect(placementTables.map((row) => row.table_name)).toEqual(["baton_external_child_placements"])
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

  layer(database.provisionEmpty(client), { excludeTestServices: true })("upgrades version 7", (suite) => {
    suite.effect("preserves data while adding empty external placements", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* bootstrapV7
        yield* sql`INSERT INTO baton_lanes (address, session_id, accepted_sequence, queue_json)
          VALUES ('agent', 'session:v7', 1, '[]')`

        yield* RunSchema.apply("postgres-migration-test")
        yield* RunSchema.apply("postgres-migration-test")
        yield* inspectSchema

        expect(yield* sql<{ session_id: string }>`SELECT session_id FROM baton_lanes`).toEqual([
          { session_id: "session:v7" },
        ])
        expect(
          Number(
            (yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM baton_external_child_placements`)[0]?.count,
          ),
        ).toBe(0)
      }),
    )

    suite.effect("rejects a changed version 7 migration identity before mutation", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* bootstrapV7
        yield* sql`UPDATE baton_sql_migrations SET name = 'wrong' WHERE migration_id = 1`

        expect(yield* RunSchema.apply("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(
          SchemaMigrationFailed,
        )
        expect(yield* sql`SELECT version, checksum, dirty FROM baton_schema_meta WHERE id = 1`).toEqual([
          { version: 7, checksum: V7_SCHEMA_CHECKSUM, dirty: false },
        ])
        expect(
          yield* sql`SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = 'baton_external_child_placements'`,
        ).toEqual([])
      }),
    )

    suite.effect("rolls back a conflicting version 7 placement migration", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* resetSchema
        yield* bootstrapV7
        yield* sql`CREATE TABLE baton_external_child_placements (placement_id TEXT PRIMARY KEY)`

        expect(yield* RunSchema.apply("postgres-migration-test").pipe(Effect.flip)).toBeInstanceOf(
          SchemaMigrationFailed,
        )
        expect(yield* sql`SELECT version, checksum, dirty FROM baton_schema_meta WHERE id = 1`).toEqual([
          { version: 7, checksum: V7_SCHEMA_CHECKSUM, dirty: false },
        ])
        expect(yield* sql`SELECT migration_id FROM baton_sql_migrations WHERE migration_id = 2`).toEqual([])
      }),
    )
  })

  for (const [label, update, expected] of [
    ["dirty", "UPDATE baton_schema_meta SET dirty = TRUE WHERE id = 1", SchemaDirty],
    ["checksum", "UPDATE baton_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
    [
      "legacy semantic-event contract",
      `UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION - 1} WHERE id = 1`,
      SchemaChecksumMismatch,
    ],
    ["future", `UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`, SchemaVersionUnsupported],
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
