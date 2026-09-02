import { Effect, Function } from "effect"
import { sha256Text } from "../../../core/durable/canonical-json.js"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "../errors.js"
import {
  SQL_LOGICAL_SCHEMA,
  SQL_SCHEMA_NAME,
  SQL_SCHEMA_VERSION,
  type SqlMigrationRecord,
  type SqlSchemaMeta,
  type SqlSchemaPlan,
} from "./contract.js"

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
