import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  SQL_LOGICAL_SCHEMA,
  type SqlLogicalConstraint,
  type SqlLogicalIndex,
  type SqlLogicalTable,
} from "generalist/runtime/sql-driver"

interface ObservedSchema {
  readonly tables: ReadonlyArray<SqlLogicalTable>
  readonly indexes: ReadonlyArray<SqlLogicalIndex>
  readonly constraints: ReadonlyArray<SqlLogicalConstraint>
}

const sameColumns = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((column, index) => column === right[index])

/** The one logical-inventory comparison shared by every physical SQL driver test. */
export const logicalSchemaViolations = (observed: ObservedSchema): ReadonlyArray<string> => {
  const violations: Array<string> = []
  for (const expected of SQL_LOGICAL_SCHEMA.tables) {
    const table = observed.tables.find((candidate) => candidate.name === expected.name)
    if (table === undefined) {
      violations.push(`missing table ${expected.name}`)
      continue
    }
    for (const column of expected.columns) {
      if (!table.columns.includes(column)) violations.push(`missing column ${expected.name}.${column}`)
    }
  }
  for (const expected of SQL_LOGICAL_SCHEMA.indexes) {
    const index = observed.indexes.find(
      (candidate) => candidate.name === expected.name && candidate.table === expected.table,
    )
    if (index === undefined) {
      violations.push(`missing index ${expected.name}`)
      continue
    }
    let position = -1
    for (const column of expected.columns) {
      position = index.columns.indexOf(column, position + 1)
      if (position === -1) {
        violations.push(`index ${expected.name} does not preserve ${expected.columns.join(",")}`)
        break
      }
    }
    if (expected.unique === true && index.unique !== true) violations.push(`index ${expected.name} is not unique`)
  }
  for (const expected of SQL_LOGICAL_SCHEMA.constraints) {
    const found = observed.constraints.some(
      (candidate) =>
        candidate.table === expected.table &&
        candidate.kind === expected.kind &&
        sameColumns(candidate.columns, expected.columns),
    )
    if (!found) {
      violations.push(`missing ${expected.kind} constraint ${expected.table}(${expected.columns.join(",")})`)
    }
  }
  return violations
}

const quoteSqliteIdentifier = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`

type Dialect = "pg" | "mysql" | "sqlite"

const readColumns = (
  sql: SqlClient.SqlClient,
  dialect: Dialect,
  table: string,
): Effect.Effect<ReadonlyArray<string>, SqlError> => {
  if (dialect === "pg") {
    return sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${table}
      ORDER BY ordinal_position
    `.pipe(Effect.map((rows) => rows.map((row) => row.column_name)))
  }
  if (dialect === "mysql") {
    return sql<{ column_name: string }>`
      SELECT COLUMN_NAME AS column_name FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ${table}
      ORDER BY ORDINAL_POSITION
    `.pipe(Effect.map((rows) => rows.map((row) => row.column_name)))
  }
  return sql
    .unsafe<{ name: string }>(`PRAGMA table_info(${quoteSqliteIdentifier(table)})`)
    .pipe(Effect.map((rows) => rows.map((row) => row.name)))
}

const readIndex = (
  sql: SqlClient.SqlClient,
  dialect: Dialect,
  expected: SqlLogicalIndex,
): Effect.Effect<SqlLogicalIndex | undefined, SqlError> =>
  Effect.gen(function* () {
    if (dialect === "pg") {
      const rows = yield* sql<{ column_name: string; is_unique: boolean }>`
        SELECT attribute.attname AS column_name, definition.indisunique AS is_unique
        FROM pg_class AS index_class
        JOIN pg_index AS definition ON definition.indexrelid = index_class.oid
        JOIN pg_class AS table_class ON table_class.oid = definition.indrelid
        JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
        JOIN LATERAL unnest(definition.indkey) WITH ORDINALITY AS key(attnum, ordinal) ON TRUE
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = table_class.oid AND attribute.attnum = key.attnum
        WHERE namespace.nspname = current_schema()
          AND table_class.relname = ${expected.table}
          AND index_class.relname = ${expected.name}
        ORDER BY key.ordinal
      `
      if (rows.length === 0) return undefined
      return {
        name: expected.name,
        table: expected.table,
        columns: rows.map((row) => row.column_name),
        unique: rows[0]?.is_unique === true,
      }
    }
    if (dialect === "mysql") {
      const rows = yield* sql<{ column_name: string; non_unique: number | string }>`
        SELECT COLUMN_NAME AS column_name, NON_UNIQUE AS non_unique
        FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ${expected.table} AND index_name = ${expected.name}
        ORDER BY SEQ_IN_INDEX
      `
      if (rows.length === 0) return undefined
      return {
        name: expected.name,
        table: expected.table,
        columns: rows.map((row) => row.column_name),
        unique: Number(rows[0]?.non_unique) === 0,
      }
    }
    const rows = yield* sql.unsafe<{ name: string }>(`PRAGMA index_info(${quoteSqliteIdentifier(expected.name)})`)
    if (rows.length === 0) return undefined
    const listed = yield* sql.unsafe<{ name: string; unique: number }>(
      `PRAGMA index_list(${quoteSqliteIdentifier(expected.table)})`,
    )
    return {
      name: expected.name,
      table: expected.table,
      columns: rows.map((row) => row.name),
      unique: listed.find((row) => row.name === expected.name)?.unique === 1,
    }
  })

