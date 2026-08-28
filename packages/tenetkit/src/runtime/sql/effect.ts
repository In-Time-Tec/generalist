import { Effect, Function, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { isSqlError } from "effect/unstable/sql/SqlError"
import { RuntimeUnavailable } from "../errors.js"

export type WithoutSqlError<E> = Exclude<E, E & { readonly _tag: "SqlError" }>

const SqlFailureDetails = Schema.TaggedStruct("SqlError", {
  reason: Schema.optional(Schema.Struct({ cause: Schema.optional(Schema.Unknown) })),
  message: Schema.optional(Schema.String),
})

const sqlErrorMessage = (error: { readonly _tag: "SqlError" }): string => {
  const details = Schema.decodeOption(SqlFailureDetails)(error)
  if (details._tag === "None") return "sql error"
  if (details.value.reason?.cause instanceof Error) return details.value.reason.cause.message
  return details.value.message ?? "sql error"
}

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

interface WithSql {
  <A, E>(
    sql: SqlClient.SqlClient,
    effect: Effect.Effect<A, E, SqlClient.SqlClient>,
  ): Effect.Effect<A, WithoutSqlError<E> | RuntimeUnavailable>
  <A, E>(
    effect: Effect.Effect<A, E, SqlClient.SqlClient>,
  ): (sql: SqlClient.SqlClient) => Effect.Effect<A, WithoutSqlError<E> | RuntimeUnavailable>
}

export const withSql: WithSql = Function.dual(
  2,
  <A, E>(sql: SqlClient.SqlClient, effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    mapSqlError(effect).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
)
