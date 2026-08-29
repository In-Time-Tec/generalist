import { layer as layerWithClient, layerPostgres } from "@tenetkit/pg"
import { PgClient } from "@effect/sql-pg"
import { describe, expect, it, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schedule, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ExecutableResolver, Run, Runtime } from "tenetkit/runtime"
import {
  assistant,
  assistantRef,
  registrationsFor,
  textPrompt,
} from "../../../tenetkit/test/runtime/execution/fixtures.js"
import { closedTestAgent } from "../../../tenetkit/test/runtime/run/identity.js"
import { NOTIFY_CHANNEL } from "../../src/postgres/schema.js"
import { postgresAvailable, postgresClient, postgresDatabase, uniqueSession } from "./database.js"

const resolver = ExecutableResolver.makeStatic([])

it.effect("rejects invalid PostgreSQL pool bounds before opening a client", () =>
  Effect.gen(function* () {
    for (const maxConnections of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const failure = yield* Layer.build(
        layerPostgres({
          url: "postgres://must-not-connect",
          resolver,
          addresses: [],
          maxConnections,
        }),
      ).pipe(Effect.flip, Effect.scoped)
      expect(failure).toMatchObject({
        _tag: "tenetkit/runtime/SchemaMigrationFailed",
        source: "postgres",
        message: "PostgreSQL maxConnections must be a positive integer",
      })
    }
  }),
)

const describePostgres = postgresAvailable ? describe : describe.skip
const database = postgresDatabase("host-transaction")
const sharedResolver = ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }])
const sharedLayer = database.provision(
  layerWithClient({
    source: "postgres-host-transaction",
    resolver: sharedResolver,
    addresses: [],
  }).pipe(Layer.provideMerge(postgresClient(database.url))),
)

const admission = (label: string, runId: string): Runtime.AdmitInput & { readonly runId: string } => ({
  runId,
  executable: assistantRef,
  registrations: registrationsFor(assistantRef),
  sessionId: uniqueSession(label),
  idempotencyKey: label,
  prompt: textPrompt(label),
})

const createHostTable = SqlClient.SqlClient.pipe(
  Effect.flatMap(
    (sql) => sql`
    CREATE TABLE IF NOT EXISTS host_transaction_rows (
      row_id TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `,
  ),
  Effect.asVoid,
)