const normalizeConstraintKind = (kind: string): SqlLogicalConstraint["kind"] | undefined => {
  switch (kind.toUpperCase()) {
    case "PRIMARY KEY":
      return "primary-key"
    case "UNIQUE":
      return "unique"
    case "FOREIGN KEY":
      return "foreign-key"
    default:
      return undefined
  }
}

const hasCheckConstraint = (
  sql: SqlClient.SqlClient,
  dialect: Dialect,
  expected: SqlLogicalConstraint,
): Effect.Effect<boolean, SqlError> => {
  const matches = (definitions: ReadonlyArray<{ readonly definition: string }>) =>
    definitions.some(({ definition }) =>
      expected.columns.every((column) => definition.toLowerCase().includes(column.toLowerCase())),
    )
  if (dialect === "pg") {
    return sql<{ definition: string }>`
      SELECT pg_get_constraintdef(constraint_row.oid) AS definition
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS table_class ON table_class.oid = constraint_row.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
      WHERE namespace.nspname = current_schema()
        AND table_class.relname = ${expected.table}
        AND constraint_row.contype = 'c'
    `.pipe(Effect.map(matches))
  }
  if (dialect === "mysql") {
    return sql<{ definition: string }>`
      SELECT check_row.CHECK_CLAUSE AS definition
      FROM information_schema.table_constraints AS table_row
      JOIN information_schema.check_constraints AS check_row
        ON check_row.CONSTRAINT_SCHEMA = table_row.CONSTRAINT_SCHEMA
        AND check_row.CONSTRAINT_NAME = table_row.CONSTRAINT_NAME
      WHERE table_row.TABLE_SCHEMA = DATABASE()
        AND table_row.TABLE_NAME = ${expected.table}
        AND table_row.CONSTRAINT_TYPE = 'CHECK'
    `.pipe(Effect.map(matches))
  }
  return sql<{ definition: string }>`
    SELECT sql AS definition FROM sqlite_schema
    WHERE type = 'table' AND name = ${expected.table}
  `.pipe(Effect.map(matches))
}

const hasSqliteConstraint = (
  sql: SqlClient.SqlClient,
  expected: SqlLogicalConstraint,
): Effect.Effect<boolean, SqlError> =>
  Effect.gen(function* () {
    if (expected.kind === "primary-key") {
      const rows = yield* sql.unsafe<{ name: string; pk: number }>(
        `PRAGMA table_info(${quoteSqliteIdentifier(expected.table)})`,
      )
      const columns = rows
        .filter((row) => row.pk > 0)
        .toSorted((left, right) => left.pk - right.pk)
        .map((row) => row.name)
      return sameColumns(columns, expected.columns)
    }
    if (expected.kind === "foreign-key") {
      const rows = yield* sql.unsafe<{ from: string; id: number; seq: number }>(
        `PRAGMA foreign_key_list(${quoteSqliteIdentifier(expected.table)})`,
      )
      return Array.from(Map.groupBy(rows, (row) => row.id).values()).some((group) =>
        sameColumns(
          group.toSorted((left, right) => left.seq - right.seq).map((row) => row.from),
          expected.columns,
        ),
      )
    }
    const listed = yield* sql.unsafe<{ name: string; unique: number }>(
      `PRAGMA index_list(${quoteSqliteIdentifier(expected.table)})`,
    )
    for (const index of listed.filter((row) => row.unique === 1)) {
      const rows = yield* sql.unsafe<{ name: string }>(`PRAGMA index_info(${quoteSqliteIdentifier(index.name)})`)
      if (
        sameColumns(
          rows.map((row) => row.name),
          expected.columns,
        )
      )
        return true
    }
    return false
  })

