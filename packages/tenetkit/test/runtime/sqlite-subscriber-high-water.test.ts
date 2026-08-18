import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { Errors, ExecutableResolver, Runtime, RunStore } from "../../src/runtime/index.js"
import { assistant, assistantAddress, assistantRef, registrationsFor, textPrompt } from "./helpers.js"
import { closedTestAgent } from "./identity.js"
import { tempDbPath } from "./sqlite-helpers.js"

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

const highWaterLayer = (capacity: number) =>
  Runtime.layerSqlite({
    filename: tempDbPath(`subscriber-high-water-${capacity}`),
    resolver: ExecutableResolver.makeStatic([{ executable: assistantRef, agent: closedTestAgent(assistant) }]),
    addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    subscriberQueueCapacity: capacity,
  })

it.effect("replays a base larger than the bounded subscriber queue and follows live without lag", () =>
  scopedWith(highWaterLayer(2))(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:subscriber-high-water",
        idempotencyKey: "subscriber-high-water",
        prompt: textPrompt("hello"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "test" })
      const replayBase = 60
      for (let turn = 0; turn < replayBase; turn++) {
        yield* store.emitAgentEvent({ ...claim, runId: receipt.runId, event: { _tag: "TurnStarted", turn } })
      }
      const subscriber = yield* runtime
        .events({ runId: receipt.runId, cursor: -1 })
        .pipe(Stream.take(replayBase + 4), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
      yield* store.emitAgentEvent({
        ...claim,
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: replayBase },
      })
      yield* store.emitAgentEvent({
        ...claim,
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: replayBase + 1 },
      })
      const events = yield* Fiber.join(subscriber)

      const started = [...events].filter((event) => event._tag === "TurnStarted")
      expect(started).toHaveLength(replayBase + 2)
      expect(started.map((event) => event.turn)).toEqual(Array.from({ length: replayBase + 2 }, (_, index) => index))
      expect([...events].every((event, index, all) => index === 0 || event.sequence > all[index - 1]!.sequence)).toBe(
        true,
      )
    }),
  ),
)

it.effect("fails a follower whose live queue overflows while the producer stays unblocked", () =>
  scopedWith(highWaterLayer(1))(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:subscriber-lag",
        idempotencyKey: "subscriber-lag",
        prompt: textPrompt("hello"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "test" })
      const slowStarted = yield* Deferred.make<void>()
      const releaseSlow = yield* Deferred.make<void>()
      const slow = yield* runtime.events({ runId: receipt.runId, cursor: -1 }).pipe(
        Stream.tap(() => Deferred.succeed(slowStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseSlow)))),
        Stream.runDrain,
        Effect.flip,
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      for (let turn = 0; turn < 3; turn++) {
        yield* store.emitAgentEvent({ ...claim, runId: receipt.runId, event: { _tag: "TurnStarted", turn } })
      }
      yield* Deferred.await(slowStarted)
      yield* Effect.yieldNow
      yield* store.emitAgentEvent({ ...claim, runId: receipt.runId, event: { _tag: "TurnStarted", turn: 3 } })
      yield* store.emitAgentEvent({ ...claim, runId: receipt.runId, event: { _tag: "TurnStarted", turn: 4 } })
      yield* Deferred.succeed(releaseSlow, undefined)
      const error = yield* Fiber.join(slow)
      expect(error).toBeInstanceOf(Errors.SubscriberLagged)
    }),
  ),
)
