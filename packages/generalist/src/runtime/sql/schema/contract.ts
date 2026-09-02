/* eslint-disable max-lines -- the logical SQL schema contract is one checksum authority */
import { Effect, Function } from "effect"
import { sha256Text } from "../../../core/durable/canonical-json.js"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "../errors.js"

/** The single logical SQL Runtime schema identity. */
export const SQL_SCHEMA_NAME = "generalist_runtime"

/** The single logical SQL Runtime schema version. */
export const SQL_SCHEMA_VERSION = 8

export interface SqlLogicalTable {
  readonly name: string
  readonly columns: ReadonlyArray<string>
}

export interface SqlLogicalIndex {
  readonly name: string
  readonly table: string
  readonly columns: ReadonlyArray<string>
  readonly unique?: boolean
}

export interface SqlLogicalConstraint {
  readonly table: string
  readonly kind: "check" | "foreign-key" | "primary-key" | "unique"
  readonly columns: ReadonlyArray<string>
}

export interface SqlSchemaMeta {
  readonly version: number
  readonly checksum: string
  readonly dirty: boolean
  readonly present: boolean
}

export interface SqlSchemaPlan {
  readonly current: number
  readonly required: number
  readonly checksum: string
  readonly statements: ReadonlyArray<string>
  readonly upgradeRequired: boolean
}

export interface SqlMigrationRecord {
  readonly migration_id: number
  readonly name: string
}

interface SqlLogicalSchemaContract {
  readonly tables: ReadonlyArray<SqlLogicalTable>
  readonly indexes: ReadonlyArray<SqlLogicalIndex>
  readonly constraints: ReadonlyArray<SqlLogicalConstraint>
}

/**
 * Dialect-neutral lifecycle inventory. Physical claim/lock indexes, MySQL's lock
 * table, and Cloudflare activation tables are deliberately adapter or host mechanics.
 */
