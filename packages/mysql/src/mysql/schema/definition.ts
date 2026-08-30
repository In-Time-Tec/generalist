export const SCHEMA_VERSION = 4
export const MIGRATION_NAME = "tenetkit_runtime"
export const SCHEMA_META_TABLE = "tenetkit_schema_meta"
export const MIGRATIONS_TABLE = "tenetkit_sql_migrations"
export const MIGRATION_LOCK = "tenetkit_runtime_schema"

export const SCHEMA_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS tenetkit_schema_meta (
  id INT PRIMARY KEY,
  version INT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  dirty TINYINT(1) NOT NULL DEFAULT 0,
  applied_at VARCHAR(30) NOT NULL,
  CONSTRAINT tenetkit_schema_meta_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_sql_migrations (
  migration_id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_runtime_locks (
  lock_key VARCHAR(512) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_lanes (
  session_id VARCHAR(255) PRIMARY KEY,
  accepted_sequence BIGINT NOT NULL,
  queue_json LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_runs (
  run_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(32) NOT NULL,
  address VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  message_json LONGTEXT NOT NULL,
  message_digest VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  executable_ref_json LONGTEXT NOT NULL,
  executable_manifest_json LONGTEXT NOT NULL,
  root_run_id VARCHAR(255) NOT NULL,
  depth INTEGER NOT NULL,
  max_depth INTEGER NOT NULL,
  max_subagents INTEGER NOT NULL,
  parent_run_id VARCHAR(255),
  invocation_id VARCHAR(255),
  attempt INT NOT NULL DEFAULT 0,
  attempt_fence INT NOT NULL DEFAULT 0,
  last_sequence INT NOT NULL DEFAULT -1,
  last_turn_completed_sequence INT NOT NULL DEFAULT -1,
  cancellation_requested TINYINT(1) NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  terminal_event_id VARCHAR(255),
  accepted_sequence BIGINT NOT NULL,
  driver_checkpoint_json LONGTEXT,
  suspension_json LONGTEXT,
  continuation_json LONGTEXT,
  pending_outcome_json LONGTEXT,
  owner_worker_id VARCHAR(255),
  lease_expires_at VARCHAR(30),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY tenetkit_runs_idempotency_key (address, session_id, idempotency_key),
  KEY tenetkit_runs_claim_idx (status, lease_expires_at, accepted_sequence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_run_events (
  run_id VARCHAR(255) NOT NULL,
  sequence INT NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_json LONGTEXT NOT NULL,
  PRIMARY KEY (run_id, sequence),
  UNIQUE KEY tenetkit_run_events_event_id_key (event_id),
  CONSTRAINT tenetkit_run_events_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_run_acknowledgements (
  run_id VARCHAR(255) PRIMARY KEY,
  sequence INT NOT NULL,
  acknowledged_at VARCHAR(30) NOT NULL,
  CONSTRAINT tenetkit_run_acknowledgements_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_run_operations (
  run_id VARCHAR(255) NOT NULL,
  operation_id VARCHAR(255) NOT NULL,
  operation_key VARCHAR(255) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  input_digest VARCHAR(128) NOT NULL,
  input_json LONGTEXT NOT NULL,
  result_json LONGTEXT,
  error_json LONGTEXT,
  replay_policy VARCHAR(32) NOT NULL,
  attempt INT NOT NULL,
  owner_worker_id VARCHAR(255),
  lease_expires_at VARCHAR(30),
  started_at VARCHAR(30),
  finished_at VARCHAR(30),
  resolution_idempotency_key VARCHAR(255),
  resolution_json LONGTEXT,
  PRIMARY KEY (run_id, operation_id),
  UNIQUE KEY tenetkit_run_operations_key (run_id, operation_key),
  KEY tenetkit_run_operations_status_idx (status),
  CONSTRAINT tenetkit_run_operations_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_run_waits (
  run_id VARCHAR(255) NOT NULL,
  wait_id VARCHAR(255) NOT NULL,
  authored_order INT NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  response_json LONGTEXT,
  due_at VARCHAR(30),
  owner_worker_id VARCHAR(255),
  lease_expires_at VARCHAR(30),
  opened_at VARCHAR(30) NOT NULL,
  closed_at VARCHAR(30),
  PRIMARY KEY (run_id, wait_id),
  KEY tenetkit_run_waits_due_idx (status, due_at),
  CONSTRAINT tenetkit_run_waits_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_run_links (
  parent_run_id VARCHAR(255) NOT NULL,
  child_run_id VARCHAR(255) NOT NULL,
  invocation_id VARCHAR(255) NOT NULL,
  readiness VARCHAR(16) NOT NULL,
  terminal_event_id VARCHAR(255),
  created_at VARCHAR(30) NOT NULL,
  settled_at VARCHAR(30),
  PRIMARY KEY (parent_run_id, child_run_id),
  UNIQUE KEY tenetkit_run_links_child_key (child_run_id),
  KEY tenetkit_run_links_readiness_idx (parent_run_id, readiness, created_at, child_run_id),
  CONSTRAINT tenetkit_run_links_parent_fk FOREIGN KEY (parent_run_id) REFERENCES tenetkit_runs(run_id),
  CONSTRAINT tenetkit_run_links_child_fk FOREIGN KEY (child_run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_run_steering (
  entry_id VARCHAR(255) PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL,
  sequence BIGINT NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  digest VARCHAR(128) NOT NULL,
  prompt_json LONGTEXT NOT NULL,
  consumed_operation_id VARCHAR(255),
  discarded_reason VARCHAR(32),
  UNIQUE KEY tenetkit_run_steering_sequence_key (run_id, sequence),
  UNIQUE KEY tenetkit_run_steering_idempotency_key (run_id, idempotency_key),
  KEY tenetkit_run_steering_pending_idx (run_id, consumed_operation_id, discarded_reason, sequence),
  CONSTRAINT tenetkit_run_steering_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_agent_names (
  scope VARCHAR(255) NOT NULL,
  name VARCHAR(64) NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (scope, name),
  KEY tenetkit_agent_names_run_idx (run_id),
  CONSTRAINT tenetkit_agent_names_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_messages (
  entry_id VARCHAR(255) PRIMARY KEY,
  target_session_id VARCHAR(255) NOT NULL,
  sequence BIGINT NOT NULL,
  from_address VARCHAR(255) NOT NULL,
  from_run_id VARCHAR(255) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  digest VARCHAR(128) NOT NULL,
  bytes BIGINT NOT NULL,
  admitted_at_millis BIGINT NOT NULL,
  prompt_json LONGTEXT NOT NULL,
  correlation_id VARCHAR(255) NOT NULL,
  causation_id VARCHAR(255),
  in_reply_to VARCHAR(255),
  metadata_json LONGTEXT NOT NULL,
  delivered_run_id VARCHAR(255),
  steering_entry_id VARCHAR(255),
  UNIQUE KEY tenetkit_messages_identity_key (target_session_id, message_id, idempotency_key),
  UNIQUE KEY tenetkit_messages_sequence_key (target_session_id, sequence),
  KEY tenetkit_messages_pending_idx (target_session_id, delivered_run_id, sequence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_fan_outs (
  fan_out_id VARCHAR(255) PRIMARY KEY,
  parent_run_id VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  input_digest VARCHAR(128) NOT NULL,
  join_json LONGTEXT NOT NULL,
  remainder VARCHAR(32) NOT NULL,
  concurrency INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY tenetkit_fan_out_idempotency_key (parent_run_id, idempotency_key),
  CONSTRAINT tenetkit_fan_out_parent_fk FOREIGN KEY (parent_run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_fan_out_members (
  fan_out_id VARCHAR(255) NOT NULL,
  ordinal INT NOT NULL,
  member_key VARCHAR(255) NOT NULL,
  selection VARCHAR(255) NOT NULL,
  display_label VARCHAR(256),
  prompt_json LONGTEXT NOT NULL,
  origin_json LONGTEXT,
  child_run_id VARCHAR(255) NOT NULL,
  depth INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  terminal_event_id VARCHAR(255),
  outcome_json LONGTEXT,
  PRIMARY KEY (fan_out_id, ordinal),
  UNIQUE KEY tenetkit_fan_out_member_key (fan_out_id, member_key),
  UNIQUE KEY tenetkit_fan_out_child_key (child_run_id),
  KEY tenetkit_fan_out_members_status_idx (fan_out_id, status, ordinal),
  CONSTRAINT tenetkit_fan_out_member_fan_out_fk FOREIGN KEY (fan_out_id) REFERENCES tenetkit_fan_outs(fan_out_id),
  CONSTRAINT tenetkit_fan_out_member_child_fk FOREIGN KEY (child_run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_tree_roots (
  root_run_id VARCHAR(255) PRIMARY KEY,
  earliest_position BIGINT NOT NULL DEFAULT 0,
  last_position BIGINT NOT NULL DEFAULT -1,
  CONSTRAINT tenetkit_tree_roots_run_fk FOREIGN KEY (root_run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_tree_event_index (
  root_run_id VARCHAR(255) NOT NULL,
  position BIGINT NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  run_sequence INT NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (root_run_id, position),
  UNIQUE KEY tenetkit_tree_event_id_key (event_id),
  UNIQUE KEY tenetkit_tree_run_sequence_key (run_id, run_sequence),
  CONSTRAINT tenetkit_tree_index_root_fk FOREIGN KEY (root_run_id) REFERENCES tenetkit_tree_roots(root_run_id),
  CONSTRAINT tenetkit_tree_index_event_fk FOREIGN KEY (event_id) REFERENCES tenetkit_run_events(event_id),
  CONSTRAINT tenetkit_tree_index_run_event_fk FOREIGN KEY (run_id, run_sequence) REFERENCES tenetkit_run_events(run_id, sequence)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_program_runs (
  run_id VARCHAR(255) PRIMARY KEY,
  program_pin VARCHAR(255) NOT NULL,
  budget_json LONGTEXT NOT NULL,
  deadline_millis BIGINT NOT NULL,
  tool_calls BIGINT NOT NULL DEFAULT 0,
  agent_runs BIGINT NOT NULL DEFAULT 0,
  tokens BIGINT NOT NULL DEFAULT 0,
  log_bytes BIGINT NOT NULL DEFAULT 0,
  active_slots BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT tenetkit_program_runs_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_program_operations (
  run_id VARCHAR(255) NOT NULL,
  operation_name VARCHAR(255) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  capability VARCHAR(255) NOT NULL,
  input_digest VARCHAR(128) NOT NULL,
  input_json LONGTEXT NOT NULL,
  replay_policy VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  result_json LONGTEXT,
  error_json LONGTEXT,
  wait_id VARCHAR(255),
  fan_out_id VARCHAR(255),
  child_run_ids_json LONGTEXT NOT NULL,
  resolution_idempotency_key VARCHAR(255),
  resolution_json LONGTEXT,
  PRIMARY KEY (run_id, operation_name),
  CONSTRAINT tenetkit_program_operations_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_program_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_executable_registrations (
  pin VARCHAR(255) PRIMARY KEY,
  codec VARCHAR(255) NOT NULL,
  version VARCHAR(255) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  registration_digest VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_run_registrations (
  run_id VARCHAR(255) NOT NULL,
  pin VARCHAR(255) NOT NULL,
  PRIMARY KEY (run_id, pin),
  CONSTRAINT tenetkit_run_registrations_run_fk FOREIGN KEY (run_id) REFERENCES tenetkit_runs(run_id),
  CONSTRAINT tenetkit_run_registrations_pin_fk FOREIGN KEY (pin) REFERENCES tenetkit_executable_registrations(pin)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE INDEX tenetkit_run_registrations_pin_idx ON tenetkit_run_registrations(pin)`,
  `CREATE TABLE IF NOT EXISTS tenetkit_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  leaf_id VARCHAR(255),
  next_seq BIGINT NOT NULL DEFAULT 0,
  writer_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0,
  writer_run_id VARCHAR(255),
  writer_owner_id VARCHAR(255),
  writer_attempt_fence INT,
  updated_at VARCHAR(30) NOT NULL,
  CONSTRAINT tenetkit_sessions_writer_binding_check CHECK
    ((writer_run_id IS NULL AND writer_owner_id IS NULL AND writer_attempt_fence IS NULL)
      OR (writer_run_id IS NOT NULL AND writer_owner_id IS NOT NULL AND writer_attempt_fence IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_session_entries (
  session_id VARCHAR(255) NOT NULL,
  entry_id VARCHAR(255) NOT NULL,
  parent_id VARCHAR(255),
  seq BIGINT NOT NULL,
  tag VARCHAR(32) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  PRIMARY KEY (session_id, entry_id),
  UNIQUE KEY tenetkit_session_entries_seq_idx (session_id, seq),
  KEY tenetkit_session_entries_parent_idx (session_id, parent_id),
  CONSTRAINT tenetkit_session_entries_session_fk FOREIGN KEY (session_id) REFERENCES tenetkit_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS tenetkit_external_child_placements (
  placement_id VARCHAR(255) PRIMARY KEY,
  parent_run_id VARCHAR(255) NOT NULL,
  \`partition\` VARCHAR(255) NOT NULL,
  external_run_id VARCHAR(255) NOT NULL,
  invocation_id VARCHAR(255) NOT NULL,
  request_digest VARCHAR(128) NOT NULL,
  executable_digest VARCHAR(128) NOT NULL,
  wait_id VARCHAR(255),
  suspension_identity VARCHAR(128),
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  cancel_requested TINYINT(1) NOT NULL DEFAULT 0,
  settlement_id VARCHAR(255),
  outcome_json LONGTEXT,
  outcome_event_id VARCHAR(255),
  created_at VARCHAR(30) NOT NULL,
  settled_at VARCHAR(30),
  UNIQUE KEY tenetkit_external_child_placements_ref_key (\`partition\`, external_run_id),
  UNIQUE KEY tenetkit_external_child_placements_invocation_key (parent_run_id, invocation_id),
  KEY tenetkit_external_child_placements_parent_idx (parent_run_id, settlement_id, created_at),
  CONSTRAINT tenetkit_external_child_placements_parent_fk FOREIGN KEY (parent_run_id) REFERENCES tenetkit_runs(run_id),
  CONSTRAINT tenetkit_external_child_placements_settlement_check CHECK
    ((settlement_id IS NULL AND outcome_json IS NULL AND outcome_event_id IS NULL AND settled_at IS NULL)
      OR (settlement_id IS NOT NULL AND outcome_json IS NOT NULL AND outcome_event_id IS NOT NULL AND settled_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
]

export const SCHEMA_TABLES: ReadonlyArray<string> = SCHEMA_STATEMENTS.flatMap(
  (statement) => statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)?.slice(1, 2) ?? [],
)

export const schemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(SCHEMA_STATEMENTS.join("\n"))
  hasher.update(`\nversion=${SCHEMA_VERSION}`)
  hasher.update("\ndialect=mysql")
  return hasher.digest("hex")
}
