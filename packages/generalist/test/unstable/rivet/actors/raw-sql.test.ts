/* oxlint-disable anti-slop/no-unsafe-dictionary-type, effecttsgo/async-function, effecttsgo/run-effect-inside-effect, effecttsgo/strict-effect-provide, typescript/no-unsafe-type-assertion -- These tests implement and drive Rivet's generic Promise-based RawAccess contract. */
import { Database } from "bun:sqlite"
import { expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import type { RawAccess } from "rivetkit/db"
import { layerSqlClient } from "../../../../src/unstable/rivet/actors/raw-sql.js"

const makeRaw = () => {
  const database = new Database(":memory:")
  let closes = 0
  let executions = 0
  const raw: RawAccess = {
    execute: async <TRow extends Record<string, unknown> = Record<string, unknown>>(
      query: string,
      ...params: unknown[]
    ) => {
      executions++
      // SAFETY: The test database accepts the RawAccess bindings and returns the row type requested by its caller.
      return database.query(query).all(...(params as never[])) as TRow[]
    },
    transaction: async (callback) => {
      database.run("BEGIN IMMEDIATE")
      try {
        const result = await callback(raw)
        database.run("COMMIT")
        return result
      } catch (cause) {
        database.run("ROLLBACK")
        throw cause
      }
    },
    close: async () => {
      closes++
      database.close()
    },
  }
  return { raw, database, closes: () => closes, executions: () => executions }
}

const withClient = <A, E, R>(raw: RawAccess, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(layerSqlClient(raw)))

class Required extends Context.Service<Required, { readonly value: string }>()(
  "generalist/test/rivet/actors/raw-sql.test/Required",
) {}

class ExpectedFailure extends Schema.TaggedError<ExpectedFailure>()("ExpectedFailure", {}) {}

it.live("keeps raw SQL lazy, preserves requirements, and leaves the actor-owned handle open", () =>
  Effect.gen(function* () {
    const fixture = makeRaw()
    const program = withClient(
      fixture.raw,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`CREATE TABLE test_values (value TEXT NOT NULL)`
        const insert = sql`INSERT INTO test_values (value) VALUES (${"lazy"})`
        expect(fixture.executions()).toBe(1)
        yield* insert
        yield* sql.withTransaction(
          Effect.gen(function* () {
            const required = yield* Required
            yield* sql`INSERT INTO test_values (value) VALUES (${required.value})`
          }),
        )
        return yield* sql<{ value: string }>`SELECT value FROM test_values ORDER BY rowid`
      }),
    ).pipe(Effect.provideService(Required, { value: "required" }))

    expect(yield* program).toEqual([{ value: "lazy" }, { value: "required" }])
    expect(fixture.closes()).toBe(0)
    fixture.database.close()
  }),
)

it.live("rolls back with the original typed failure and rejects nested transactions", () =>
  Effect.gen(function* () {
    const fixture = makeRaw()
    yield* withClient(
      fixture.raw,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`CREATE TABLE test_values (value TEXT NOT NULL)`
        const expected = ExpectedFailure.make()
        const failure = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`INSERT INTO test_values (value) VALUES ('rollback')`
              return yield* expected
            }),
          )
          .pipe(Effect.flip)
        expect(failure).toBe(expected)
        expect(yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM test_values`).toEqual([{ count: 0 }])

        const nested = yield* sql.withTransaction(sql.withTransaction(Effect.void)).pipe(Effect.flip)
        expect(nested).toBeInstanceOf(SqlError.SqlError)
        expect(nested.reason.operation).toBe("nested transaction")
      }),
    )
    fixture.database.close()
  }),
)

it.live("serializes concurrent statements inside one raw transaction", () =>
  Effect.gen(function* () {
    const firstStarted = yield* Deferred.make<void>()
    const releaseFirst = yield* Deferred.make<void>()
    let calls = 0
    let active = 0
    let maximumActive = 0
    const transaction: RawAccess = {
      execute: async () => {
        calls++
        active++
        maximumActive = Math.max(maximumActive, active)
        if (calls === 1) {
          await Effect.runPromise(Deferred.succeed(firstStarted, undefined))
          await Effect.runPromise(Deferred.await(releaseFirst))
        }
        active--
        return []
      },
      transaction: async () => {
        throw new Error("nested transaction")
      },
      close: async () => {},
    }
    const raw: RawAccess = {
      execute: async () => [],
      transaction: async (callback) => callback(transaction),
      close: async () => {},
    }

    yield* withClient(
      raw,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql.withTransaction(
          Effect.gen(function* () {
            const first = yield* sql`SELECT 1`.pipe(Effect.forkChild({ startImmediately: true }))
            const second = yield* sql`SELECT 2`.pipe(Effect.forkChild({ startImmediately: true }))
            yield* Deferred.await(firstStarted)
            yield* Effect.yieldNow
            expect(calls).toBe(1)
            expect(maximumActive).toBe(1)
            yield* Deferred.succeed(releaseFirst, undefined)
            yield* Fiber.join(first)
            yield* Fiber.join(second)
          }),
        )
      }),
    )
    expect(calls).toBe(2)
    expect(maximumActive).toBe(1)
  }),
)

it.live("waits for a raw transaction rollback before interruption completes", () =>
  Effect.gen(function* () {
    const callbackStarted = yield* Deferred.make<void>()
    const rollbackStarted = yield* Deferred.make<void>()
    const releaseRollback = yield* Deferred.make<void>()
    let pending = 0
    const raw: RawAccess = {
      execute: async () => [],
      transaction: async (callback) => {
        pending++
        await Effect.runPromise(Deferred.succeed(callbackStarted, undefined))
        try {
          return await callback(raw)
        } catch (cause) {
          await Effect.runPromise(Deferred.succeed(rollbackStarted, undefined))
          await Effect.runPromise(Deferred.await(releaseRollback))
          throw cause
        } finally {
          pending--
        }
      },
      close: async () => {},
    }
    const fiber = yield* withClient(
      raw,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        return yield* sql.withTransaction(Effect.never)
      }),
    ).pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(callbackStarted)
    let interruptionDone = false
    const interruption = yield* Fiber.interrupt(fiber).pipe(
      Effect.tap(() => Effect.sync(() => (interruptionDone = true))),
      Effect.forkChild({ startImmediately: true }),
    )
    yield* Deferred.await(rollbackStarted)
    expect(interruptionDone).toBe(false)
    expect(pending).toBe(1)
    yield* Deferred.succeed(releaseRollback, undefined)
    yield* Fiber.join(interruption)
    expect(Exit.isFailure(yield* Fiber.await(fiber))).toBe(true)
    expect(pending).toBe(0)
  }),
)

it.live("waits for an in-flight non-cancellable statement before interruption completes", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    let pending = 0
    const raw: RawAccess = {
      execute: async () => {
        pending++
        await Effect.runPromise(Deferred.succeed(started, undefined))
        await Effect.runPromise(Deferred.await(release))
        pending--
        return []
      },
      transaction: async (callback) => callback(raw),
      close: async () => {},
    }
    const fiber = yield* withClient(
      raw,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`SELECT 1`
      }),
    ).pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(started)
    let interruptionDone = false
    const interruption = yield* Fiber.interrupt(fiber).pipe(
      Effect.tap(() => Effect.sync(() => (interruptionDone = true))),
      Effect.forkChild({ startImmediately: true }),
    )
    yield* Effect.yieldNow
    expect(interruptionDone).toBe(false)
    expect(pending).toBe(1)
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(interruption)
    expect(Exit.isFailure(yield* Fiber.await(fiber))).toBe(true)
    expect(pending).toBe(0)
  }),
)
