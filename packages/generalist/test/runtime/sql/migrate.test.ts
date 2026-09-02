import { Database } from "bun:sqlite"
import { layer } from "@effect/sql-sqlite-bun/SqliteClient"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "../../../src/runtime/sql/errors.js"
import { apply as applySchema } from "../../../src/runtime/sql/migrate.js"
import { SCHEMA_VERSION, schemaChecksum } from "../../../src/runtime/sql/codec/schema.js"
import { tempDbPath } from "./scenario.js"
import { inspectLogicalSqlSchema } from "./schema-conformance.js"

const apply = (filename: string) =>
  Effect.scoped(
    Effect.flatMap(Layer.build(layer({ filename })), (context) =>
      applySchema(filename).pipe(Effect.provideContext(context)),
    ),
  )

const inspectLogicalSchema = (filename: string) =>
  Effect.scoped(
    Effect.flatMap(Layer.build(layer({ filename })), (context) =>
      inspectLogicalSqlSchema.pipe(Effect.provideContext(context)),
    ),
  )

const inspect = (filename: string) => {
  const db = new Database(filename)
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'generalist_*' ORDER BY name",
    )
    .all()
    .map((row) => row.name)
  const runColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(generalist_runs)")
    .all()
    .map((row) => row.name)
  const operationColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(generalist_run_operations)")
    .all()
    .map((row) => row.name)
  const laneColumns = db
    .query<{ name: string }, []>("PRAGMA table_info(generalist_lanes)")
    .all()
    .map((row) => row.name)
  const meta = db
    .query<
      { version: number; checksum: string },
      []
    >("SELECT version, checksum FROM generalist_schema_meta WHERE id = 1")
    .get()
  const migrations = db
    .query<{ migration_id: number }, []>("SELECT migration_id FROM generalist_sql_migrations ORDER BY migration_id")
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
    "forked_from",
    "fork_sequence",
    "attempt",
    "attempt_fence",
    "last_sequence",
    "last_turn_completed_sequence",
    "cancellation_requested",
    "cancel_reason",
    "terminal_event_id",
    "accepted_sequence",
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
  expect(laneColumns).toEqual(["session_id", "accepted_sequence", "queue_json"])
  expect(tables).toEqual([
    "generalist_agent_names",
    "generalist_executable_registrations",
    "generalist_external_child_placements",
    "generalist_external_roots",
    "generalist_fan_out_members",
    "generalist_fan_outs",
    "generalist_host_sessions",
    "generalist_lanes",
    "generalist_memo_entries",
    "generalist_messages",
    "generalist_permission_rules",
    "generalist_program_operations",
    "generalist_program_runs",
    "generalist_run_acknowledgements",
    "generalist_run_events",
    "generalist_run_links",
    "generalist_run_operations",
    "generalist_run_registrations",
    "generalist_run_steering",
    "generalist_run_waits",
    "generalist_run_wake_events",
    "generalist_runs",
    "generalist_schedules",
    "generalist_schema_meta",
    "generalist_session_entries",
    "generalist_sessions",
    "generalist_sql_migrations",
    "generalist_tree_event_index",
    "generalist_tree_roots",
  ])
}

it.live("creates the current SQLite baseline and applies idempotently", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-baseline")
    yield* apply(filename)
    yield* apply(filename)
    inspect(filename)
    expect(yield* inspectLogicalSchema(filename)).toEqual([])
  }),
)

it.live("rejects a baseline whose migration identity was changed", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-identity")
    yield* apply(filename)
    const db = new Database(filename)
    db.run("UPDATE generalist_sql_migrations SET name = 'wrong' WHERE migration_id = 1")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
  }),
)

it.live("recovers an empty migration table and ignores unrelated lookalike tables", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-interrupted-bootstrap")
    const db = new Database(filename)
    db.run(`CREATE TABLE generalist_sql_migrations (
      migration_id integer PRIMARY KEY NOT NULL,
      created_at datetime NOT NULL DEFAULT current_timestamp,
      name VARCHAR(255) NOT NULL
    )`)
    db.run("CREATE TABLE generalistXunrelated (id INTEGER PRIMARY KEY)")
    db.close()

    yield* apply(filename)
    inspect(filename)
  }),
)

it.live("rejects a partial application schema without metadata", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-partial-bootstrap")
    const db = new Database(filename)
    db.run("CREATE TABLE generalist_runs (run_id TEXT PRIMARY KEY)")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)

    const inspectDb = new Database(filename)
    const tables = inspectDb
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'generalist_*' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    inspectDb.close()
    expect(tables).toEqual(["generalist_runs"])
  }),
)

it.live("rolls back a failed baseline and reports a typed migration failure", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-failed-bootstrap")
    const db = new Database(filename)
    db.run("CREATE TABLE generalist_sql_migrations (migration_id INTEGER PRIMARY KEY)")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)

    const inspectDb = new Database(filename)
    const tables = inspectDb
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'generalist_*' ORDER BY name",
      )
      .all()
      .map((row) => row.name)
    inspectDb.close()
    expect(tables).toEqual(["generalist_sql_migrations"])
  }),
)

it.live.each([
  ["dirty", "UPDATE generalist_schema_meta SET dirty = 1 WHERE id = 1", SchemaDirty],
  ["checksum", "UPDATE generalist_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
  ["old", `UPDATE generalist_schema_meta SET version = ${SCHEMA_VERSION - 1} WHERE id = 1`, SchemaVersionUnsupported],
  [
    "future",
    `UPDATE generalist_schema_meta SET version = ${SCHEMA_VERSION + 1} WHERE id = 1`,
    SchemaVersionUnsupported,
  ],
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
