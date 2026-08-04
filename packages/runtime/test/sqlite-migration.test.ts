import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { SchemaMigrationFailed } from "../src/sql/errors.js"
import { layer as sqliteClientLayer } from "../src/sql/bun-client.js"
import { migrate } from "../src/sql/migrate.js"
import {
  FAN_OUT_MIGRATION_STATEMENTS,
  LEGACY_MIGRATION_STATEMENTS,
  SCHEMA_VERSION,
  TREE_MIGRATION_STATEMENTS,
  treeSchemaChecksum,
} from "../src/sql/schema.js"
import { tempDbPath } from "./sqlite-helpers.js"

const legacyMessage = "cannot migrate nonempty baton_runs to executable manifests"

const makeV4Fixture = (filename: string, populated: boolean) => {
  const db = new Database(filename)
  for (const statement of [
    ...LEGACY_MIGRATION_STATEMENTS,
    ...FAN_OUT_MIGRATION_STATEMENTS,
    ...TREE_MIGRATION_STATEMENTS,
  ]) {
    db.run(statement)
  }
  db.run(`CREATE TABLE baton_sql_migrations (
    migration_id INTEGER PRIMARY KEY NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(255) NOT NULL
  )`)
  for (const [migrationId, name] of [
    [1, "baton_runtime_kernel"],
    [2, "baton_runtime_steering"],
    [3, "baton_runtime_fan_out"],
    [4, "baton_runtime_tree_projection"],
  ] as const) {
    db.run("INSERT INTO baton_sql_migrations (migration_id, name) VALUES (?, ?)", [migrationId, name])
  }
  db.run("INSERT INTO baton_schema_meta (id, version, checksum, dirty, applied_at) VALUES (1, 4, ?, 0, ?)", [
    treeSchemaChecksum(),
    new Date(0).toISOString(),
  ])
  if (populated) {
    db.run(`INSERT INTO baton_runs (
      run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
      agent_json, root_run_id, accepted_sequence, responded_wait_ids_json, created_at, updated_at
    ) VALUES (
      'legacy-run', 'queued', 'agent', 'session', 'message', '{}', 'digest', 'key',
      '{}', 'legacy-run', 0, '[]', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
    )`)
  }
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(baton_runs)")
    .all()
    .map((row) => row.name)
  const meta = db
    .query<{ version: number; checksum: string }, []>("SELECT version, checksum FROM baton_schema_meta WHERE id = 1")
    .get()
  expect(meta).toEqual({ version: 4, checksum: treeSchemaChecksum() })
  expect(columns).toContain("agent_json")
  expect(columns).not.toContain("executable_ref_json")
  expect(columns).not.toContain("executable_manifest_json")
  db.close()
}

const apply = (filename: string) =>
  migrate(filename).pipe(Effect.provide(sqliteClientLayer({ filename })), Effect.scoped)

const inspectSchema = (filename: string) => {
  const db = new Database(filename)
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(baton_runs)")
    .all()
    .map((row) => row.name)
  const meta = db.query<{ version: number }, []>("SELECT version FROM baton_schema_meta WHERE id = 1").get()
  const pinTables = db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%pin%'")
    .all()
  db.close()
  expect(meta?.version).toBe(SCHEMA_VERSION)
  expect(columns).toContain("executable_ref_json")
  expect(columns).toContain("executable_manifest_json")
  expect(columns).not.toContain("agent_json")
  expect(pinTables).toEqual([])
}

it.live("migrates an empty genuine SQLite v4 schema to v5", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-empty-v4")
    makeV4Fixture(filename, false)
    yield* apply(filename)
    inspectSchema(filename)
  }),
)

it.live("rejects a populated genuine SQLite v4 schema with a typed failure", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-populated-v4")
    makeV4Fixture(filename, true)
    const failure = yield* apply(filename).pipe(Effect.flip)
    expect(failure).toBeInstanceOf(SchemaMigrationFailed)
    expect(failure.message).toBe(legacyMessage)
  }),
)

it.live("creates a fresh SQLite v5 schema", () =>
  Effect.gen(function* () {
    const filename = tempDbPath("sqlite-fresh-v5")
    yield* apply(filename)
    inspectSchema(filename)
  }),
)
