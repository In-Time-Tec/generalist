export const SCHEMA_VERSION = 1
export const SCHEMA_META_TABLE = "baton_schema_meta"
export const MIGRATIONS_TABLE = "baton_sql_migrations"

export const MIGRATION_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS baton_schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 0,
  applied_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS baton_lanes (
  address TEXT NOT NULL,
  session_id TEXT NOT NULL,
  accepted_sequence INTEGER NOT NULL,
  queue_json TEXT NOT NULL,
  PRIMARY KEY (address, session_id)
)`,
  `CREATE TABLE IF NOT EXISTS baton_runs (
  run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  address TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  message_json TEXT NOT NULL,
  message_digest TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  agent_json TEXT NOT NULL,
  root_run_id TEXT NOT NULL,
  parent_run_id TEXT,
  invocation_id TEXT,
  active_wait_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  attempt_fence INTEGER NOT NULL DEFAULT 0,
  last_sequence INTEGER NOT NULL DEFAULT -1,
  cancellation_requested INTEGER NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  terminal_event_id TEXT,
  accepted_sequence INTEGER NOT NULL,
  responded_wait_ids_json TEXT NOT NULL,
  driver_checkpoint_json TEXT,
  suspension_json TEXT,
  transcript_json TEXT,
  owner_worker_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (address, session_id, idempotency_key)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_events (
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_json TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence),
  FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_operations (
  run_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  replay_policy TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  PRIMARY KEY (run_id, operation_id),
  UNIQUE (run_id, operation_key),
  FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_waits (
  run_id TEXT NOT NULL,
  wait_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  PRIMARY KEY (run_id, wait_id),
  FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_links (
  parent_run_id TEXT NOT NULL,
  child_run_id TEXT NOT NULL,
  invocation_id TEXT NOT NULL,
  terminal_event_id TEXT,
  created_at TEXT NOT NULL,
  settled_at TEXT,
  PRIMARY KEY (parent_run_id, child_run_id),
  UNIQUE (child_run_id),
  FOREIGN KEY (parent_run_id) REFERENCES baton_runs(run_id),
  FOREIGN KEY (child_run_id) REFERENCES baton_runs(run_id)
)`,
  `CREATE INDEX IF NOT EXISTS baton_runs_lane_idx ON baton_runs(address, session_id, status)`,
  `CREATE INDEX IF NOT EXISTS baton_run_operations_status_idx ON baton_run_operations(status)`,
]

export const schemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(MIGRATION_STATEMENTS.join("\n"))
  hasher.update(`\nversion=${SCHEMA_VERSION}`)
  return hasher.digest("hex")
}