const watchNotification = (payload: string) =>
  Effect.gen(function* () {
    const pg = yield* PgClient.PgClient
    const sql = yield* SqlClient.SqlClient
    const readyPayload = `listener-ready:${payload}`
    const ready = yield* Deferred.make<void>()
    const observed = yield* Deferred.make<void>()
    yield* pg.listen(NOTIFY_CHANNEL).pipe(
      Stream.runForEach((received) => {
        if (received === readyPayload) return Deferred.succeed(ready, undefined)
        if (received === payload) return Deferred.succeed(observed, undefined)
        return Effect.void
      }),
      Effect.forkScoped({ startImmediately: true }),
    )
    const ping = yield* sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${readyPayload})`.pipe(
      Effect.repeat(Schedule.spaced("10 millis")),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(ping)
    return observed
  })

describePostgres("PostgreSQL host transactions", () => {
  layer(sharedLayer, { excludeTestServices: true })("shared PostgreSQL client", (suite) => {
    suite.effect("atomically commits a host row and public Runtime admission receipt", () =>
      Effect.gen(function* () {
        yield* createHostTable
        const sql = yield* SqlClient.SqlClient
        const runtime = yield* Runtime.Runtime
        const input = admission("host-commit", "host-commit-run")
        const receipt: Run.RunReceipt = yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`INSERT INTO host_transaction_rows (row_id, value) VALUES ('host-commit', 'committed')`
            return yield* runtime.admit(input)
          }),
        )

        expect(receipt).toMatchObject({ runId: input.runId, duplicate: false })
        expect(
          yield* sql<{ value: string }>`SELECT value FROM host_transaction_rows WHERE row_id = 'host-commit'`,
        ).toEqual([{ value: "committed" }])
        expect((yield* runtime.inspect(receipt.runId)).status).toBe("queued")
      }),
    )

    suite.effect("rolls back the host row, Run, and PostgreSQL notification together", () =>
      Effect.gen(function* () {
        yield* createHostTable
        const sql = yield* SqlClient.SqlClient
        const runtime = yield* Runtime.Runtime
        const input = admission("host-rollback", "host-rollback-run")
        const notification = yield* watchNotification(input.runId)

        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`INSERT INTO host_transaction_rows (row_id, value) VALUES ('host-rollback', 'rolled-back')`
              yield* runtime.admit(input)
              return yield* Effect.fail("rollback")
            }),
          )
          .pipe(Effect.flip)
        yield* Effect.sleep("50 millis")

        expect(yield* Deferred.isDone(notification)).toBe(false)
        expect(yield* sql`SELECT row_id FROM host_transaction_rows WHERE row_id = 'host-rollback'`).toEqual([])
        expect((yield* runtime.inspect(input.runId).pipe(Effect.flip))._tag).toBe("tenetkit/runtime/RunNotFound")
      }),
    )

    suite.effect("uses savepoints for nested host and Runtime work", () =>
      Effect.gen(function* () {
        yield* createHostTable
        const sql = yield* SqlClient.SqlClient
        const runtime = yield* Runtime.Runtime
        const kept = admission("nested-kept", "nested-kept-run")
        const rolledBack = admission("nested-rolled-back", "nested-rolled-back-run")

        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`INSERT INTO host_transaction_rows (row_id, value) VALUES ('nested-kept', 'outer')`
            yield* runtime.admit(kept)
            yield* sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* sql`
                    INSERT INTO host_transaction_rows (row_id, value)
                    VALUES ('nested-rolled-back', 'inner')
                  `
                  yield* runtime.admit(rolledBack)
                  return yield* Effect.fail("rollback savepoint")
                }),
              )
              .pipe(Effect.ignore)
          }),
        )

        expect(
          yield* sql<{ row_id: string }>`
          SELECT row_id FROM host_transaction_rows
          WHERE row_id IN ('nested-kept', 'nested-rolled-back')
          ORDER BY row_id
        `,
        ).toEqual([{ row_id: "nested-kept" }])
        expect((yield* runtime.inspect(kept.runId)).status).toBe("queued")
        expect((yield* runtime.inspect(rolledBack.runId).pipe(Effect.flip))._tag).toBe("tenetkit/runtime/RunNotFound")
      }),
    )

    suite.effect("returns the stable public receipt for an idempotent admission in one host transaction", () =>
      Effect.gen(function* () {
        yield* createHostTable
        const sql = yield* SqlClient.SqlClient
        const runtime = yield* Runtime.Runtime
        const input = admission("host-idempotency", "host-idempotency-run")
        const [first, duplicate]: readonly [Run.RunReceipt, Run.RunReceipt] = yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`
              INSERT INTO host_transaction_rows (row_id, value)
              VALUES ('host-idempotency', 'one')
            `
            return [yield* runtime.admit(input), yield* runtime.admit(input)] as const
          }),
        )

        expect(first).toMatchObject({ runId: input.runId, duplicate: false })
        expect(duplicate).toEqual({ ...first, duplicate: true })
        expect(
          yield* sql<{ count: number }>`
          SELECT COUNT(*) AS count FROM host_transaction_rows WHERE row_id = 'host-idempotency'
        `,
        ).toEqual([{ count: 1 }])
      }),
    )

    suite.effect("delivers the Run notification only after the outer host transaction commits", () =>
      Effect.gen(function* () {
        yield* createHostTable
        const sql = yield* SqlClient.SqlClient
        const runtime = yield* Runtime.Runtime
        const input = admission("post-commit-notification", "post-commit-notification-run")
        const notification = yield* watchNotification(input.runId)
        const admitted = yield* Deferred.make<Run.RunReceipt>()
        const release = yield* Deferred.make<void>()
        const transaction = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`
              INSERT INTO host_transaction_rows (row_id, value)
              VALUES ('post-commit-notification', 'pending')
            `
              const receipt = yield* runtime.admit(input)
              yield* Deferred.succeed(admitted, receipt)
              yield* Deferred.await(release)
              return receipt
            }),
          )
          .pipe(Effect.forkScoped({ startImmediately: true }))

        const pendingReceipt = yield* Deferred.await(admitted)
        yield* Effect.sleep("50 millis")
        expect(yield* Deferred.isDone(notification)).toBe(false)
        expect(yield* sql`SELECT row_id FROM host_transaction_rows WHERE row_id = 'post-commit-notification'`).toEqual(
          [],
        )

        yield* Deferred.succeed(release, undefined)
        expect(yield* Fiber.join(transaction)).toEqual(pendingReceipt)
        yield* Deferred.await(notification).pipe(Effect.timeout("2 seconds"))
        expect(
          yield* sql<{ value: string }>`
          SELECT value FROM host_transaction_rows WHERE row_id = 'post-commit-notification'
        `,
        ).toEqual([{ value: "pending" }])
      }),
    )
  })
})

if (!postgresAvailable) {
  it.skip("postgres host transactions skipped: set TENETKIT_DATABASE_URL or DATABASE_URL", () => undefined)
}
