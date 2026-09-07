import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Stream } from "effect"
import { Errors, Runtime, RunStore } from "../../../../src/runtime/index.js"
import { assistantAddress, assistantRef, registrationsFor, resolverLayer, textPrompt } from "../../execution/fixtures.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../../execution/object.js"

const scopedWith =
  <A, E>(layer: Layer.Layer<A, E, never>) =>
  <B, E2, R2 extends A>(effect: Effect.Effect<B, E2, R2>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

const highWaterLayer = (capacity: number) =>
  objectRuntimeLayer(
    {
      addresses: [{ address: assistantAddress, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
      scheduler: { pollInterval: "1 hour" },
      subscriberQueueCapacity: capacity,
    },
    makeObjectStorage(),
  ).pipe(Layer.provide(resolverLayer))

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
      const claim = yield* store.claimExecution({
        commandId: "subscriber-high-water:claim",
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      const replayBase = 300
      for (let turn = 0; turn < replayBase; turn++) {
        yield* store.emitAgentEvent({
          commandId: `subscriber-high-water:event:${turn}`,
          ...claim,
          runId: receipt.runId,
          event: { _tag: "TurnStarted", turn },
        })
      }
      const subscriber = yield* runtime
        .events({ runId: receipt.runId, cursor: -1 })
        .pipe(Stream.take(replayBase + 4), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
      yield* store.emitAgentEvent({
        commandId: "subscriber-high-water:event:300",
        ...claim,
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: replayBase },
      })
      yield* store.emitAgentEvent({
        commandId: "subscriber-high-water:event:301",
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

it.effect("replays a rewound host Session from retained durable history", () =>
  scopedWith(highWaterLayer(16))(
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const sessionId = "session:rewound-replay"
      yield* runtime.createSession({ id: sessionId })
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId,
        idempotencyKey: "rewound-replay",
        prompt: textPrompt("hello"),
      })
      const claim = yield* store.claimExecution({
        commandId: "subscriber-rewound:claim-before",
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      yield* store.emitAgentEvent({
        commandId: "subscriber-rewound:event-before",
        ...claim,
        event: { _tag: "TurnStarted", turn: 0 },
      })
      const before = yield* runtime.sessionEvents({ sessionId }).pipe(
        Stream.takeUntil(({ event }) => event._tag === "TurnStarted"),
        Stream.runCollect,
      )
      const oldCursor = before.at(-1)!.cursor
      yield* store.rewind({ runId: receipt.runId, branchRunId: "retained-replay", toSequence: 0 })
      const replayed = yield* Deferred.make<void>()
      const follower = yield* runtime.sessionEvents({ sessionId }).pipe(
        Stream.tap(() => Deferred.succeed(replayed, undefined)),
        Stream.takeUntil(({ event }) => event._tag === "TurnStarted" && event.turn === 999),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Deferred.await(replayed)
      const resumed = yield* runtime.sessionEvents({ sessionId, cursor: oldCursor }).pipe(
        Stream.takeUntil(({ event }) => event._tag === "TurnStarted" && event.turn === 999),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      const runFollower = yield* runtime.events({ runId: receipt.runId }).pipe(
        Stream.takeUntil((event) => event._tag === "TurnStarted" && event.turn === 999),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      yield* store.activate({ commandId: "subscriber-rewound:activate", runId: receipt.runId })
      const nextClaim = yield* store.claimExecution({
        commandId: "subscriber-rewound:claim-after",
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      yield* store.emitAgentEvent({
        commandId: "subscriber-rewound:event-after",
        ...nextClaim,
        event: { _tag: "TurnStarted", turn: 999 },
      })
      const entries = yield* Fiber.join(follower)
      expect(entries.map((entry) => entry.cursor)).toEqual([0, 1, 2, 3, 4, 5])
      expect(entries[3]?.event._tag).toBe("RunRewound")
      expect(entries[4]?.event._tag).toBe("RunAttemptStarted")
      expect(entries[5]?.event._tag).toBe("TurnStarted")
      expect(yield* Fiber.join(resumed)).toEqual(entries.filter((entry) => entry.cursor > oldCursor))
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
      const claim = yield* store.claimExecution({
        commandId: "subscriber-lag:claim",
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
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
        yield* store.emitAgentEvent({
          commandId: `subscriber-lag:event:${turn}`,
          ...claim,
          runId: receipt.runId,
          event: { _tag: "TurnStarted", turn },
        })
      }
      yield* Deferred.await(slowStarted)
      yield* Effect.yieldNow
      yield* store.emitAgentEvent({
        commandId: "subscriber-lag:event:3",
        ...claim,
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: 3 },
      })
      yield* store.emitAgentEvent({
        commandId: "subscriber-lag:event:4",
        ...claim,
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: 4 },
      })
      yield* Deferred.succeed(releaseSlow, undefined)
      const error = yield* Fiber.join(slow)
      expect(error).toBeInstanceOf(Errors.SubscriberLagged)
    }),
  ),
)
