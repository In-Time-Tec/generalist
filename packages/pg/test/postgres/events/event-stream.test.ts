import { layer as backendLayer } from "@tenetkit/pg"
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { ExecutableResolver, RunClaims, Runtime, RunStore } from "tenetkit/runtime"
import {
  assistant,
  assistantAddress,
  assistantRef,
  registrationsFor,
  textPrompt,
} from "../../../../tenetkit/test/runtime/execution/fixtures.js"
import { closedTestAgent } from "../../../../tenetkit/test/runtime/run/identity.js"
import { postgresAvailable, postgresDatabase, uniqueSession } from "../database.js"

const describePostgres = postgresAvailable ? describe : describe.skip

const database = postgresDatabase("event-stream")

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

describePostgres("PostgreSQL event stream catch-up", () => {
  it.effect("advances the polling cursor so two subscribers never re-receive boundary events", () =>
    scopedWith(
      database.provision(
        backendLayer({
          url: database.url,
          source: "postgres-event-stream",
          resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
          addresses: [
            { address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) },
          ],
          subscriberQueueCapacity: 8,
          maxConnections: 8,
        }),
      ),
    )(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const receipt = yield* runtime.send({
          to: assistantAddress,
          sessionId: uniqueSession("event-stream"),
          idempotencyKey: "event-stream",
          prompt: textPrompt("hello"),
        })
        const claims = yield* RunClaims.RunClaims
        const [claim] = yield* claims.claimReadyRuns({
          workerId: "event-stream",
          limit: 1,
          lease: "10 seconds",
        })
        if (claim === undefined) return yield* Effect.die("event-stream claim is missing")
        const emit = (turn: number) =>
          store.emitAgentEvent({
            runId: receipt.runId,
            ownerId: claim.workerId,
            attemptFence: claim.attemptFence,
            event: { _tag: "TurnStarted", turn },
          })

        const firstTurn = yield* Deferred.make<void>()
        const secondTurn = yield* Deferred.make<void>()
        const collect = (marker: Deferred.Deferred<void>) =>
          runtime.events({ runId: receipt.runId, cursor: -1 }).pipe(
            Stream.filter((event) => event._tag === "TurnStarted"),
            Stream.tap((event) => (event.turn === 1 ? Deferred.succeed(marker, undefined) : Effect.void)),
            Stream.take(4),
            Stream.runCollect,
            Effect.forkChild({ startImmediately: true }),
          )
        const first = yield* collect(firstTurn)
        const second = yield* collect(secondTurn)

        yield* emit(0)
        yield* emit(1)
        yield* Deferred.await(firstTurn)
        yield* Deferred.await(secondTurn)
        yield* emit(2)
        yield* emit(3)

        const [a, b] = yield* Effect.all([Fiber.join(first), Fiber.join(second)])
        const expected = [0, 1, 2, 3]
        expect([...a].map((event) => event.turn)).toEqual(expected)
        expect([...b].map((event) => event.turn)).toEqual(expected)
      }),
    ),
  )
})
