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

const bootstrapV8 = (filename: string) => {
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
  return db
}

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
    const db = bootstrapV8(filename)
    db.run(
      "INSERT INTO baton_sessions (session_id, leaf_id, next_seq, updated_at) VALUES ('session:legacy', 'entry:1', 1, 'legacy-time')",
    )
    db.run(
      "INSERT INTO baton_session_entries (session_id, entry_id, seq, tag, payload_json, created_at) VALUES ('session:legacy', 'entry:1', 0, 'UserMessage', '{\"digest\":\"entry-digest\"}', 'legacy-time')",
    )
    const insertRun = db.query(`INSERT INTO baton_runs (
      run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
      executable_ref_json, executable_manifest_json, root_run_id, depth, max_depth, max_subagents,
      parent_run_id, invocation_id, attempt, attempt_fence, last_sequence, accepted_sequence,
      responded_wait_ids_json, created_at, updated_at
    ) VALUES (?, ?, 'agent:legacy', 'session:legacy', ?, '{"prompt":"legacy"}', ?, ?,
      '{"digest":"ref"}', '{"digest":"manifest"}', 'run:parent', ?, 2, 2, ?, ?, 0, 0, -1, ?, '[]', 'legacy-time', 'legacy-time')`)
    insertRun.run("run:parent", "waiting", "message:parent", "digest:parent", "key:parent", 0, null, null, 0)
    insertRun.run(
      "run:child",
      "queued",
      "message:child",
      "digest:child",
      "key:child",
      1,
      "run:parent",
      "invoke:child",
      1,
    )
    db.run(
      "INSERT INTO baton_run_waits (run_id, wait_id, reason, status, opened_at) VALUES ('run:parent', 'wait:legacy', 'External', 'open', 'legacy-time')",
    )
    db.run(
      "INSERT INTO baton_run_links (parent_run_id, child_run_id, invocation_id, readiness, created_at) VALUES ('run:parent', 'run:child', 'invoke:child', 'ready', 'legacy-time')",
    )
    const before = db
      .query<{ name: string; digest: string }, []>(
        `SELECT 'entry' AS name, payload_json AS digest FROM baton_session_entries
        UNION ALL SELECT run_id, message_digest FROM baton_runs
        UNION ALL SELECT wait_id, status FROM baton_run_waits
        UNION ALL SELECT child_run_id, readiness FROM baton_run_links ORDER BY name`,
      )
      .all()
    db.close()

    yield* apply(filename)
    yield* apply(filename)
    inspect(filename)
    const migrated = new Database(filename)
    const after = migrated
      .query<{ name: string; digest: string }, []>(
        `SELECT 'entry' AS name, payload_json AS digest FROM baton_session_entries
        UNION ALL SELECT run_id, message_digest FROM baton_runs
        UNION ALL SELECT wait_id, status FROM baton_run_waits
        UNION ALL SELECT child_run_id, readiness FROM baton_run_links ORDER BY name`,
      )
      .all()
    expect(after).toEqual(before)
    expect(
      migrated.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM baton_external_child_placements").get(),
    ).toEqual({ count: 0 })
    migrated.close()
  }),
)

it.live.each(["missing", "wrong"] as const)(
  "rejects a version 8 schema with %s migration identity before mutation",
  (kind) =>
    Effect.gen(function* () {
      const filename = tempDbPath(`sqlite-v8-identity-${kind}`)
      const db = bootstrapV8(filename)
      db.run("DELETE FROM baton_sql_migrations")
      if (kind === "wrong") db.run("INSERT INTO baton_sql_migrations (migration_id, name) VALUES (1, 'wrong')")
      db.close()

      expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
      const after = new Database(filename)
      expect(after.query("SELECT version, checksum, dirty FROM baton_schema_meta WHERE id = 1").get()).toEqual({
        version: 8,
        checksum: V8_SCHEMA_CHECKSUM,
        dirty: 0,
      })
      expect(
        after.query("SELECT name FROM sqlite_master WHERE name = 'baton_external_child_placements'").get(),
      ).toBeNull()
      after.close()
    }),
)

it.live("rejects a conflicting placement table without mutating version 8 metadata", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-v8-migration-rollback")
    const db = bootstrapV8(filename)
    db.run("CREATE TABLE baton_external_child_placements (placement_id TEXT PRIMARY KEY)")
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
    const after = new Database(filename)
    expect(after.query("SELECT version, checksum, dirty FROM baton_schema_meta WHERE id = 1").get()).toEqual({
      version: 8,
      checksum: V8_SCHEMA_CHECKSUM,
      dirty: 0,
    })
    expect(after.query("SELECT migration_id FROM baton_sql_migrations WHERE migration_id = 2").get()).toBeNull()
    expect(
      after
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'baton_external_child_placements_parent_idx'",
        )
        .get(),
    ).toBeNull()
    expect(after.query("PRAGMA table_info(baton_external_child_placements)").all()).toHaveLength(1)
    after.close()
  }),
)

it.live("rolls back migration 2 table creation when its index DDL fails", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-v8-migration-ddl-rollback")
    const db = bootstrapV8(filename)
    db.run("CREATE TABLE conflicting_index_owner (parent_run_id TEXT, settlement_id TEXT, created_at TEXT)")
    db.run(
      "CREATE INDEX baton_external_child_placements_parent_idx ON conflicting_index_owner(parent_run_id, settlement_id, created_at)",
    )
    db.close()

    expect(yield* apply(filename).pipe(Effect.flip)).toBeInstanceOf(SchemaMigrationFailed)
    const after = new Database(filename)
    expect(after.query("SELECT version, checksum, dirty FROM baton_schema_meta WHERE id = 1").get()).toEqual({
      version: 8,
      checksum: V8_SCHEMA_CHECKSUM,
      dirty: 0,
    })
    expect(after.query("SELECT migration_id FROM baton_sql_migrations WHERE migration_id = 2").get()).toBeNull()
    expect(
      after
        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'baton_external_child_placements'")
        .get(),
    ).toBeNull()
    expect(
      after
        .query(
          "SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'baton_external_child_placements_parent_idx'",
        )
        .get(),
    ).toEqual({ tbl_name: "conflicting_index_owner" })
    after.close()
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
