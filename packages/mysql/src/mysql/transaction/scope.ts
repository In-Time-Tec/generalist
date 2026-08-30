import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { isSqlError, type SqlError } from "effect/unstable/sql/SqlError"
import { withConsistentSnapshot } from "tenetkit/runtime/driver/sql/inspection/transaction"
import { withSql } from "tenetkit/runtime/driver/sql/transactions"

const isDeadlock = (error: SqlError): boolean => {
  const text = `${error.message} ${String(error.reason)}`.toLowerCase()
  return text.includes("deadlock") || text.includes("1213") || text.includes("40001")
}

/** @experimental MySQL-specific transaction runner bound to one SqlClient. */
export const runner = (sql: SqlClient.SqlClient) => {
  const transaction = <A, E>(
    effect: Effect.Effect<A, E, SqlClient.SqlClient>,
    retries = 4,
  ): Effect.Effect<A, E | SqlError, SqlClient.SqlClient> =>
    Effect.suspend(() =>
      sql
        .withTransaction(effect)
        .pipe(
          Effect.catchIf(isSqlError, (error) =>
            retries > 0 && isDeadlock(error)
              ? Effect.sleep("10 millis").pipe(Effect.andThen(transaction(effect, retries - 1)))
              : Effect.fail(error),
          ),
        ),
    )
  const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, transaction(effect))
  const runWithoutTransaction = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, effect)
  const runInspection = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    withSql(sql, withConsistentSnapshot(sql, "mysql", effect))
  return { transaction, run, runWithoutTransaction, runInspection }
}
