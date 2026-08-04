import { describe, expect, it } from "@effect/vitest"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { PgClient } from "@effect/sql-pg"
import { SchemaMigrationFailed } from "../../src/sql/errors.js"
import { RunSchema } from "../../src/sql/postgres/run-schema.js"
import {
  FAN_OUT_MIGRATION_STATEMENTS,
  LEGACY_MIGRATION_STATEMENTS,
  SCHEMA_VERSION,
  TREE_MIGRATION_STATEMENTS,
  treeSchemaChecksum,
} from "../../src/sql/postgres/schema.js"
import { postgresAvailable, postgresUrl } from "./helpers.js"

const describePostgres = postgresAvailable ? describe.sequential : describe.skip
const url = postgresUrl!
const legacyMessage = "cannot migrate nonempty baton_runs to executable manifests"
const client = PgClient.layer({ url: Redacted.make(url) })

const resetSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(`DROP TABLE IF EXISTS
    baton_tree_event_index, baton_tree_roots, baton_fan_out_members, baton_fan_outs, baton_run_steering,
    baton_run_links, baton_run_waits, baton_run_operations, baton_run_events, baton_runs, baton_lanes,
    baton_runtime_locks, baton_sql_migrations, baton_schema_meta CASCADE`)
})

const makeV4Fixture = (populated: boolean) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* resetSchema
    for (const statement of [
      ...LEGACY_MIGRATION_STATEMENTS,
      ...FAN_OUT_MIGRATION_STATEMENTS,
      ...TREE_MIGRATION_STATEMENTS,
    ]) {
      yield* sql.unsafe(statement)
    }
    yield* sql.unsafe(`CREATE TABLE baton_sql_migrations (
      migration_id INTEGER PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name TEXT NOT NULL
    )`)
    yield* sql.unsafe(`INSERT INTO baton_sql_migrations (migration_id, name) VALUES
      (1, 'baton_runtime_postgres_kernel'),
      (2, 'baton_runtime_postgres_steering'),
      (3, 'baton_runtime_postgres_fan_out'),
      (4, 'baton_runtime_postgres_tree_projection')`)
    yield* sql`
      INSERT INTO baton_schema_meta (id, version, checksum, dirty, applied_at)
      VALUES (1, 4, ${treeSchemaChecksum()}, FALSE, ${new Date(0)})
    `
    if (populated) {
      yield* sql.unsafe(`INSERT INTO baton_runs (
        run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
        agent_json, root_run_id, accepted_sequence, responded_wait_ids_json, created_at, updated_at
      ) VALUES (
        'legacy-run', 'queued', 'agent', 'session', 'message', '{}', 'digest', 'key',
        '{}', 'legacy-run', 0, '[]', NOW(), NOW()
      )`)
    }
    const columns = yield* sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'baton_runs'
    `
    const meta = yield* sql<{ version: number; checksum: string }>`
      SELECT version, checksum FROM baton_schema_meta WHERE id = 1
    `
    expect({ version: Number(meta[0]?.version), checksum: meta[0]?.checksum }).toEqual({
      version: 4,
      checksum: treeSchemaChecksum(),
    })
    expect(columns.map((row) => row.column_name)).toContain("agent_json")
    expect(columns.map((row) => row.column_name)).not.toContain("executable_ref_json")
    expect(columns.map((row) => row.column_name)).not.toContain("executable_manifest_json")
  })

const inspectSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const columns = yield* sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'baton_runs'
  `
  const meta = yield* sql<{ version: number }>`SELECT version FROM baton_schema_meta WHERE id = 1`
  const pinTables = yield* sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE '%pin%'
  `
  expect(Number(meta[0]?.version)).toBe(SCHEMA_VERSION)
  expect(columns.map((row) => row.column_name)).toContain("executable_ref_json")
  expect(columns.map((row) => row.column_name)).toContain("executable_manifest_json")
  expect(columns.map((row) => row.column_name)).not.toContain("agent_json")
  expect(pinTables).toEqual([])
})

describePostgres("postgres schema migration", () => {
  it.live("migrates an empty genuine v4 schema to v5", () =>
    Effect.gen(function* () {
      yield* makeV4Fixture(false)
      yield* RunSchema.apply("postgres-migration-test")
      yield* inspectSchema
    }).pipe(Effect.provide(client), Effect.scoped),
  )

  it.live("rejects a populated genuine v4 schema with a typed failure", () =>
    Effect.gen(function* () {
      yield* makeV4Fixture(true)
      const failure = yield* RunSchema.apply("postgres-migration-test").pipe(Effect.flip)
      expect(failure).toBeInstanceOf(SchemaMigrationFailed)
      expect(failure.message).toBe(legacyMessage)
    }).pipe(Effect.provide(client), Effect.scoped),
  )

  it.live("creates a fresh v5 schema", () =>
    Effect.gen(function* () {
      yield* resetSchema
      yield* RunSchema.apply("postgres-migration-test")
      yield* inspectSchema
    }).pipe(Effect.provide(client), Effect.scoped),
  )
})
