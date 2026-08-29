import { Database } from "bun:sqlite"
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient"
import { expect, it } from "@effect/vitest"
import { Clock, Context, Deferred, Effect, Fiber, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SqlError } from "effect/unstable/sql/SqlError"
import { migrate } from "../../../src/runtime/sql/migrate.js"
import { tempDbPath } from "./scenario.js"

type Services = SqlClient.SqlClient | SqliteClient.SqliteClient

const withClient = <A, E>(
  config: SqliteClient.SqliteClientConfig,
  use: (
    sql: SqlClient.SqlClient,
    sqlite: SqliteClient.SqliteClient,
  ) => Effect.Effect<A, E, Services>,
): Effect.Effect<A, E> =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* Layer.build(SqliteClient.layer(config))
      return yield* use(
        Context.get(context, SqlClient.SqlClient),
        Context.get(context, SqliteClient.SqliteClient),
      ).pipe(Effect.provideContext(context))
    }),
  )

it.live("opens readonly databases without changing their journal mode", () => {
  const filename = tempDbPath("sqlite-upstream-readonly")
  const db = new Database(filename)
  db.run("CREATE TABLE records (value TEXT NOT NULL)")
  db.run("INSERT INTO records VALUES ('kept')")
  db.close()

  return withClient({ filename, readonly: true }, (sql) =>
    Effect.gen(function* () {
      expect(yield* sql<{ value: string }>`SELECT value FROM records`).toEqual([{ value: "kept" }])
      expect((yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`)[0]?.journal_mode).toBe("delete")
      expect(yield* Effect.flip(sql`INSERT INTO records VALUES ('rejected')`)).toBeInstanceOf(SqlError)
    }),
  )
})

it.live("enables WAL and a five-second busy timeout by default", () => {
  const walFilename = tempDbPath("sqlite-upstream-wal")
  const noWalFilename = tempDbPath("sqlite-upstream-no-wal")

  return Effect.gen(function* () {
    yield* withClient({ filename: walFilename }, (sql) =>
      Effect.gen(function* () {
        expect((yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`)[0]?.journal_mode).toBe("wal")
        expect((yield* sql<{ timeout: number }>`PRAGMA busy_timeout`)[0]?.timeout).toBe(5_000)
      }),
    )
    yield* withClient({ filename: noWalFilename, disableWAL: true }, (sql) =>
      Effect.gen(function* () {
        expect((yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`)[0]?.journal_mode).not.toBe("wal")
      }),
    )
  })
})

it.live("keeps foreign-key enforcement under TenetKit migration ownership", () => {
  const filename = tempDbPath("sqlite-upstream-foreign-keys")
  return withClient({ filename }, (sql) =>
    Effect.gen(function* () {
      yield* migrate(filename)
      expect((yield* sql<{ foreign_keys: number }>`PRAGMA foreign_keys`)[0]?.foreign_keys).toBe(1)
      yield* sql`CREATE TABLE adoption_parent (id INTEGER PRIMARY KEY)`
      yield* sql`CREATE TABLE adoption_child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES adoption_parent(id)
      )`
      expect(yield* Effect.flip(sql`INSERT INTO adoption_child VALUES (1, 404)`)).toBeInstanceOf(SqlError)
    }),
  )
})

it.live("returns a typed failure after the configured busy timeout", () => {
  const filename = tempDbPath("sqlite-upstream-contention")
  return Effect.scoped(
    Effect.gen(function* () {
      const contextA = yield* Layer.build(SqliteClient.layer({ filename, busyTimeout: "40 millis" }))
      const contextB = yield* Layer.build(SqliteClient.layer({ filename, busyTimeout: "40 millis" }))
      const sqlA = Context.get(contextA, SqlClient.SqlClient)
      const sqlB = Context.get(contextB, SqlClient.SqlClient)
      const locked = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()

      yield* sqlA`CREATE TABLE records (value TEXT NOT NULL)`
      const holder = yield* sqlA
        .withTransaction(
          Effect.gen(function* () {
            yield* sqlA`INSERT INTO records VALUES ('held')`
            yield* Deferred.succeed(locked, undefined)
            yield* Deferred.await(release)
          }),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(locked)

      expect((yield* sqlB<{ timeout: number }>`PRAGMA busy_timeout`)[0]?.timeout).toBe(40)
      const startedAt = yield* Clock.currentTimeMillis
      const result = yield* Effect.flip(sqlB`INSERT INTO records VALUES ('contended')`)
      const elapsed = (yield* Clock.currentTimeMillis) - startedAt
      expect(result).toBeInstanceOf(SqlError)
      expect(elapsed).toBeGreaterThanOrEqual(30)
      expect(elapsed).toBeLessThan(1_000)

      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(holder)
      expect(yield* sqlA<{ value: string }>`SELECT value FROM records`).toEqual([{ value: "held" }])
    }),
  )
})

it.live("rolls back a failed nested transaction without aborting its parent", () => {
  const filename = tempDbPath("sqlite-upstream-savepoints")
  return withClient({ filename }, (sql) =>
    Effect.gen(function* () {
      yield* sql`CREATE TABLE records (value TEXT NOT NULL)`
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`INSERT INTO records VALUES ('outer')`
          yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* sql`INSERT INTO records VALUES ('rolled-back')`
                return yield* Effect.fail("rollback inner")
              }),
            )
            .pipe(Effect.ignore)
          yield* sql.withTransaction(sql`INSERT INTO records VALUES ('inner')`)
        }),
      )
      expect(yield* sql<{ value: string }>`SELECT value FROM records ORDER BY rowid`).toEqual([
        { value: "outer" },
        { value: "inner" },
      ])
    }),
  )
})

it.live("preserves safe integers and typed-array parameters", () => {
  const filename = tempDbPath("sqlite-upstream-values")
  return withClient({ filename }, (sql) =>
    Effect.gen(function* () {
      const regular = yield* sql<{ value: number }>`SELECT 9007199254740993 AS value`
      expect(regular).toEqual([{ value: 9_007_199_254_740_992 }])

      const safe = yield* sql<{ value: bigint }>`SELECT 9007199254740993 AS value`.pipe(
        Effect.provideService(SqlClient.SafeIntegers, true),
      )
      expect(safe).toEqual([{ value: 9_007_199_254_740_993n }])

      yield* sql`CREATE TABLE blobs (value BLOB NOT NULL)`
      yield* sql`INSERT INTO blobs VALUES (${new Int8Array([0, 127, -1])})`
      const blobs = yield* sql<{ value: Uint8Array }>`SELECT value FROM blobs`
      expect(Array.from(blobs[0]?.value ?? [])).toEqual([0, 127, 255])
    }),
  )
})

it.live("exports a complete database image", () => {
  const filename = tempDbPath("sqlite-upstream-export")
  return withClient({ filename, disableWAL: true }, (sql, sqlite) =>
    Effect.gen(function* () {
      yield* sql`CREATE TABLE records (value TEXT NOT NULL)`
      yield* sql`INSERT INTO records VALUES ('exported')`
      const image = yield* sqlite.export
      const exported = Database.deserialize(image)
      expect(exported.query<{ value: string }, []>("SELECT value FROM records").all()).toEqual([{ value: "exported" }])
      exported.close()
    }),
  )
})

it.live("rolls back interrupted transactions and releases the client permit", () => {
  const filename = tempDbPath("sqlite-upstream-interruption")
  return withClient({ filename }, (sql) =>
    Effect.gen(function* () {
      yield* sql`CREATE TABLE records (value TEXT NOT NULL)`
      const inserted = yield* Deferred.make<void>()
      const transaction = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`INSERT INTO records VALUES ('interrupted')`
            yield* Deferred.succeed(inserted, undefined)
            return yield* Effect.never
          }),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(inserted)
      yield* Fiber.interrupt(transaction)

      expect(yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM records`).toEqual([{ count: 0 }])
      yield* sql.withTransaction(sql`INSERT INTO records VALUES ('committed')`)
      expect(yield* sql<{ value: string }>`SELECT value FROM records`).toEqual([{ value: "committed" }])
    }),
  )
})
