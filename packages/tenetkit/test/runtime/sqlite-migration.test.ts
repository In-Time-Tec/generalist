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
import { SCHEMA_VERSION, schemaChecksum } from "../../src/runtime/sql/schema.js"
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
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'tenetkit_*' ORDER BY name",
    )
    .all()
    .map((row) => row.name)
  const runColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(tenetkit_runs)")
    .all()
    .map((row) => row.name)
  const operationColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(tenetkit_run_operations)")
    .all()
    .map((row) => row.name)
  const meta = db
    .query<{ version: number; checksum: string }, []>("SELECT version, checksum FROM tenetkit_schema_meta WHERE id = 1")
    .get()
  const migrations = db
    .query<{ migration_id: number }, []>("SELECT migration_id FROM tenetkit_sql_migrations ORDER BY migration_id")
    .all()
  db.close()
  expect(meta).toEqual({ version: SCHEMA_VERSION, checksum: schemaChecksum() })
  expect(migrations.map(({ migration_id }) => migration_id)).toEqual([1])
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
    "tenetkit_agent_names",
    "tenetkit_executable_registrations",
    "tenetkit_external_child_placements",
    "tenetkit_external_roots",
    "tenetkit_fan_out_members",
    "tenetkit_fan_outs",
    "tenetkit_lanes",
    "tenetkit_messages",
    "tenetkit_program_operations",
    "tenetkit_program_runs",
    "tenetkit_run_events",
    "tenetkit_run_links",
    "tenetkit_run_operations",
    "tenetkit_run_registrations",
    "tenetkit_run_steering",
    "tenetkit_run_waits",
    "tenetkit_runs",
    "tenetkit_schema_meta",
    "tenetkit_session_entries",
    "tenetkit_sessions",
    "tenetkit_sql_migrations",
    "tenetkit_tree_event_index",
    "tenetkit_tree_roots",
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

it.live("rejects a baseline whose migration identity was changed", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-identity")
    yield* apply(filename)
    const db = new Database(filename)
    db.run("UPDATE tenetkit_sql_migrations SET name = 'wrong' WHERE migration_id = 1")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
  }),
)

it.live("recovers an empty migration table and ignores unrelated lookalike tables", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-interrupted-bootstrap")
    const db = new Database(filename)
    db.run(`CREATE TABLE tenetkit_sql_migrations (
      migration_id integer PRIMARY KEY NOT NULL,
      created_at datetime NOT NULL DEFAULT current_timestamp,
      name VARCHAR(255) NOT NULL
    )`)
    db.run("CREATE TABLE tenetkitXunrelated (id INTEGER PRIMARY KEY)")
    db.close()

    yield* apply(filename)
    inspect(filename)
  }),
)

it.live("rejects a partial application schema without metadata", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-partial-bootstrap")
    const db = new Database(filename)
    db.run("CREATE TABLE tenetkit_runs (run_id TEXT PRIMARY KEY)")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)

    const inspectDb = new Database(filename)
    const tables = inspectDb
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'tenetkit_*' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    inspectDb.close()
    expect(tables).toEqual(["tenetkit_runs"])
  }),
)

it.live("rolls back a failed baseline and reports a typed migration failure", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-failed-bootstrap")
    const db = new Database(filename)
    db.run("CREATE TABLE tenetkit_sql_migrations (migration_id INTEGER PRIMARY KEY)")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)

    const inspectDb = new Database(filename)
    const tables = inspectDb
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'tenetkit_*' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    inspectDb.close()
    expect(tables).toEqual(["tenetkit_sql_migrations"])
  }),
)

it.live.each([
  ["dirty", "UPDATE tenetkit_schema_meta SET dirty = 1 WHERE id = 1", SchemaDirty],
  ["checksum", "UPDATE tenetkit_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
  ["future", `UPDATE tenetkit_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`, SchemaVersionUnsupported],
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
