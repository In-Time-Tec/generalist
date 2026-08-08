export const SCHEMA_VERSION = 1
export const SCHEMA_META_TABLE = "baton_schema_meta"
export const MIGRATIONS_TABLE = "baton_sql_migrations"
export const NOTIFY_CHANNEL = "baton_run_events"

export const SCHEMA_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS baton_schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  dirty BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS baton_lanes (
  address TEXT NOT NULL,
  session_id TEXT NOT NULL,
  accepted_sequence BIGINT NOT NULL,
  queue_json TEXT NOT NULL,
  head_run_id TEXT,
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
  executable_ref_json TEXT NOT NULL,
  executable_manifest_json TEXT NOT NULL,
  root_run_id TEXT NOT NULL,
  parent_run_id TEXT,
  invocation_id TEXT,
  active_wait_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  attempt_fence INTEGER NOT NULL DEFAULT 0,
  last_sequence INTEGER NOT NULL DEFAULT -1,
  last_committed_sequence INTEGER NOT NULL DEFAULT -1,
  cancellation_requested BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason TEXT,
  terminal_event_id TEXT,
  accepted_sequence BIGINT NOT NULL,
  responded_wait_ids_json TEXT NOT NULL,
  driver_checkpoint_json TEXT,
  suspension_json TEXT,
  transcript_json TEXT,
  continuation_json TEXT,
  pending_outcome_json TEXT,
  owner_worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (address, session_id, idempotency_key)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_events (
  run_id TEXT NOT NULL REFERENCES baton_runs(run_id),
  sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_json TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_operations (
  run_id TEXT NOT NULL REFERENCES baton_runs(run_id),
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
  owner_worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  resolution_idempotency_key TEXT,
  resolution_json TEXT,
  PRIMARY KEY (run_id, operation_id),
  UNIQUE (run_id, operation_key)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_waits (
  run_id TEXT NOT NULL REFERENCES baton_runs(run_id),
  wait_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  response_json TEXT,
  due_at TIMESTAMPTZ,
  owner_worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  PRIMARY KEY (run_id, wait_id)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_links (
  parent_run_id TEXT NOT NULL REFERENCES baton_runs(run_id),
  child_run_id TEXT NOT NULL REFERENCES baton_runs(run_id),
  invocation_id TEXT NOT NULL,
  terminal_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  PRIMARY KEY (parent_run_id, child_run_id),
  UNIQUE (child_run_id)
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_steering (
  entry_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES baton_runs(run_id),
  sequence BIGINT NOT NULL,
  idempotency_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  consumed_operation_id TEXT,
  UNIQUE (run_id, sequence),
  UNIQUE (run_id, idempotency_key)
)`,
  `CREATE INDEX IF NOT EXISTS baton_run_steering_pending_idx
    ON baton_run_steering(run_id, sequence) WHERE consumed_operation_id IS NULL`,
  `CREATE TABLE IF NOT EXISTS baton_run_acks (
  run_id TEXT PRIMARY KEY REFERENCES baton_runs(run_id),
  sequence INTEGER NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS baton_runs_claim_idx
    ON baton_runs(status, lease_expires_at)
    WHERE status IN ('queued', 'running', 'waiting', 'needs-resolution', 'cancelling')`,
  `CREATE INDEX IF NOT EXISTS baton_lanes_head_idx ON baton_lanes(head_run_id)`,
  `CREATE INDEX IF NOT EXISTS baton_run_operations_status_idx ON baton_run_operations(status)`,
  `CREATE INDEX IF NOT EXISTS baton_run_waits_due_idx ON baton_run_waits(status, due_at)`,
  `CREATE TABLE IF NOT EXISTS baton_fan_outs (
  fan_out_id TEXT PRIMARY KEY,
  parent_run_id TEXT NOT NULL REFERENCES baton_runs(run_id),
  idempotency_key TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  join_json TEXT NOT NULL,
  remainder TEXT NOT NULL,
  concurrency INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (parent_run_id, idempotency_key)
)`,
  `CREATE TABLE IF NOT EXISTS baton_fan_out_members (
  fan_out_id TEXT NOT NULL REFERENCES baton_fan_outs(fan_out_id),
  ordinal INTEGER NOT NULL,
  member_key TEXT NOT NULL,
  child_run_id TEXT NOT NULL UNIQUE REFERENCES baton_runs(run_id),
  status TEXT NOT NULL,
  terminal_event_id TEXT,
  outcome_json TEXT,
  PRIMARY KEY (fan_out_id, ordinal),
  UNIQUE (fan_out_id, member_key)
)`,
  `CREATE INDEX IF NOT EXISTS baton_fan_out_members_status_idx ON baton_fan_out_members(fan_out_id, status, ordinal)`,
  `CREATE TABLE IF NOT EXISTS baton_tree_roots (
  root_run_id TEXT PRIMARY KEY REFERENCES baton_runs(run_id),
  earliest_position BIGINT NOT NULL DEFAULT 0,
  last_position BIGINT NOT NULL DEFAULT -1
)`,
  `CREATE TABLE IF NOT EXISTS baton_tree_event_index (
  root_run_id TEXT NOT NULL REFERENCES baton_tree_roots(root_run_id),
  position BIGINT NOT NULL,
  run_id TEXT NOT NULL,
  run_sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE REFERENCES baton_run_events(event_id),
  PRIMARY KEY (root_run_id, position),
  UNIQUE (run_id, run_sequence),
  FOREIGN KEY (run_id, run_sequence) REFERENCES baton_run_events(run_id, sequence)
  )`,
  `CREATE TABLE IF NOT EXISTS baton_program_runs (
  run_id TEXT PRIMARY KEY REFERENCES baton_runs(run_id),
  program_pin TEXT NOT NULL,
  budget_json TEXT NOT NULL,
  deadline_millis BIGINT NOT NULL,
  tool_calls BIGINT NOT NULL DEFAULT 0,
  agent_runs BIGINT NOT NULL DEFAULT 0,
  tokens BIGINT NOT NULL DEFAULT 0,
  log_bytes BIGINT NOT NULL DEFAULT 0,
  active_slots BIGINT NOT NULL DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS baton_program_operations (
  run_id TEXT NOT NULL REFERENCES baton_program_runs(run_id),
  operation_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  capability TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  input_json TEXT NOT NULL,
  replay_policy TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  wait_id TEXT,
  fan_out_id TEXT,
  child_run_ids_json TEXT NOT NULL,
  resolution_idempotency_key TEXT,
  resolution_json TEXT,
  PRIMARY KEY (run_id, operation_name)
)`,
  `CREATE TABLE IF NOT EXISTS baton_executable_registrations (
  pin TEXT PRIMARY KEY,
  codec TEXT NOT NULL,
  version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  registration_digest TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS baton_run_registrations (
  run_id TEXT NOT NULL REFERENCES baton_runs(run_id),
  pin TEXT NOT NULL REFERENCES baton_executable_registrations(pin),
  PRIMARY KEY (run_id, pin)
  )`,
  `CREATE INDEX IF NOT EXISTS baton_run_registrations_pin_idx ON baton_run_registrations(pin)`,
]

export const schemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(SCHEMA_STATEMENTS.join("\n"))
  hasher.update(`\nversion=${SCHEMA_VERSION}`)
  hasher.update("\ndialect=postgres")
  return hasher.digest("hex")
}
