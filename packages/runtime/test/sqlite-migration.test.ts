import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SchemaChecksumMismatch, SchemaDirty, SchemaVersionUnsupported } from "../src/sql/errors.js"
import { layer as sqliteClientLayer } from "../src/sql/bun-client.js"
import { migrate } from "../src/sql/migrate.js"
import { SCHEMA_VERSION, schemaChecksum } from "../src/sql/schema.js"
import { tempDbPath } from "./sqlite-helpers.js"

const apply = (filename: string) =>
  migrate(filename).pipe(Effect.provide(sqliteClientLayer({ filename })), Effect.scoped)

const inspect = (filename: string) => {
  const db = new Database(filename)
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'baton_%' ORDER BY name",
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
    "transcript_json",
    "continuation_json",
    "pending_outcome_json",
    "owner_worker_id",
    "created_at",
    "updated_at",
  ])
  expect(operationColumns).toContain("resolution_idempotency_key")
  expect(operationColumns).toContain("resolution_json")
  expect(tables).toEqual([
    "baton_executable_registrations",
    "baton_fan_out_members",
    "baton_fan_outs",
    "baton_lanes",
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
    "baton_sql_migrations",
    "baton_tree_event_index",
    "baton_tree_roots",
  ])
}

it.live("creates the current SQLite v1 baseline and applies idempotently", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-baseline-v1")
    yield* apply(filename)
    yield* apply(filename)
    inspect(filename)
  }),
)

it.live.each([
  ["dirty", "UPDATE baton_schema_meta SET dirty = 1 WHERE id = 1", SchemaDirty],
  ["checksum", "UPDATE baton_schema_meta SET checksum = 'wrong' WHERE id = 1", SchemaChecksumMismatch],
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
