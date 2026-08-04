export const SCHEMA_VERSION = 6
export const SCHEMA_META_TABLE = "baton_schema_meta"
export const MIGRATIONS_TABLE = "baton_sql_migrations"

export const LEGACY_MIGRATION_STATEMENTS: ReadonlyArray<string> = [
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
  `CREATE TABLE IF NOT EXISTS baton_run_steering (
  entry_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  consumed_operation_id TEXT,
  UNIQUE (run_id, sequence),
  UNIQUE (run_id, idempotency_key),
  FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
)`,
  `CREATE INDEX IF NOT EXISTS baton_run_steering_pending_idx ON baton_run_steering(run_id, consumed_operation_id, sequence)`,
  `CREATE INDEX IF NOT EXISTS baton_runs_lane_idx ON baton_runs(address, session_id, status)`,
  `CREATE INDEX IF NOT EXISTS baton_run_operations_status_idx ON baton_run_operations(status)`,
  `ALTER TABLE baton_runs ADD COLUMN continuation_json TEXT`,
]

export const FAN_OUT_MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS baton_fan_outs (
  fan_out_id TEXT PRIMARY KEY,
  parent_run_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  join_json TEXT NOT NULL,
  remainder TEXT NOT NULL,
  concurrency INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (parent_run_id, idempotency_key),
  FOREIGN KEY (parent_run_id) REFERENCES baton_runs(run_id)
)`,
  `CREATE TABLE IF NOT EXISTS baton_fan_out_members (
  fan_out_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  member_key TEXT NOT NULL,
  child_run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  terminal_event_id TEXT,
  outcome_json TEXT,
  PRIMARY KEY (fan_out_id, ordinal),
  UNIQUE (fan_out_id, member_key),
  FOREIGN KEY (fan_out_id) REFERENCES baton_fan_outs(fan_out_id),
  FOREIGN KEY (child_run_id) REFERENCES baton_runs(run_id)
)`,
  `CREATE INDEX IF NOT EXISTS baton_fan_out_members_status_idx ON baton_fan_out_members(fan_out_id, status, ordinal)`,
]
export const TREE_MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS baton_tree_roots (
  root_run_id TEXT PRIMARY KEY,
  earliest_position INTEGER NOT NULL DEFAULT 0,
  last_position INTEGER NOT NULL DEFAULT -1,
  FOREIGN KEY (root_run_id) REFERENCES baton_runs(run_id)
)`,
  `CREATE TABLE IF NOT EXISTS baton_tree_event_index (
  root_run_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  run_sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  PRIMARY KEY (root_run_id, position),
  UNIQUE (event_id),
  UNIQUE (run_id, run_sequence),
  FOREIGN KEY (root_run_id) REFERENCES baton_tree_roots(root_run_id),
  FOREIGN KEY (run_id, run_sequence) REFERENCES baton_run_events(run_id, sequence),
  FOREIGN KEY (event_id) REFERENCES baton_run_events(event_id)
)`,
  `INSERT OR IGNORE INTO baton_tree_roots (root_run_id)
SELECT run_id FROM baton_runs WHERE root_run_id = run_id`,
  `INSERT OR IGNORE INTO baton_tree_event_index (root_run_id, position, run_id, run_sequence, event_id)
SELECT root_run_id, position, run_id, sequence, event_id FROM (
  SELECT r.root_run_id, e.run_id, e.sequence, e.event_id,
    ROW_NUMBER() OVER (PARTITION BY r.root_run_id ORDER BY e.run_id, e.sequence, e.event_id) - 1 AS position
  FROM baton_run_events e JOIN baton_runs r ON r.run_id = e.run_id
)`,
  `UPDATE baton_tree_roots SET last_position = COALESCE((
  SELECT MAX(position) FROM baton_tree_event_index i WHERE i.root_run_id = baton_tree_roots.root_run_id
), -1)`,
]
export const EXECUTABLE_MIGRATION_STATEMENTS = [
  `CREATE TEMP TABLE baton_executable_migration_guard (valid INTEGER NOT NULL CHECK (valid = 1))`,
  `INSERT INTO baton_executable_migration_guard (valid) SELECT CASE WHEN EXISTS (SELECT 1 FROM baton_runs) THEN 0 ELSE 1 END`,
  `DROP TABLE baton_executable_migration_guard`,
  `ALTER TABLE baton_runs ADD COLUMN executable_ref_json TEXT NOT NULL`,
  `ALTER TABLE baton_runs ADD COLUMN executable_manifest_json TEXT NOT NULL`,
  `ALTER TABLE baton_runs DROP COLUMN agent_json`,
]
export const OPERATION_RESOLUTION_MIGRATION_STATEMENTS = [
  `ALTER TABLE baton_run_operations ADD COLUMN resolution_idempotency_key TEXT`,
  `ALTER TABLE baton_run_operations ADD COLUMN resolution_json TEXT`,
]
export const MIGRATION_STATEMENTS = [
  ...LEGACY_MIGRATION_STATEMENTS,
  ...FAN_OUT_MIGRATION_STATEMENTS,
  ...TREE_MIGRATION_STATEMENTS,
  ...EXECUTABLE_MIGRATION_STATEMENTS,
  ...OPERATION_RESOLUTION_MIGRATION_STATEMENTS,
]
export const STEERING_MIGRATION_STATEMENTS = [
  ...LEGACY_MIGRATION_STATEMENTS.slice(7, 9),
  LEGACY_MIGRATION_STATEMENTS.at(-1)!,
]
export const KERNEL_MIGRATION_STATEMENTS = [
  ...LEGACY_MIGRATION_STATEMENTS.slice(0, 7),
  ...LEGACY_MIGRATION_STATEMENTS.slice(9, -1),
]

export const kernelSchemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(KERNEL_MIGRATION_STATEMENTS.join("\n"))
  hasher.update("\nversion=1")
  return hasher.digest("hex")
}

export const schemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(MIGRATION_STATEMENTS.join("\n"))
  hasher.update(`\nversion=${SCHEMA_VERSION}`)
  return hasher.digest("hex")
}

export const executableSchemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(
    [
      ...LEGACY_MIGRATION_STATEMENTS,
      ...FAN_OUT_MIGRATION_STATEMENTS,
      ...TREE_MIGRATION_STATEMENTS,
      ...EXECUTABLE_MIGRATION_STATEMENTS,
    ].join("\n"),
  )
  hasher.update("\nversion=5")
  return hasher.digest("hex")
}

export const steeringSchemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(LEGACY_MIGRATION_STATEMENTS.join("\n"))
  hasher.update("\nversion=2")
  return hasher.digest("hex")
}

export const fanOutSchemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update([...LEGACY_MIGRATION_STATEMENTS, ...FAN_OUT_MIGRATION_STATEMENTS].join("\n"))
  hasher.update("\nversion=3")
  return hasher.digest("hex")
}

export const treeSchemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(
    [...LEGACY_MIGRATION_STATEMENTS, ...FAN_OUT_MIGRATION_STATEMENTS, ...TREE_MIGRATION_STATEMENTS].join("\n"),
  )
  hasher.update("\nversion=4")
  return hasher.digest("hex")
}
