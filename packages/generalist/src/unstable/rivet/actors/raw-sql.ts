/* oxlint-disable effecttsgo/async-function -- RawAccess transactions require Promise callbacks at this adapter boundary. */
import { Cause, Context, Effect, Exit, Layer, Option, Semaphore, Stream } from "effect"
import { Reactivity } from "effect/unstable/reactivity"
import { SqlClient, SqlError, Statement } from "effect/unstable/sql"
import type { Connection, Row } from "effect/unstable/sql/SqlConnection"
import type { RawAccess } from "rivetkit/db"

const sqlError = (cause: unknown, operation: string) =>
  SqlError.SqlError.make({
    reason: SqlError.classifySqliteError(cause, {
      message: `Rivet actor SQLite ${operation} failed`,
      operation,
    }),
  })

const execute = (
  access: RawAccess,
  query: string,
  params: ReadonlyArray<unknown>,
): Effect.Effect<ReadonlyArray<Row>, SqlError.SqlError> =>
  Effect.tryPromise({
    try: () => access.execute(query, ...params),
    catch: (cause) => sqlError(cause, "execute"),
  }).pipe(Effect.uninterruptible)

const values = (rows: ReadonlyArray<Row>): ReadonlyArray<ReadonlyArray<unknown>> =>
  rows.map((row) => Object.values(row))

const makeConnection = (
  access: RawAccess,
  serialize: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>,
): Connection => {
  const run = (query: string, params: ReadonlyArray<unknown>) => serialize(execute(access, query, params))
  return {
    execute(query, params, transformRows) {
      const rows = run(query, params)
      return transformRows === undefined ? rows : Effect.map(rows, transformRows)
    },
    executeRaw: run,
    executeValues: (query, params) => Effect.map(run(query, params), values),
    executeValuesUnprepared: (query, params) => Effect.map(run(query, params), values),
    executeUnprepared(query, params, transformRows) {
      return this.execute(query, params, transformRows)
    },
    executeStream(query, params, transformRows) {
      return Stream.unwrap(Effect.map(this.execute(query, params, transformRows), Stream.fromIterable))
    },
  }
}

/** @experimental Adapt one actor-owned raw SQLite handle without taking ownership of it. */
export const makeSqlClient = (raw: RawAccess): Effect.Effect<SqlClient.SqlClient, never, Reactivity.Reactivity> =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1)
    const frames = new WeakMap<Connection, { readonly access: RawAccess; readonly lock: Semaphore.Semaphore }>()
    const transactionConnection = (access: RawAccess, transactionLock: Semaphore.Semaphore) => {
      const connection = makeConnection(access, (effect) => transactionLock.withPermits(1)(effect))
      frames.set(connection, { access, lock: transactionLock })
      return connection
    }
    const outer = makeConnection(raw, (effect) => lock.withPermits(1)(effect))
    const client = yield* SqlClient.make({
      acquirer: Effect.succeed(outer),
      compiler: Statement.makeCompilerSqlite(),
      spanAttributes: [["db.system.name", "sqlite"]],
    })

    const withTransaction = <R, E, A>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | SqlError.SqlError, R> =>
      Effect.serviceOption(client.transactionService).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () =>
              lock.withPermits(1)(
                Effect.gen(function* () {
                  const context = yield* Effect.context<R>()
                  const transactionLock = yield* Semaphore.make(1)
                  return yield* Effect.callback<A, E | SqlError.SqlError, R>((resume, signal) => {
                    let rollbackCause: Cause.Cause<E> | undefined
                    const rollback = new Error("Effect transaction failed")
                    const settled = raw
                      .transaction(async (transaction) => {
                        const connection = transactionConnection(transaction, transactionLock)
                        const transactionContext = Context.add(context, client.transactionService, [
                          connection,
                          0,
                        ] as const)
                        const exit = await Effect.runPromiseExitWith(transactionContext)(effect, { signal })
                        if (Exit.isFailure(exit)) {
                          rollbackCause = exit.cause
                          throw rollback
                        }
                        return exit.value
                      })
                      .then(
                        (result) => resume(Effect.succeed(result)),
                        (cause: unknown) => {
                          if (cause === rollback && rollbackCause !== undefined) {
                            resume(Effect.failCause(rollbackCause))
                          } else {
                            resume(Effect.fail(sqlError(cause, "transaction")))
                          }
                        },
                      )
                    return Effect.promise(() => settled)
                  })
                }),
              ),
            onSome: ([parent, depth]) => {
              const frame = frames.get(parent)
              if (frame === undefined) {
                return Effect.fail(sqlError(new Error("foreign transaction connection"), "nested transaction"))
              }
              // Siblings share their parent's permit; descendants get a new permit while that
              // parent is reserved. Reacquiring an ancestor permit deadlocks at the third depth.
              return frame.lock.withPermits(1)(
                Effect.uninterruptibleMask((restore) =>
                  Effect.gen(function* () {
                    const nestedLock = yield* Semaphore.make(1)
                    const connection = transactionConnection(frame.access, nestedLock)
                    const savepoint = `generalist_nested_${depth + 1}`
                    yield* execute(frame.access, `SAVEPOINT ${savepoint}`, [])
                    const exit = yield* restore(
                      Effect.provideService(effect, client.transactionService, [connection, depth + 1] as const),
                    ).pipe(Effect.exit)
                    if (Exit.isFailure(exit)) {
                      yield* execute(frame.access, `ROLLBACK TO SAVEPOINT ${savepoint}`, [])
                    }
                    yield* execute(frame.access, `RELEASE SAVEPOINT ${savepoint}`, [])
                    return yield* exit
                  }),
                ),
              )
            },
          }),
        ),
      )

    return Object.assign(client, { withTransaction })
  })

/** @experimental Provide a SQL client over an actor-owned raw SQLite handle. */
export const layerSqlClient = (raw: RawAccess): Layer.Layer<SqlClient.SqlClient> =>
  Layer.effect(SqlClient.SqlClient, makeSqlClient(raw)).pipe(Layer.provide(Reactivity.layer))
