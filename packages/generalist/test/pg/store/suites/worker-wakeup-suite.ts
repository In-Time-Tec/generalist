import { layer as backendLayer } from "generalist/pg"
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { SqlClient } from "effect/unstable/sql"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { RunClaims } from "generalist/runtime/sql-driver"
import {
  assistant,
  assistantAddress,
  assistantRef,
  registrationsFor,
  textPrompt,
} from "../../../../../generalist/test/runtime/execution/fixtures.js"
import { closedTestAgent } from "../../../../../generalist/test/runtime/run/identity.js"
import { postgresAvailable, postgresDatabase, uniqueSession } from "../../database.js"

const describePostgres = postgresAvailable ? describe : describe.skip
const database = postgresDatabase("worker-wakeup")
const source = "postgres-worker-wakeup"
const applicationName = `generalist-runtime-worker:%:${source}`

const layer = database.provision(
  backendLayer({
    url: database.url,
    source,
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    subscriberQueueCapacity: 8,
    maxConnections: 4,
  }).pipe(
    Layer.provide(
      ExecutableResolver.layerStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]).pipe(
        Layer.orDie,
      ),
    ),
  ),
)

const scopedWith =
  <A, E>(provided: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(provided), (context) => effect.pipe(Effect.provideContext(context))))

describePostgres("PostgreSQL RuntimeWorker wakeups", () => {
  it.effect("emits a startup catch-up before committed Run notifications", () =>
    scopedWith(layer)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const claims = yield* RunClaims
        const listening = yield* Deferred.make<void>()
        const changes = yield* claims.changes.pipe(
          Stream.tap(() => Deferred.succeed(listening, undefined)),
          Stream.take(2),
          Stream.runCollect,
          Effect.forkChild({ startImmediately: true }),
        )

        yield* Deferred.await(listening)
        yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("worker-wakeup"),
          idempotencyKey: "worker-wakeup",
          prompt: textPrompt("wake worker"),
        })

        expect((yield* Fiber.join(changes)).length).toBe(2)
      }),
    ),
  )

  it.effect("surfaces listener loss and reacquires a fresh listener on resubscribe", () =>
    scopedWith(layer)(
      Effect.gen(function* () {
        const claims = yield* RunClaims
        const listening = yield* Deferred.make<void>()
        const listener = yield* claims.changes.pipe(
          Stream.tap(() => Deferred.succeed(listening, undefined)),
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true }),
        )
        yield* Deferred.await(listening)

        const terminated = yield* scopedWith(database.client)(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient
            return yield* sql<{ readonly terminated: boolean }>`
              SELECT pg_terminate_backend(pid) AS terminated
              FROM pg_stat_activity
              WHERE application_name LIKE ${applicationName} AND pid <> pg_backend_pid()
            `
          }),
        )
        expect(terminated.some((row) => row.terminated)).toBe(true)
        yield* TestClock.adjust("1 second")
        expect((yield* Effect.exit(Fiber.join(listener)))._tag).toBe("Failure")

        yield* claims.changes.pipe(Stream.take(1), Stream.runDrain)
      }),
    ),
  )
})
