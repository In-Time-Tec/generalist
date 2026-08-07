import { Database } from "bun:sqlite"
import { Context, Effect, Fiber, identity, Layer, Scope, Semaphore, Stream } from "effect"
import { layer as reactivityLayer, Reactivity } from "effect/unstable/reactivity/Reactivity"
import { make as makeSqlClient, SafeIntegers, SqlClient } from "effect/unstable/sql/SqlClient"
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError"
import { makeCompilerSqlite } from "effect/unstable/sql/Statement"
import { SqliteClient, TypeId } from "@effect/sql-sqlite-bun/SqliteClient"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

const classifyError = (cause: unknown, message: string, operation: string) =>
  classifySqliteError(cause, { message, operation })

export interface SqliteOptions {
  readonly filename: string
  readonly readonly?: boolean
  readonly create?: boolean
  readonly readwrite?: boolean
  readonly disableWAL?: boolean
}

export const make = (options: SqliteOptions): Effect.Effect<SqliteClient, never, Scope.Scope | Reactivity> =>
  Effect.gen(function* () {
    const compiler = makeCompilerSqlite()
    const makeConnection = Effect.gen(function* () {
      const db = new Database(options.filename, {
        readonly: options.readonly,
        readwrite: options.readwrite ?? true,
        create: options.create ?? true,
      } as ConstructorParameters<typeof Database>[1])
      yield* Effect.addFinalizer(() => Effect.sync(() => db.close()))
      if (options.disableWAL !== true) {
        db.run("PRAGMA journal_mode = WAL;")
      }
      db.run("PRAGMA foreign_keys = ON;")
      const prepare = (sql: string, useSafeIntegers: boolean) => {
        const statement = db.query(sql) as ReturnType<Database["query"]> & {
          safeIntegers: (value: boolean) => void
        }
        statement.safeIntegers(useSafeIntegers)
        return statement
      }
      const run = (sql: string, params: ReadonlyArray<unknown> = []) =>
        Effect.withFiber((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, SafeIntegers)
          try {
            return Effect.succeed((prepare(sql, useSafeIntegers).all(...(params as Array<any>)) ?? []) as Array<object>)
          } catch (cause) {
            return Effect.fail(SqlError.make({ reason: classifyError(cause, "Failed to execute statement", "execute") }))
          }
        })
      const runValues = (sql: string, params: ReadonlyArray<unknown> = []) =>
        Effect.withFiber((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, SafeIntegers)
          try {
            return Effect.succeed(prepare(sql, useSafeIntegers).values(...(params as Array<any>)) ?? [])
          } catch (cause) {
            return Effect.fail(
              SqlError.make({ reason: classifyError(cause, "Failed to execute statement", "executeValues") }),
            )
          }
        })
      return identity({
        execute(
          sql: string,
          params: ReadonlyArray<unknown>,
          transformRows: ((rows: ReadonlyArray<object>) => ReadonlyArray<object>) | undefined,
        ) {
          return transformRows !== undefined ? Effect.map(run(sql, params), transformRows) : run(sql, params)
        },
        executeRaw(sql: string, params: ReadonlyArray<unknown>) {
          return run(sql, params)
        },
        executeValues(sql: string, params: ReadonlyArray<unknown>) {
          return runValues(sql, params)
        },
        executeValuesUnprepared(sql: string, params: ReadonlyArray<unknown>) {
          return runValues(sql, params)
        },
        executeUnprepared(
          sql: string,
          params: ReadonlyArray<unknown>,
          transformRows: ((rows: ReadonlyArray<object>) => ReadonlyArray<object>) | undefined,
        ) {
          return this.execute(sql, params, transformRows)
        },
        executeStream() {
          return Stream.die("executeStream not implemented")
        },
        export: Effect.try({
          try: () => db.serialize(),
          catch: (cause) => SqlError.make({ reason: classifyError(cause, "Failed to export database", "export") }),
        }),
        loadExtension: (path: string) =>
          Effect.try({
            try: () => {
              db.loadExtension(path)
            },
            catch: (cause) =>
              SqlError.make({ reason: classifyError(cause, "Failed to load extension", "loadExtension") }),
          }),
      })
    })
    const semaphore = yield* Semaphore.make(1)
    const connection = yield* makeConnection
    const acquirer = semaphore.withPermits(1)(Effect.succeed(connection))
    const transactionAcquirer = Effect.uninterruptibleMask((restore) => {
      const fiber = Fiber.getCurrent()!
      const scope = Context.getUnsafe(fiber.context, Scope.Scope)
      return Effect.as(
        Effect.tap(restore(semaphore.take(1)), () => Scope.addFinalizer(scope, semaphore.release(1))),
        connection,
      )
    })
    return Object.assign(
      yield* makeSqlClient({
        acquirer,
        compiler,
        transactionAcquirer,
        beginTransaction: "BEGIN IMMEDIATE",
        spanAttributes: [[ATTR_DB_SYSTEM_NAME, "sqlite"]],
      }),
      {
        [TypeId]: TypeId,
        config: options,
        export: Effect.flatMap(acquirer, (_) => _.export),
        loadExtension: (path: string) => Effect.flatMap(acquirer, (_) => _.loadExtension(path)),
        updateValues: undefined as never,
      },
    ) as unknown as SqliteClient
  })

export const layer = (options: SqliteOptions): Layer.Layer<SqliteClient | SqlClient> =>
  Layer.effectContext(
    Effect.map(make(options), (client) => Context.make(SqliteClient, client).pipe(Context.add(SqlClient, client))),
  ).pipe(Layer.provide(reactivityLayer))
