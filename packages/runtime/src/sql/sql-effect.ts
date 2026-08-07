import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { isSqlError } from "effect/unstable/sql/SqlError"
import { RuntimeUnavailable } from "../errors.js"

export type WithoutSqlError<E> = Exclude<E, E & { readonly _tag: "SqlError" }>

const sqlErrorMessage = (
  error: { readonly _tag: "SqlError" } & { readonly reason?: unknown; readonly message?: unknown },
): string =>
  "reason" in error && typeof error.reason === "object" && error.reason !== null && "cause" in error.reason
    ? String((error.reason as { readonly cause?: unknown }).cause)
    : "message" in error && typeof error.message === "string"
      ? error.message
      : "sql error"

export const mapSqlError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, WithoutSqlError<E> | RuntimeUnavailable, R> =>
  effect.pipe(
    Effect.catchIf(
      (error): error is E & { readonly _tag: "SqlError" } => isSqlError(error),
      (error) => Effect.fail(RuntimeUnavailable.make({ message: sqlErrorMessage(error) })),
      (error) => Effect.fail(error),
    ),
  )

export const withSql: {
  <A, E>(
    sql: SqlClient.SqlClient,
    effect: Effect.Effect<A, E, SqlClient.SqlClient>,
  ): Effect.Effect<A, WithoutSqlError<E> | RuntimeUnavailable>
  <A, E>(
    effect: Effect.Effect<A, E, SqlClient.SqlClient>,
  ): (sql: SqlClient.SqlClient) => Effect.Effect<A, WithoutSqlError<E> | RuntimeUnavailable>
} = <A, E>(
  sqlOrEffect: SqlClient.SqlClient | Effect.Effect<A, E, SqlClient.SqlClient>,
  maybeEffect?: Effect.Effect<A, E, SqlClient.SqlClient>,
): any => {
  if (maybeEffect === undefined) {
    const effect = sqlOrEffect as Effect.Effect<A, E, SqlClient.SqlClient>
    return (sql: SqlClient.SqlClient) => withSql(sql, effect)
  }
  const sql = sqlOrEffect as SqlClient.SqlClient
  return mapSqlError(maybeEffect).pipe(Effect.provideService(SqlClient.SqlClient, sql))
}