interface ConstraintRow {
  readonly constraint_name: string
  readonly kind: string
  readonly column_name: string
}

const hasServerConstraint = (
  sql: SqlClient.SqlClient,
  dialect: Exclude<Dialect, "sqlite">,
  expected: SqlLogicalConstraint,
): Effect.Effect<boolean, SqlError> => {
  const effect =
    dialect === "pg"
      ? sql<ConstraintRow>`
          SELECT constraint_row.constraint_name, constraint_row.constraint_type AS kind,
            key_row.column_name, key_row.ordinal_position AS ordinal
          FROM information_schema.table_constraints AS constraint_row
          JOIN information_schema.key_column_usage AS key_row
            ON key_row.constraint_schema = constraint_row.constraint_schema
            AND key_row.constraint_name = constraint_row.constraint_name
            AND key_row.table_name = constraint_row.table_name
          WHERE constraint_row.table_schema = current_schema()
            AND constraint_row.table_name = ${expected.table}
          ORDER BY constraint_row.constraint_name, key_row.ordinal_position
        `
      : sql<ConstraintRow>`
          SELECT constraint_row.CONSTRAINT_NAME AS constraint_name, constraint_row.CONSTRAINT_TYPE AS kind,
            key_row.COLUMN_NAME AS column_name, key_row.ORDINAL_POSITION AS ordinal
          FROM information_schema.table_constraints AS constraint_row
          JOIN information_schema.key_column_usage AS key_row
            ON key_row.CONSTRAINT_SCHEMA = constraint_row.CONSTRAINT_SCHEMA
            AND key_row.CONSTRAINT_NAME = constraint_row.CONSTRAINT_NAME
            AND key_row.TABLE_NAME = constraint_row.TABLE_NAME
          WHERE constraint_row.TABLE_SCHEMA = DATABASE()
            AND constraint_row.TABLE_NAME = ${expected.table}
          ORDER BY constraint_row.CONSTRAINT_NAME, key_row.ORDINAL_POSITION
        `
  return effect.pipe(
    Effect.map((rows) =>
      Array.from(Map.groupBy(rows, (row) => row.constraint_name).values()).some(
        (group) =>
          normalizeConstraintKind(group[0]?.kind ?? "") === expected.kind &&
          sameColumns(
            group.map((row) => row.column_name),
            expected.columns,
          ),
      ),
    ),
  )
}

/** Inspect the current physical database and compare it with Runtime's logical schema contract. */
export const inspectLogicalSqlSchema: Effect.Effect<ReadonlyArray<string>, SqlError, SqlClient.SqlClient> = Effect.gen(
  function* () {
    const sql = yield* SqlClient.SqlClient
    const dialect = yield* sql.onDialectOrElse({
      pg: () => Effect.succeed("pg" as const),
      mysql: () => Effect.succeed("mysql" as const),
      orElse: () => Effect.succeed("sqlite" as const),
    })
    const tables: Array<SqlLogicalTable> = []
    const indexes: Array<SqlLogicalIndex> = []
    const constraints: Array<SqlLogicalConstraint> = []

    for (const expected of SQL_LOGICAL_SCHEMA.tables) {
      const columns = yield* readColumns(sql, dialect, expected.name)
      if (columns.length > 0) {
        tables.push({ name: expected.name, columns })
      }
    }

    for (const expected of SQL_LOGICAL_SCHEMA.indexes) {
      const index = yield* readIndex(sql, dialect, expected)
      if (index !== undefined) indexes.push(index)
    }

    for (const expected of SQL_LOGICAL_SCHEMA.constraints) {
      if (expected.kind === "check") {
        if (yield* hasCheckConstraint(sql, dialect, expected)) constraints.push(expected)
        continue
      }
      if (dialect === "sqlite") {
        if (yield* hasSqliteConstraint(sql, expected)) constraints.push(expected)
      } else if (yield* hasServerConstraint(sql, dialect, expected)) constraints.push(expected)
    }

    return logicalSchemaViolations({ tables, indexes, constraints })
  },
)
