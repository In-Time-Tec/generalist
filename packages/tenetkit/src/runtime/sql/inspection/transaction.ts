import { Effect, Function, Scope } from "effect"
import { SqlClient } from "effect/unstable/sql"

export type InspectionDialect = "postgres" | "mysql"

export const withConsistentSnapshot: {
  <A, E, R>(
    dialect: InspectionDialect,
    effect: Effect.Effect<A, E, R>,
  ): (sql: SqlClient.SqlClient) => Effect.Effect<A, E | import("effect/unstable/sql/SqlError").SqlError, R>
  <A, E, R>(
    sql: SqlClient.SqlClient,
    dialect: InspectionDialect,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | import("effect/unstable/sql/SqlError").SqlError, R>
} = Function.dual(3, <A, E, R>(sql: SqlClient.SqlClient, dialect: InspectionDialect, effect: Effect.Effect<A, E, R>) =>
  SqlClient.makeWithTransaction({
    transactionService: sql.transactionService,
    spanAttributes: [],
    acquireConnection: Effect.flatMap(Scope.make(), (scope) =>
      Effect.map(Scope.provide(sql.reserve, scope), (connection) => [scope, connection] as const),
    ),
    begin: (connection) =>
      dialect === "postgres"
        ? connection
            .executeUnprepared("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", [], undefined)
            .pipe(Effect.asVoid)
        : connection
            .executeUnprepared("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ", [], undefined)
            .pipe(
              Effect.andThen(connection.executeUnprepared("START TRANSACTION WITH CONSISTENT SNAPSHOT", [], undefined)),
              Effect.asVoid,
            ),
    savepoint: (connection, id) =>
      connection.executeUnprepared(`SAVEPOINT tenetkit_inspection_${id}`, [], undefined).pipe(Effect.asVoid),
    commit: (connection) => connection.executeUnprepared("COMMIT", [], undefined).pipe(Effect.asVoid),
    rollback: (connection) => connection.executeUnprepared("ROLLBACK", [], undefined).pipe(Effect.asVoid),
    rollbackSavepoint: (connection, id) =>
      connection
        .executeUnprepared(`ROLLBACK TO SAVEPOINT tenetkit_inspection_${id}`, [], undefined)
        .pipe(Effect.asVoid),
  })(effect),
)
