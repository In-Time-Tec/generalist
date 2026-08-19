import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "../../src/runtime/sql/errors.js"
import { layer as sqliteClientLayer } from "../../src/runtime/sql/bun-client.js"
import { migrate } from "../../src/runtime/sql/migrate.js"
import { SCHEMA_STATEMENTS, SCHEMA_VERSION, V8_SCHEMA_CHECKSUM, schemaChecksum } from "../../src/runtime/sql/schema.js"
import { tempDbPath } from "./sqlite-helpers.js"

const apply = (filename: string) =>
  Effect.scoped(
    Effect.flatMap(Layer.build(sqliteClientLayer({ filename })), (context) =>
      migrate(filename).pipe(Effect.provideContext(context)),
    ),
  )

const inspect = (filename: string) => {
  const db = new Database(filename)
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'baton_*' ORDER BY name",
    )
    .all()
    .map((row) => row.name)
  const runColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(baton_runs)")
    .all()
    .map((row) => row.name)
  const operationColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(baton_run_operations)")
    .all()
    .map((row) => row.name)
  const meta = db
    .query<{ version: number; checksum: string }, []>("SELECT version, checksum FROM baton_schema_meta WHERE id = 1")
    .get()
  const migrations = db
    .query<{ migration_id: number }, []>("SELECT migration_id FROM baton_sql_migrations ORDER BY migration_id")
    .all()
  db.close()
  expect(meta).toEqual({ version: SCHEMA_VERSION, checksum: schemaChecksum() })
  expect(migrations.map(({ migration_id }) => migration_id)).toEqual([1, 2])
  expect(runColumns).toEqual([
    "run_id",
    "status",
    "address",
    "session_id",
    "message_id",
    "message_json",
    "message_digest",
    "idempotency_key",
    "executable_ref_json",
    "executable_manifest_json",
    "root_run_id",
    "depth",
    "max_depth",
    "max_subagents",
    "parent_run_id",
    "invocation_id",
    "active_wait_id",
    "attempt",
    "attempt_fence",
    "last_sequence",
    "cancellation_requested",
    "cancel_reason",
    "terminal_event_id",
    "accepted_sequence",
    "responded_wait_ids_json",
    "driver_checkpoint_json",
    "suspension_json",
    "continuation_json",
    "pending_outcome_json",
    "owner_worker_id",
    "created_at",
    "updated_at",
  ])
  expect(operationColumns).toContain("resolution_idempotency_key")
  expect(operationColumns).toContain("resolution_json")
  expect(tables).toEqual([
    "baton_agent_names",
    "baton_executable_registrations",
    "baton_external_child_placements",
    "baton_fan_out_members",
    "baton_fan_outs",
    "baton_lanes",
    "baton_messages",
    "baton_program_operations",
    "baton_program_runs",
    "baton_run_events",
    "baton_run_links",
    "baton_run_operations",
    "baton_run_registrations",
    "baton_run_steering",
    "baton_run_waits",
    "baton_runs",
    "baton_schema_meta",
    "baton_session_entries",
    "baton_sessions",
    "baton_sql_migrations",
    "baton_tree_event_index",
    "baton_tree_roots",
  ])
}

it.live("creates the current SQLite baseline and applies idempotently", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-baseline")
    yield* apply(filename)
    yield* apply(filename)
    inspect(filename)
  }),
)

it.live("upgrades a version 8 database and remains compatible after restart", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-v8-upgrade")
    const db = new Database(filename)
    db.run(`CREATE TABLE baton_sql_migrations (
      migration_id integer PRIMARY KEY NOT NULL,
      created_at datetime NOT NULL DEFAULT current_timestamp,
      name VARCHAR(255) NOT NULL
    )`)
    for (const statement of SCHEMA_STATEMENTS) {
      if (!statement.includes("baton_external_child_placements")) db.run(statement)
    }
    db.run("INSERT INTO baton_sql_migrations (migration_id, name) VALUES (1, 'baton_runtime')")
    db.run("INSERT INTO baton_schema_meta (id, version, checksum, dirty, applied_at) VALUES (1, 8, ?, 0, ?)", [
      V8_SCHEMA_CHECKSUM,
      "2026-08-18T00:00:00.000Z",
    ])
    db.close()

    yield* apply(filename)
    yield* apply(filename)
    inspect(filename)
  }),
)

it.live("recovers an empty migration table and ignores unrelated lookalike tables", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-interrupted-bootstrap")
    const db = new Database(filename)
    db.run(`CREATE TABLE baton_sql_migrations (
      migration_id integer PRIMARY KEY NOT NULL,
      created_at datetime NOT NULL DEFAULT current_timestamp,
      name VARCHAR(255) NOT NULL
    )`)
    db.run("CREATE TABLE batonXunrelated (id INTEGER PRIMARY KEY)")
    db.close()

    yield* apply(filename)
    inspect(filename)
  }),
)

it.live("rejects a partial application schema without metadata", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-partial-bootstrap")
    const db = new Database(filename)
    db.run("CREATE TABLE baton_runs (run_id TEXT PRIMARY KEY)")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)

    const inspectDb = new Database(filename)
    const tables = inspectDb
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'baton_*' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    inspectDb.close()
    expect(tables).toEqual(["baton_runs"])
  }),
)

it.live("rolls back a failed baseline and reports a typed migration failure", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-failed-bootstrap")
    const db = new Database(filename)
    db.run("CREATE TABLE baton_sql_migrations (migration_id INTEGER PRIMARY KEY)")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)

    const inspectDb = new Database(filename)
    const tables = inspectDb
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'baton_*' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    inspectDb.close()
    expect(tables).toEqual(["baton_sql_migrations"])
  }),
)

it.live.each([
  ["dirty", "UPDATE baton_schema_meta SET dirty = 1 WHERE id = 1", SchemaDirty],
  ["checksum", "UPDATE baton_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
  [
    "legacy semantic-event contract",
    `UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION - 1} WHERE id = 1`,
    SchemaChecksumMismatch,
  ],
  ["future", `UPDATE baton_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`, SchemaVersionUnsupported],
] as const)("rejects a %s SQLite schema", ([, update, expected]) =>
  Effect.gen(function* () {
    const filename = tempDbPath(`sqlite-reject-${expected.name}`)
    yield* apply(filename)
    const db = new Database(filename)
    db.run(update)
    db.close()
    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(expected)
  }),
)
