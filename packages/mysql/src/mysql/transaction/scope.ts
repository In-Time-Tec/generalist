import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { isSqlError, type SqlError } from "effect/unstable/sql/SqlError"
import { withConsistentSnapshot, withSql, type SqlStoreRun, type SqlStoreRunner } from "tenetkit/runtime/sql-driver"

const isDeadlock = (error: SqlError): boolean => {
  const text = `${error.message} ${String(error.reason)}`.toLowerCase()
  return text.includes("deadlock") || text.includes("1213") || text.includes("40001")
}

/** Execute one whole MySQL transaction with the exact initial attempt plus four deadlock retries. */
export const transactionWithDeadlockRetry = <A, E, R>(input: {
  readonly effect: Effect.Effect<A, E, R>
  readonly transact: SqlClient.SqlClient["withTransaction"]
  readonly retries?: number
}): Effect.Effect<A, E | SqlError, R> => {
  const transaction = (retries: number): Effect.Effect<A, E | SqlError, R> =>
    Effect.suspend(() =>
      input
        .transact(input.effect)
        .pipe(
          Effect.catchIf(isSqlError, (error) =>
            retries > 0 && isDeadlock(error)
              ? Effect.sleep("10 millis").pipe(Effect.andThen(transaction(retries - 1)))
              : Effect.fail(error),
          ),
        ),
    )
  return transaction(input.retries ?? 4)
}

/** @experimental MySQL-specific transaction runner bound to one SqlClient. */
export const sqlRunner = (
  sql: SqlClient.SqlClient,
): Pick<SqlStoreRunner, "run" | "runInspection" | "transaction"> & { readonly runNoTxn: SqlStoreRun } => {
  const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | SqlError, R> =>
    transactionWithDeadlockRetry({ effect, transact: sql.withTransaction })
  const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, transaction(effect))
  const runNoTxn = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, effect)
  const runInspection = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    withSql(sql, withConsistentSnapshot(sql, "mysql", effect))
  return { transaction, run, runNoTxn, runInspection }
}