export const SQL_LOGICAL_SCHEMA: SqlLogicalSchemaContract = {
  tables: [
    { name: "generalist_schema_meta", columns: ["id", "version", "checksum", "dirty", "applied_at"] },
    { name: "generalist_sql_migrations", columns: ["migration_id", "name", "created_at"] },
    {
      name: "generalist_permission_rules",
      columns: ["scope", "pattern", "level", "reason", "created_at"],
    },
    {
      name: "generalist_memo_entries",
      columns: ["memo_key", "value_json", "from_run", "from_operation", "expires_at_millis"],
    },
    { name: "generalist_lanes", columns: ["session_id", "accepted_sequence", "queue_json"] },
    {
      name: "generalist_host_sessions",
      columns: ["session_id", "title", "next_event_sequence", "created_at"],
    },
    {
      name: "generalist_runs",
      columns: [
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
        "forked_from",
        "fork_sequence",
        "attempt",
        "attempt_fence",
        "last_sequence",
        "last_turn_completed_sequence",
        "cancellation_requested",
        "cancel_reason",
        "terminal_event_id",
        "accepted_sequence",
        "driver_checkpoint_json",
        "suspension_json",
        "continuation_json",
        "pending_outcome_json",
        "owner_worker_id",
        "created_at",
        "updated_at",
      ],
    },
    {
      name: "generalist_run_events",
      columns: [
        "run_id",
        "sequence",
        "event_id",
        "event_json",
        "checkpoint_json",
        "host_session_id",
        "host_session_sequence",
      ],
    },
    {
      name: "generalist_run_acknowledgements",
      columns: ["run_id", "sequence", "acknowledged_at"],
    },
    {
      name: "generalist_run_operations",
      columns: [
        "run_id",
        "operation_id",
        "operation_key",
        "kind",
        "status",
        "input_digest",
        "input_json",
        "result_json",
        "error_json",
        "replay_policy",
        "attempt",
        "started_at",
        "finished_at",
        "resolution_idempotency_key",
        "resolution_json",
        "checkpoint_json",
        "completed_sequence",
      ],
    },
    {
      name: "generalist_run_waits",
      columns: ["run_id", "wait_id", "authored_order", "reason", "status", "response_json", "opened_at", "closed_at"],
    },
    {
      name: "generalist_run_links",
      columns: [
        "parent_run_id",
        "child_run_id",
        "invocation_id",
        "readiness",
        "terminal_event_id",
        "created_at",
        "settled_at",
      ],
    },
    {
      name: "generalist_external_child_placements",
      columns: [
        "placement_id",
        "parent_run_id",
        "partition",
        "external_run_id",
        "invocation_id",
        "request_digest",
        "executable_digest",
        "wait_id",
        "suspension_identity",
        "acknowledged",
        "cancel_requested",
        "settlement_id",
        "outcome_json",
        "outcome_event_id",
        "created_at",
        "settled_at",
      ],
    },
    {
      name: "generalist_external_roots",
      columns: [
        "placement_id",
        "parent_partition",
        "parent_run_id",
        "partition",
        "run_id",
        "session_id",
        "request_digest",
        "executable_digest",
        "admission_digest",
        "activated",
        "settlement_acknowledged",
        "created_at",
      ],
    },
    {
      name: "generalist_run_steering",
      columns: [
        "entry_id",
        "run_id",
        "sequence",
        "idempotency_key",
        "digest",
        "prompt_json",
        "consumed_operation_id",
        "discarded_reason",
      ],
    },
    { name: "generalist_agent_names", columns: ["scope", "name", "run_id"] },
    {
      name: "generalist_messages",
      columns: [
        "entry_id",
        "target_session_id",
        "sequence",
        "from_address",
        "from_run_id",
        "to_address",
        "message_id",
        "idempotency_key",
        "digest",
        "bytes",
        "admitted_at_millis",
        "prompt_json",
        "correlation_id",
        "causation_id",
        "in_reply_to",
        "metadata_json",
        "delivered_run_id",
        "steering_entry_id",
      ],
    },
    {
      name: "generalist_fan_outs",
      columns: [
        "fan_out_id",
        "parent_run_id",
        "idempotency_key",
        "input_digest",
        "join_json",
        "remainder",
        "concurrency",
        "status",
        "created_at",
        "updated_at",
      ],
    },
    {
      name: "generalist_fan_out_members",
      columns: [
        "fan_out_id",
        "ordinal",
        "member_key",
        "selection",
        "display_label",
        "prompt_json",
        "origin_json",
        "child_run_id",
        "depth",
        "status",
        "terminal_event_id",
        "outcome_json",
      ],
    },
    { name: "generalist_tree_roots", columns: ["root_run_id", "earliest_position", "last_position"] },
    {
      name: "generalist_tree_event_index",
      columns: ["root_run_id", "position", "run_id", "run_sequence", "event_id"],
    },
    {
      name: "generalist_program_runs",
      columns: [
        "run_id",
        "program_pin",
        "budget_json",
        "deadline_millis",
        "tool_calls",
        "agent_runs",
        "tokens",
        "log_bytes",
        "active_slots",
      ],
    },
    {
      name: "generalist_program_operations",
      columns: [
        "run_id",
        "operation_name",
        "kind",
        "capability",
        "input_digest",
        "input_json",
        "replay_policy",
        "status",
        "result_json",
        "error_json",
        "wait_id",
        "fan_out_id",
        "child_run_ids_json",
        "resolution_idempotency_key",
        "resolution_json",
      ],
    },
    {
      name: "generalist_executable_registrations",
      columns: ["pin", "codec", "version", "payload_json", "registration_digest"],
    },
    { name: "generalist_run_registrations", columns: ["run_id", "pin"] },
    {
      name: "generalist_sessions",
      columns: [
        "session_id",
        "leaf_id",
        "next_seq",
        "writer_epoch",
        "writer_run_id",
        "writer_owner_id",
        "writer_attempt_fence",
        "updated_at",
      ],
    },
    {
      name: "generalist_session_entries",
      columns: ["session_id", "entry_id", "parent_id", "seq", "tag", "payload_json", "created_at"],
    },
  ],
  indexes: [
    {
      name: "generalist_run_links_readiness_idx",
      table: "generalist_run_links",
      columns: ["parent_run_id", "readiness", "created_at", "child_run_id"],
    },
    {
      name: "generalist_external_child_placements_parent_idx",
      table: "generalist_external_child_placements",
      columns: ["parent_run_id", "settlement_id", "created_at"],
    },
    {
      name: "generalist_run_steering_pending_idx",
      table: "generalist_run_steering",
      columns: ["run_id", "sequence"],
    },
    { name: "generalist_agent_names_run_idx", table: "generalist_agent_names", columns: ["run_id"] },
    {
      name: "generalist_messages_pending_idx",
      table: "generalist_messages",
      columns: ["target_session_id", "sequence"],
    },
    {
      name: "generalist_run_operations_status_idx",
      table: "generalist_run_operations",
      columns: ["status"],
    },
    {
      name: "generalist_fan_out_members_status_idx",
      table: "generalist_fan_out_members",
      columns: ["fan_out_id", "status", "ordinal"],
    },
    {
      name: "generalist_run_registrations_pin_idx",
      table: "generalist_run_registrations",
      columns: ["pin"],
    },
    {
      name: "generalist_session_entries_seq_idx",
      table: "generalist_session_entries",
      columns: ["session_id", "seq"],
      unique: true,
    },
    {
      name: "generalist_session_entries_parent_idx",
      table: "generalist_session_entries",
      columns: ["session_id", "parent_id"],
    },
  ],
  constraints: [
    { table: "generalist_schema_meta", kind: "check", columns: ["id"] },
    { table: "generalist_permission_rules", kind: "primary-key", columns: ["scope", "pattern"] },
    { table: "generalist_memo_entries", kind: "primary-key", columns: ["memo_key"] },
    {
      table: "generalist_runs",
      kind: "unique",
      columns: ["address", "session_id", "idempotency_key"],
    },
    { table: "generalist_run_events", kind: "unique", columns: ["event_id"] },
    {
      table: "generalist_run_events",
      kind: "unique",
      columns: ["host_session_id", "host_session_sequence"],
    },
    { table: "generalist_run_events", kind: "foreign-key", columns: ["run_id"] },
    { table: "generalist_run_events", kind: "foreign-key", columns: ["host_session_id"] },
    { table: "generalist_run_operations", kind: "unique", columns: ["run_id", "operation_key"] },
    { table: "generalist_run_links", kind: "unique", columns: ["child_run_id"] },
    {
      table: "generalist_external_child_placements",
      kind: "unique",
      columns: ["partition", "external_run_id"],
    },
    {
      table: "generalist_external_child_placements",
      kind: "unique",
      columns: ["parent_run_id", "invocation_id"],
    },
    { table: "generalist_external_child_placements", kind: "check", columns: ["settlement_id"] },
    { table: "generalist_external_roots", kind: "unique", columns: ["run_id"] },
    { table: "generalist_run_steering", kind: "unique", columns: ["run_id", "sequence"] },
    { table: "generalist_agent_names", kind: "primary-key", columns: ["scope", "name"] },
    {
      table: "generalist_messages",
      kind: "unique",
      columns: ["target_session_id", "message_id", "idempotency_key"],
    },
    {
      table: "generalist_fan_outs",
      kind: "unique",
      columns: ["parent_run_id", "idempotency_key"],
    },
    { table: "generalist_fan_out_members", kind: "unique", columns: ["child_run_id"] },
    { table: "generalist_tree_event_index", kind: "unique", columns: ["event_id"] },
    { table: "generalist_sessions", kind: "check", columns: ["writer_run_id", "writer_owner_id"] },
  ],
}

