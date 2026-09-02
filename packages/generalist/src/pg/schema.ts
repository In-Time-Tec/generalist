export {
  SQL_SCHEMA_NAME as MIGRATION_NAME,
  SQL_SCHEMA_VERSION as SCHEMA_VERSION,
  sqlSchemaChecksum as schemaChecksum,
} from "../runtime/sql-driver.js"
export const SCHEMA_META_TABLE = "generalist_schema_meta"
export const MIGRATIONS_TABLE = "generalist_sql_migrations"
export const NOTIFY_CHANNEL = "generalist_run_events"

export const SCHEMA_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS generalist_schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  dirty BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS generalist_lanes (
  session_id TEXT PRIMARY KEY,
  accepted_sequence BIGINT NOT NULL,
  queue_json TEXT NOT NULL,
  head_run_id TEXT
)`,
  `CREATE TABLE IF NOT EXISTS generalist_host_sessions (
  session_id TEXT PRIMARY KEY,
  title TEXT,
  next_event_sequence BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS generalist_runs (
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
  depth INTEGER NOT NULL,
  max_depth INTEGER NOT NULL,
  max_subagents INTEGER NOT NULL,
  parent_run_id TEXT,
  invocation_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  attempt_fence INTEGER NOT NULL DEFAULT 0,
  last_sequence INTEGER NOT NULL DEFAULT -1,
  last_turn_completed_sequence INTEGER NOT NULL DEFAULT -1,
  cancellation_requested BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason TEXT,
  terminal_event_id TEXT,
  accepted_sequence BIGINT NOT NULL,
  driver_checkpoint_json TEXT,
  suspension_json TEXT,
  continuation_json TEXT,
  pending_outcome_json TEXT,
  owner_worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (address, session_id, idempotency_key)
)`,
  `CREATE TABLE IF NOT EXISTS generalist_run_events (
  run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
  sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  event_json TEXT NOT NULL,
  host_session_id TEXT REFERENCES generalist_host_sessions(session_id),
  host_session_sequence BIGINT,
  UNIQUE (host_session_id, host_session_sequence),
  PRIMARY KEY (run_id, sequence)
)`,
  `CREATE TABLE IF NOT EXISTS generalist_run_acknowledgements (
  run_id TEXT PRIMARY KEY REFERENCES generalist_runs(run_id),
  sequence INTEGER NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS generalist_run_operations (
  run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
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
  `CREATE TABLE IF NOT EXISTS generalist_run_waits (
  run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
  wait_id TEXT NOT NULL,
  authored_order INTEGER NOT NULL,
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
  `CREATE TABLE IF NOT EXISTS generalist_run_links (
  parent_run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
  child_run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
  invocation_id TEXT NOT NULL,
  readiness TEXT NOT NULL,
  terminal_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  PRIMARY KEY (parent_run_id, child_run_id),
  UNIQUE (child_run_id)
)`,
  `CREATE INDEX IF NOT EXISTS generalist_run_links_readiness_idx ON generalist_run_links(parent_run_id, readiness, created_at, child_run_id)`,
  `CREATE TABLE IF NOT EXISTS generalist_run_steering (
  entry_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
  sequence BIGINT NOT NULL,
  idempotency_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  consumed_operation_id TEXT,
  discarded_reason TEXT,
  UNIQUE (run_id, sequence),
  UNIQUE (run_id, idempotency_key)
)`,
  `CREATE INDEX IF NOT EXISTS generalist_run_steering_pending_idx
    ON generalist_run_steering(run_id, sequence) WHERE consumed_operation_id IS NULL AND discarded_reason IS NULL`,
  `CREATE TABLE IF NOT EXISTS generalist_agent_names (
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
  PRIMARY KEY (scope, name)
)`,
  `CREATE INDEX IF NOT EXISTS generalist_agent_names_run_idx ON generalist_agent_names(run_id)`,
  `CREATE TABLE IF NOT EXISTS generalist_messages (
  entry_id TEXT PRIMARY KEY,
  target_session_id TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  from_address TEXT NOT NULL,
  from_run_id TEXT NOT NULL,
  to_address TEXT NOT NULL,
  message_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  bytes BIGINT NOT NULL,
  admitted_at_millis BIGINT NOT NULL,
  prompt_json TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  in_reply_to TEXT,
  metadata_json TEXT NOT NULL,
  delivered_run_id TEXT,
  steering_entry_id TEXT,
  UNIQUE (target_session_id, message_id, idempotency_key),
  UNIQUE (target_session_id, sequence)
)`,
  `CREATE INDEX IF NOT EXISTS generalist_messages_pending_idx
    ON generalist_messages(target_session_id, sequence) WHERE delivered_run_id IS NULL`,
  `CREATE INDEX IF NOT EXISTS generalist_runs_claim_idx
    ON generalist_runs(status, lease_expires_at)
    WHERE status IN ('queued', 'running', 'waiting', 'needs-resolution', 'cancelling')`,
  `CREATE INDEX IF NOT EXISTS generalist_lanes_head_idx ON generalist_lanes(head_run_id)`,
  `CREATE INDEX IF NOT EXISTS generalist_run_operations_status_idx ON generalist_run_operations(status)`,
  `CREATE INDEX IF NOT EXISTS generalist_run_waits_due_idx ON generalist_run_waits(status, due_at)`,
  `CREATE TABLE IF NOT EXISTS generalist_fan_outs (
  fan_out_id TEXT PRIMARY KEY,
  parent_run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
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
  `CREATE TABLE IF NOT EXISTS generalist_fan_out_members (
  fan_out_id TEXT NOT NULL REFERENCES generalist_fan_outs(fan_out_id),
  ordinal INTEGER NOT NULL,
  member_key TEXT NOT NULL,
  selection TEXT NOT NULL,
  display_label TEXT,
  prompt_json TEXT NOT NULL,
  origin_json TEXT,
  child_run_id TEXT NOT NULL UNIQUE REFERENCES generalist_runs(run_id),
  depth INTEGER NOT NULL,
  status TEXT NOT NULL,
  terminal_event_id TEXT,
  outcome_json TEXT,
  PRIMARY KEY (fan_out_id, ordinal),
  UNIQUE (fan_out_id, member_key)
)`,
  `CREATE INDEX IF NOT EXISTS generalist_fan_out_members_status_idx ON generalist_fan_out_members(fan_out_id, status, ordinal)`,
  `CREATE TABLE IF NOT EXISTS generalist_tree_roots (
  root_run_id TEXT PRIMARY KEY REFERENCES generalist_runs(run_id),
  earliest_position BIGINT NOT NULL DEFAULT 0,
  last_position BIGINT NOT NULL DEFAULT -1
)`,
  `CREATE TABLE IF NOT EXISTS generalist_tree_event_index (
  root_run_id TEXT NOT NULL REFERENCES generalist_tree_roots(root_run_id),
  position BIGINT NOT NULL,
  run_id TEXT NOT NULL,
  run_sequence INTEGER NOT NULL,
  event_id TEXT NOT NULL UNIQUE REFERENCES generalist_run_events(event_id),
  PRIMARY KEY (root_run_id, position),
  UNIQUE (run_id, run_sequence),
  FOREIGN KEY (run_id, run_sequence) REFERENCES generalist_run_events(run_id, sequence)
  )`,
  `CREATE TABLE IF NOT EXISTS generalist_program_runs (
  run_id TEXT PRIMARY KEY REFERENCES generalist_runs(run_id),
  program_pin TEXT NOT NULL,
  budget_json TEXT NOT NULL,
  deadline_millis BIGINT NOT NULL,
  tool_calls BIGINT NOT NULL DEFAULT 0,
  agent_runs BIGINT NOT NULL DEFAULT 0,
  tokens BIGINT NOT NULL DEFAULT 0,
  log_bytes BIGINT NOT NULL DEFAULT 0,
  active_slots BIGINT NOT NULL DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS generalist_program_operations (
  run_id TEXT NOT NULL REFERENCES generalist_program_runs(run_id),
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
  `CREATE TABLE IF NOT EXISTS generalist_executable_registrations (
  pin TEXT PRIMARY KEY,
  codec TEXT NOT NULL,
  version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  registration_digest TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS generalist_run_registrations (
  run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
  pin TEXT NOT NULL REFERENCES generalist_executable_registrations(pin),
  PRIMARY KEY (run_id, pin)
  )`,
  `CREATE INDEX IF NOT EXISTS generalist_run_registrations_pin_idx ON generalist_run_registrations(pin)`,
  `CREATE TABLE IF NOT EXISTS generalist_sessions (
  session_id TEXT PRIMARY KEY,
  leaf_id TEXT,
  next_seq BIGINT NOT NULL DEFAULT 0,
  writer_epoch BIGINT NOT NULL DEFAULT 0,
  writer_run_id TEXT,
  writer_owner_id TEXT,
  writer_attempt_fence INTEGER,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK ((writer_run_id IS NULL AND writer_owner_id IS NULL AND writer_attempt_fence IS NULL)
    OR (writer_run_id IS NOT NULL AND writer_owner_id IS NOT NULL AND writer_attempt_fence IS NOT NULL))
)`,
  `CREATE TABLE IF NOT EXISTS generalist_session_entries (
  session_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  parent_id TEXT,
  seq BIGINT NOT NULL,
  tag TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (session_id, entry_id)
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS generalist_session_entries_seq_idx ON generalist_session_entries(session_id, seq)`,
  `CREATE INDEX IF NOT EXISTS generalist_session_entries_parent_idx ON generalist_session_entries(session_id, parent_id)`,
  `CREATE TABLE IF NOT EXISTS generalist_external_roots (
  placement_id TEXT PRIMARY KEY,
  parent_partition TEXT NOT NULL,
  parent_run_id TEXT NOT NULL,
  partition TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE REFERENCES generalist_runs(run_id),
  session_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  executable_digest TEXT NOT NULL,
  admission_digest TEXT NOT NULL,
  activated BOOLEAN NOT NULL DEFAULT FALSE,
  settlement_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS generalist_external_child_placements (
  placement_id TEXT PRIMARY KEY,
  parent_run_id TEXT NOT NULL REFERENCES generalist_runs(run_id),
  partition TEXT NOT NULL,
  external_run_id TEXT NOT NULL,
  invocation_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  executable_digest TEXT NOT NULL,
  wait_id TEXT,
  suspension_identity TEXT,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  settlement_id TEXT,
  outcome_json TEXT,
  outcome_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  UNIQUE (partition, external_run_id),
  UNIQUE (parent_run_id, invocation_id),
  CHECK ((settlement_id IS NULL AND outcome_json IS NULL AND outcome_event_id IS NULL AND settled_at IS NULL)
    OR (settlement_id IS NOT NULL AND outcome_json IS NOT NULL AND outcome_event_id IS NOT NULL AND settled_at IS NOT NULL))
)`,
  `CREATE INDEX IF NOT EXISTS generalist_external_child_placements_parent_idx
    ON generalist_external_child_placements(parent_run_id, settlement_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS generalist_permission_rules (
  scope TEXT NOT NULL,
  pattern TEXT NOT NULL,
  level TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, pattern)
)`,
]

export const SCHEMA_TABLES: ReadonlyArray<string> = SCHEMA_STATEMENTS.flatMap(
  (statement) => statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)?.slice(1, 2) ?? [],
)
