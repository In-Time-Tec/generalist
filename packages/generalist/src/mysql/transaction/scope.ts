import { Effect, Metric } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { isSqlError, type SqlError } from "effect/unstable/sql/SqlError"
import { withConsistentSnapshot, withSql, type SqlStoreRun, type SqlStoreRunner } from "../../runtime/sql-driver.js"

const isDeadlock = (error: SqlError): boolean => {
  const text = `${error.message} ${String(error.reason)}`.toLowerCase()
  return text.includes("deadlock") || text.includes("1213") || text.includes("40001")
}

const deadlockRetries = Metric.counter("generalist_runtime_sql_deadlock_retries", {
  description: "MySQL whole-transaction deadlock retries",
  incremental: true,
  attributes: { backend: "mysql" },
})

const deadlockExhaustions = Metric.counter("generalist_runtime_sql_deadlock_exhaustions", {
  description: "MySQL whole-transaction deadlock retry exhaustion",
  incremental: true,
  attributes: { backend: "mysql" },
})

/** Execute one whole MySQL transaction with the exact initial attempt plus four deadlock retries. */
export const transactionWithDeadlockRetry = <A, E, R>(input: {
  readonly effect: Effect.Effect<A, E, R>
  readonly transact: SqlClient.SqlClient["withTransaction"]
  readonly retries?: number
}): Effect.Effect<A, E | SqlError, R> => {
  const configuredRetries = input.retries ?? 4
  const transaction = (retries: number): Effect.Effect<A, E | SqlError, R> =>
    Effect.suspend(() =>
      input.transact(input.effect).pipe(
        Effect.catchIf(isSqlError, (error) => {
          if (!isDeadlock(error)) return Effect.fail(error)
          if (retries > 0) {
            return Effect.annotateCurrentSpan({
              "generalist.runtime.sql.retry.attempt": configuredRetries - retries + 1,
              "generalist.runtime.sql.retry.classification": "deadlock",
            }).pipe(
              Effect.andThen(Metric.update(deadlockRetries, 1)),
              Effect.andThen(Effect.sleep("10 millis")),
              Effect.andThen(transaction(retries - 1)),
            )
          }
          return Effect.annotateCurrentSpan({
            "generalist.runtime.sql.retry.attempt": configuredRetries,
            "generalist.runtime.sql.retry.classification": "deadlock-exhausted",
          }).pipe(Effect.andThen(Metric.update(deadlockExhaustions, 1)), Effect.andThen(Effect.fail(error)))
        }),
      ),
    )
  return transaction(configuredRetries)
}

/** MySQL-specific transaction runner bound to one SqlClient. */
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