/** Stable checksum of the logical contract, independent of physical dialect DDL. */
export const sqlSchemaChecksum = (): string =>
  sha256Text(
    JSON.stringify({
      name: SQL_SCHEMA_NAME,
      version: SQL_SCHEMA_VERSION,
      inventory: SQL_LOGICAL_SCHEMA,
    }),
  )

/** Derive the one logical migration plan from physical metadata and dialect DDL. */
export const planSqlSchema: {
  (meta: SqlSchemaMeta, statements: ReadonlyArray<string>): SqlSchemaPlan
  (statements: ReadonlyArray<string>): (meta: SqlSchemaMeta) => SqlSchemaPlan
} = Function.dual(
  2,
  (meta: SqlSchemaMeta, statements: ReadonlyArray<string>): SqlSchemaPlan => ({
    current: meta.version,
    required: SQL_SCHEMA_VERSION,
    checksum: sqlSchemaChecksum(),
    statements: meta.present ? [] : statements,
    upgradeRequired: meta.version < SQL_SCHEMA_VERSION,
  }),
)

/** Check the shared version/checksum/dirty state before dialect-owned verification. */
export const checkSqlSchemaMeta: {
  (
    meta: SqlSchemaMeta,
    source: string,
  ): Effect.Effect<void, SchemaUpgradeRequired | SchemaDirty | SchemaVersionUnsupported | SchemaChecksumMismatch>
  (
    source: string,
  ): (
    meta: SqlSchemaMeta,
  ) => Effect.Effect<void, SchemaUpgradeRequired | SchemaDirty | SchemaVersionUnsupported | SchemaChecksumMismatch>
} = Function.dual(2, (meta: SqlSchemaMeta, source: string) => {
  if (!meta.present) {
    return SchemaUpgradeRequired.make({ source, current: 0, required: SQL_SCHEMA_VERSION })
  }
  if (meta.dirty) return SchemaDirty.make({ source, version: meta.version })
  if (meta.version !== SQL_SCHEMA_VERSION) {
    return SchemaVersionUnsupported.make({
      source,
      version: meta.version,
      supported: SQL_SCHEMA_VERSION,
    })
  }
  const expected = sqlSchemaChecksum()
  if (meta.checksum !== expected) {
    return SchemaChecksumMismatch.make({ source, expected, actual: meta.checksum })
  }
  return Effect.void
})

/** Check the single greenfield baseline migration identity. */
export const checkSqlMigrationIdentity: {
  (migrations: ReadonlyArray<SqlMigrationRecord>, source: string): Effect.Effect<void, SchemaMigrationFailed>
  (source: string): (migrations: ReadonlyArray<SqlMigrationRecord>) => Effect.Effect<void, SchemaMigrationFailed>
} = Function.dual(2, (migrations: ReadonlyArray<SqlMigrationRecord>, source: string) =>
  migrations.length === 1 && Number(migrations[0]?.migration_id) === 1 && migrations[0]?.name === SQL_SCHEMA_NAME
    ? Effect.void
    : SchemaMigrationFailed.make({ source, message: "migration identity mismatch" }),
)
