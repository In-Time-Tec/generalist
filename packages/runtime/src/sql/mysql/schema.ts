export const SCHEMA_VERSION = 4
export const SCHEMA_META_TABLE = "baton_schema_meta"
export const MIGRATIONS_TABLE = "baton_sql_migrations"
export const MIGRATION_LOCK = "baton_runtime_schema"

export const SCHEMA_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS baton_schema_meta (
  id INT PRIMARY KEY,
  version INT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  dirty TINYINT(1) NOT NULL DEFAULT 0,
  applied_at VARCHAR(30) NOT NULL,
  CONSTRAINT baton_schema_meta_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_sql_migrations (
  migration_id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_runtime_locks (
  lock_key VARCHAR(512) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_lanes (
  address VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  accepted_sequence BIGINT NOT NULL,
  queue_json LONGTEXT NOT NULL,
  PRIMARY KEY (address, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_runs (
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
  parent_run_id VARCHAR(255),
  invocation_id VARCHAR(255),
  active_wait_id VARCHAR(255),
  attempt INT NOT NULL DEFAULT 0,
  attempt_fence INT NOT NULL DEFAULT 0,
  last_sequence INT NOT NULL DEFAULT -1,
  cancellation_requested TINYINT(1) NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  terminal_event_id VARCHAR(255),
  accepted_sequence BIGINT NOT NULL,
  responded_wait_ids_json LONGTEXT NOT NULL,
  driver_checkpoint_json LONGTEXT,
  suspension_json LONGTEXT,
  continuation_json LONGTEXT,
  pending_outcome_json LONGTEXT,
  owner_worker_id VARCHAR(255),
  lease_expires_at VARCHAR(30),
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  UNIQUE KEY baton_runs_idempotency_key (address, session_id, idempotency_key),
  KEY baton_runs_claim_idx (status, lease_expires_at, accepted_sequence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_run_events (
  run_id VARCHAR(255) NOT NULL,
  sequence INT NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  event_json LONGTEXT NOT NULL,
  PRIMARY KEY (run_id, sequence),
  UNIQUE KEY baton_run_events_event_id_key (event_id),
  CONSTRAINT baton_run_events_run_fk FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_run_operations (
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
  UNIQUE KEY baton_run_operations_key (run_id, operation_key),
  KEY baton_run_operations_status_idx (status),
  CONSTRAINT baton_run_operations_run_fk FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_run_waits (
  run_id VARCHAR(255) NOT NULL,
  wait_id VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  response_json LONGTEXT,
  due_at VARCHAR(30),
  owner_worker_id VARCHAR(255),
  lease_expires_at VARCHAR(30),
  opened_at VARCHAR(30) NOT NULL,
  closed_at VARCHAR(30),
  PRIMARY KEY (run_id, wait_id),
  KEY baton_run_waits_due_idx (status, due_at),
  CONSTRAINT baton_run_waits_run_fk FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_run_links (
  parent_run_id VARCHAR(255) NOT NULL,
  child_run_id VARCHAR(255) NOT NULL,
  invocation_id VARCHAR(255) NOT NULL,
  terminal_event_id VARCHAR(255),
  created_at VARCHAR(30) NOT NULL,
  settled_at VARCHAR(30),
  PRIMARY KEY (parent_run_id, child_run_id),
  UNIQUE KEY baton_run_links_child_key (child_run_id),
  CONSTRAINT baton_run_links_parent_fk FOREIGN KEY (parent_run_id) REFERENCES baton_runs(run_id),
  CONSTRAINT baton_run_links_child_fk FOREIGN KEY (child_run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_run_steering (
  entry_id VARCHAR(255) PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL,
  sequence BIGINT NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  digest VARCHAR(128) NOT NULL,
  prompt_json LONGTEXT NOT NULL,
  consumed_operation_id VARCHAR(255),
  UNIQUE KEY baton_run_steering_sequence_key (run_id, sequence),
  UNIQUE KEY baton_run_steering_idempotency_key (run_id, idempotency_key),
  KEY baton_run_steering_pending_idx (run_id, consumed_operation_id, sequence),
  CONSTRAINT baton_run_steering_run_fk FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_agent_names (
  scope VARCHAR(255) NOT NULL,
  name VARCHAR(64) NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (scope, name),
  KEY baton_agent_names_run_idx (run_id),
  CONSTRAINT baton_agent_names_run_fk FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_messages (
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
  UNIQUE KEY baton_messages_identity_key (target_session_id, message_id, idempotency_key),
  UNIQUE KEY baton_messages_sequence_key (target_session_id, sequence),
  KEY baton_messages_pending_idx (target_session_id, delivered_run_id, sequence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_fan_outs (
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
  UNIQUE KEY baton_fan_out_idempotency_key (parent_run_id, idempotency_key),
  CONSTRAINT baton_fan_out_parent_fk FOREIGN KEY (parent_run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_fan_out_members (
  fan_out_id VARCHAR(255) NOT NULL,
  ordinal INT NOT NULL,
  member_key VARCHAR(255) NOT NULL,
  child_run_id VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  terminal_event_id VARCHAR(255),
  outcome_json LONGTEXT,
  PRIMARY KEY (fan_out_id, ordinal),
  UNIQUE KEY baton_fan_out_member_key (fan_out_id, member_key),
  UNIQUE KEY baton_fan_out_child_key (child_run_id),
  KEY baton_fan_out_members_status_idx (fan_out_id, status, ordinal),
  CONSTRAINT baton_fan_out_member_fan_out_fk FOREIGN KEY (fan_out_id) REFERENCES baton_fan_outs(fan_out_id),
  CONSTRAINT baton_fan_out_member_child_fk FOREIGN KEY (child_run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_tree_roots (
  root_run_id VARCHAR(255) PRIMARY KEY,
  earliest_position BIGINT NOT NULL DEFAULT 0,
  last_position BIGINT NOT NULL DEFAULT -1,
  CONSTRAINT baton_tree_roots_run_fk FOREIGN KEY (root_run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_tree_event_index (
  root_run_id VARCHAR(255) NOT NULL,
  position BIGINT NOT NULL,
  run_id VARCHAR(255) NOT NULL,
  run_sequence INT NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (root_run_id, position),
  UNIQUE KEY baton_tree_event_id_key (event_id),
  UNIQUE KEY baton_tree_run_sequence_key (run_id, run_sequence),
  CONSTRAINT baton_tree_index_root_fk FOREIGN KEY (root_run_id) REFERENCES baton_tree_roots(root_run_id),
  CONSTRAINT baton_tree_index_event_fk FOREIGN KEY (event_id) REFERENCES baton_run_events(event_id),
  CONSTRAINT baton_tree_index_run_event_fk FOREIGN KEY (run_id, run_sequence) REFERENCES baton_run_events(run_id, sequence)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_program_runs (
  run_id VARCHAR(255) PRIMARY KEY,
  program_pin VARCHAR(255) NOT NULL,
  budget_json LONGTEXT NOT NULL,
  deadline_millis BIGINT NOT NULL,
  tool_calls BIGINT NOT NULL DEFAULT 0,
  agent_runs BIGINT NOT NULL DEFAULT 0,
  tokens BIGINT NOT NULL DEFAULT 0,
  log_bytes BIGINT NOT NULL DEFAULT 0,
  active_slots BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT baton_program_runs_run_fk FOREIGN KEY (run_id) REFERENCES baton_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_program_operations (
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
  CONSTRAINT baton_program_operations_run_fk FOREIGN KEY (run_id) REFERENCES baton_program_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_executable_registrations (
  pin VARCHAR(255) PRIMARY KEY,
  codec VARCHAR(255) NOT NULL,
  version VARCHAR(255) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  registration_digest VARCHAR(128) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_run_registrations (
  run_id VARCHAR(255) NOT NULL,
  pin VARCHAR(255) NOT NULL,
  PRIMARY KEY (run_id, pin),
  CONSTRAINT baton_run_registrations_run_fk FOREIGN KEY (run_id) REFERENCES baton_runs(run_id),
  CONSTRAINT baton_run_registrations_pin_fk FOREIGN KEY (pin) REFERENCES baton_executable_registrations(pin)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE INDEX baton_run_registrations_pin_idx ON baton_run_registrations(pin)`,
  `CREATE TABLE IF NOT EXISTS baton_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  leaf_id VARCHAR(255),
  next_seq BIGINT NOT NULL DEFAULT 0,
  owner_token VARCHAR(255),
  updated_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS baton_session_entries (
  session_id VARCHAR(255) NOT NULL,
  entry_id VARCHAR(255) NOT NULL,
  parent_id VARCHAR(255),
  seq BIGINT NOT NULL,
  tag VARCHAR(32) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  PRIMARY KEY (session_id, entry_id),
  UNIQUE KEY baton_session_entries_seq_idx (session_id, seq),
  KEY baton_session_entries_parent_idx (session_id, parent_id),
  CONSTRAINT baton_session_entries_session_fk FOREIGN KEY (session_id) REFERENCES baton_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
]

export const schemaChecksum = (): string => {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(SCHEMA_STATEMENTS.join("\n"))
  hasher.update(`\nversion=${SCHEMA_VERSION}`)
  hasher.update("\ndialect=mysql")
  return hasher.digest("hex")
}
