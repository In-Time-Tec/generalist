import { Clock, Effect, Layer, Schema, Semaphore } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { PermissionError, RuleSchema, RuleStore } from "./rule-store.js"

const table = "generalist_permission_rules"

/** @experimental SQL permission-rule scope. Use a session id for per-session rules. */
export interface RuleStoreSqlOptions {
  readonly scope?: string
}

interface RuleRow {
  readonly pattern: string
  readonly level: string
  readonly reason: string | null
}

const permissionError =
  (operation: string) =>
  (error: SqlError): PermissionError =>
    PermissionError.make({ message: `permission rule SQL ${operation} failed: ${error.message}` })

const make = (options: RuleStoreSqlOptions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const scope = options.scope ?? "sessionId"
    const writes = yield* Semaphore.make(1)
    yield* sql`CREATE TABLE IF NOT EXISTS ${sql(table)} (
      scope VARCHAR(255) NOT NULL,
      pattern VARCHAR(512) NOT NULL,
      level VARCHAR(16) NOT NULL,
      reason TEXT,
      created_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (scope, pattern)
    )`.pipe(Effect.mapError(permissionError("migration")))
    return RuleStore.of({
      remember: (rule) =>
        writes.withPermit(
          Effect.gen(function* () {
            const createdAt = (yield* Clock.currentTimeNanos).toString().padStart(20, "0")
            yield* sql.withTransaction(
              Effect.gen(function* () {
                yield* sql`DELETE FROM ${sql(table)} WHERE scope = ${scope} AND pattern = ${rule.pattern}`
                yield* sql`
                  INSERT INTO ${sql(table)} (scope, pattern, level, reason, created_at)
                  VALUES (${scope}, ${rule.pattern}, ${rule.level}, ${rule.reason ?? null}, ${createdAt})
                `
              }),
            )
          }).pipe(Effect.mapError(permissionError("write"))),
        ),
      rules: sql<RuleRow>`
        SELECT pattern, level, reason FROM ${sql(table)} WHERE scope = ${scope} ORDER BY created_at, pattern
      `.pipe(
        Effect.flatMap((rows) =>
          Schema.decodeUnknownEffect(Schema.Array(RuleSchema))(
            rows.map((row) =>
              row.reason === null
                ? { pattern: row.pattern, level: row.level }
                : { pattern: row.pattern, level: row.level, reason: row.reason },
            ),
          ),
        ),
        Effect.mapError((error) =>
          PermissionError.make({ message: `permission rule SQL read failed: ${String(error)}` }),
        ),
      ),
    })
  })

/** @experimental A RuleStore in the current Runtime SqlClient. */
export const layerRuleStoreSql = (
  options: RuleStoreSqlOptions = {},
): Layer.Layer<RuleStore, PermissionError, SqlClient.SqlClient> => Layer.effect(RuleStore, make(options))
