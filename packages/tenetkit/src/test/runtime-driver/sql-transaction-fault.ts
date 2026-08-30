import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option } from "effect"
import { SqlClient } from "effect/unstable/sql"

export interface SqlTransactionFaultOptions<LayerError = never> {
  readonly name: string
  readonly layer: Layer.Layer<SqlClient.SqlClient, LayerError, never>
  readonly skip?: boolean
}

const withClient = <A, E, LayerError>(
  layer: Layer.Layer<SqlClient.SqlClient, LayerError, never>,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

/** Register interruption and lock-wait rollback tests for a server SQL transaction strategy. */
export const sqlTransactionFaultConformance = <LayerError>(options: SqlTransactionFaultOptions<LayerError>): void => {
  if (options.skip === true) {
    it.skip(`${options.name} rolls back interrupted transaction work and releases its connection`, () => undefined)
    it.skip(`${options.name} interrupts a transaction blocked on a row lock without applying its write`, () =>
      undefined)
    return
  }

  it.live(`${options.name} rolls back interrupted transaction work and releases its connection`, () =>
    withClient(
      options.layer,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`DROP TABLE IF EXISTS tenetkit_transaction_fault_probe`
        yield* sql`CREATE TABLE tenetkit_transaction_fault_probe (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)`
        const inserted = yield* Deferred.make<void>()
        const transaction = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`INSERT INTO tenetkit_transaction_fault_probe VALUES (1, 1)`
              yield* Deferred.succeed(inserted, undefined)
              return yield* Effect.never
            }),
          )
          .pipe(Effect.forkChild)
        yield* Deferred.await(inserted)
        yield* Fiber.interrupt(transaction)
        expect(yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM tenetkit_transaction_fault_probe`).toEqual([
          { count: 0 },
        ])
        yield* sql.withTransaction(sql`INSERT INTO tenetkit_transaction_fault_probe VALUES (1, 2)`)
        expect(yield* sql<{ value: number }>`SELECT value FROM tenetkit_transaction_fault_probe WHERE id = 1`).toEqual([
          { value: 2 },
        ])
        yield* sql`DROP TABLE tenetkit_transaction_fault_probe`
      }),
    ),
  )

  it.live(`${options.name} interrupts a transaction blocked on a row lock without applying its write`, () =>
    withClient(
      options.layer,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`DROP TABLE IF EXISTS tenetkit_transaction_fault_probe`
        yield* sql`CREATE TABLE tenetkit_transaction_fault_probe (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)`
        yield* sql`INSERT INTO tenetkit_transaction_fault_probe VALUES (1, 0)`
        const locked = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const holder = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`UPDATE tenetkit_transaction_fault_probe SET value = value + 1 WHERE id = 1`
              yield* Deferred.succeed(locked, undefined)
              yield* Deferred.await(release)
            }),
          )
          .pipe(Effect.forkChild)
        yield* Deferred.await(locked)
        const waitingStarted = yield* Deferred.make<void>()
        const waiting = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql.onDialectOrElse({
                pg: () => sql.unsafe("SET LOCAL lock_timeout = '1s'"),
                mysql: () => sql.unsafe("SET innodb_lock_wait_timeout = 1"),
                orElse: () => Effect.void,
              })
              yield* Deferred.succeed(waitingStarted, undefined)
              yield* sql`UPDATE tenetkit_transaction_fault_probe SET value = value + 10 WHERE id = 1`
            }),
          )
          .pipe(Effect.forkChild)
        yield* Deferred.await(waitingStarted)
        expect(Option.isNone(yield* Fiber.await(waiting).pipe(Effect.timeoutOption("50 millis")))).toBe(true)
        yield* Fiber.interrupt(waiting)
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(holder)
        expect(yield* sql<{ value: number }>`SELECT value FROM tenetkit_transaction_fault_probe WHERE id = 1`).toEqual([
          { value: 1 },
        ])
        yield* sql.withTransaction(sql`UPDATE tenetkit_transaction_fault_probe SET value = value + 1 WHERE id = 1`)
        expect(yield* sql<{ value: number }>`SELECT value FROM tenetkit_transaction_fault_probe WHERE id = 1`).toEqual([
          { value: 2 },
        ])
        yield* sql`DROP TABLE tenetkit_transaction_fault_probe`
      }),
    ),
  )
}
