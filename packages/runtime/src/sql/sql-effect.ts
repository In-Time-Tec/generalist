import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { isSqlError } from "effect/unstable/sql/SqlError"
import { RuntimeUnavailable } from "../errors.js"

export const mapSqlError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, { readonly _tag: "SqlError" }> | RuntimeUnavailable, R> =>
  Effect.catchIf(effect, isSqlError, (error) =>
    Effect.fail(
      RuntimeUnavailable.make({
        message:
          "reason" in error && typeof error.reason === "object" && error.reason !== null && "cause" in error.reason
            ? String(error.reason.cause)
            : "message" in error && typeof error.message === "string"
              ? error.message
              : "sql error",
      }),
    ),
  ) as Effect.Effect<A, Exclude<E, { readonly _tag: "SqlError" }> | RuntimeUnavailable, R>

export const withSql = <A, E>(
  sql: SqlClient.SqlClient,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
): Effect.Effect<A, Exclude<E, { readonly _tag: "SqlError" }> | RuntimeUnavailable> =>
  mapSqlError(effect).pipe(Effect.provideService(SqlClient.SqlClient, sql))
