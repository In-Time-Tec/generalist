import { Database } from "bun:sqlite"
import { Context, Effect, Fiber, identity, Layer, Predicate, Schema, Scope, Semaphore, Stream } from "effect"
import { layer as reactivityLayer, Reactivity } from "effect/unstable/reactivity/Reactivity"
import { make as makeSqlClient, SafeIntegers, SqlClient } from "effect/unstable/sql/SqlClient"
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError"
import { makeCompilerSqlite } from "effect/unstable/sql/Statement"
import { SqliteClient, TypeId } from "@effect/sql-sqlite-bun/SqliteClient"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

const SqlParameter = Schema.Union([
  Schema.Null,
  Schema.String,
  Schema.declare<number>(Predicate.isNumber),
  Schema.BigInt,
  Schema.Boolean,
  Schema.Uint8Array,
])
const parseParameters = Schema.decodeUnknownSync(Schema.Array(SqlParameter))
const parseRows = Schema.decodeUnknownSync(Schema.Array(Schema.Record(Schema.String, Schema.Unknown)))
const parseValues = Schema.decodeUnknownSync(Schema.Array(Schema.Array(Schema.Unknown)))

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
      const databaseOptions =
        options.readonly === undefined
          ? { readwrite: options.readwrite ?? true, create: options.create ?? true }
          : { readonly: options.readonly, create: options.create ?? true }
      const db = new Database(options.filename, databaseOptions)
      yield* Effect.addFinalizer(() => Effect.sync(() => db.close()))
      if (options.disableWAL !== true) {
        db.run("PRAGMA journal_mode = WAL;")
      }
      db.run("PRAGMA foreign_keys = ON;")
      const prepare = (sql: string, useSafeIntegers: boolean) => {
        const statement = db.query(sql)
        const safeIntegers: unknown = "safeIntegers" in statement ? statement.safeIntegers : undefined
        if (!Predicate.isFunction(safeIntegers)) throw new TypeError("Bun SQLite statement lacks safe integer support")
        safeIntegers.call(statement, useSafeIntegers)
        return statement
      }
      const run = (sql: string, params: ReadonlyArray<unknown> = []) =>
        Effect.withFiber((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, SafeIntegers)
          try {
            return Effect.succeed(parseRows(prepare(sql, useSafeIntegers).all(...parseParameters(params)) ?? []))
          } catch (cause) {
            return Effect.fail(
              SqlError.make({ reason: classifyError(cause, "Failed to execute statement", "execute") }),
            )
          }
        })
      const runValues = (sql: string, params: ReadonlyArray<unknown> = []) =>
        Effect.withFiber((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, SafeIntegers)
          try {
            return Effect.succeed(parseValues(prepare(sql, useSafeIntegers).values(...parseParameters(params)) ?? []))
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
    const client = yield* makeSqlClient({
      acquirer,
      compiler,
      transactionAcquirer,
      beginTransaction: "BEGIN IMMEDIATE",
      spanAttributes: [[ATTR_DB_SYSTEM_NAME, "sqlite"]],
    })
    class Extension {
      declare readonly updateValues: never
      readonly [TypeId] = TypeId
      readonly config = options
      readonly export = Effect.flatMap(acquirer, (_) => _.export)
      readonly loadExtension = (path: string) => Effect.flatMap(acquirer, (_) => _.loadExtension(path))

      constructor() {
        Object.defineProperty(this, "updateValues", { value: undefined, enumerable: true })
      }
    }
    return Object.assign(client, new Extension())
  })

export const layer = (options: SqliteOptions): Layer.Layer<SqliteClient | SqlClient> =>
  Layer.effectContext(
    Effect.map(make(options), (client) => Context.make(SqliteClient, client).pipe(Context.add(SqlClient, client))),
  ).pipe(Layer.provide(reactivityLayer))
