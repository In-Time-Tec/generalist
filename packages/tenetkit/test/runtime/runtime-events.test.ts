import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Option, Stream } from "effect"
import { Cursor, Errors, Runtime, RunStore } from "../../src/runtime/index.js"
import { assistantAddress, completedResult, lagLayer, memoryLayer, textPrompt } from "./helpers.js"

layer(memoryLayer)("Runtime events", (it) => {
  it.effect("replays sequence greater than cursor then follows live", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:events",
        idempotencyKey: "e1",
        prompt: textPrompt("hello"),
      })
      yield* driver.emitAgentEvent({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: 0 },
      })
      const late = yield* runtime
        .events({ runId: receipt.runId, cursor: Cursor.make(1) })
        .pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        result: completedResult("ok"),
      })
      const events = [...(yield* Fiber.join(late))]
      expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "RunCompleted"])
      expect(events.every((event, index, all) => index === 0 || event.sequence > all[index - 1]!.sequence)).toBe(true)
      expect(events.map((event) => event.eventId)).toEqual(events.map((event) => `${receipt.runId}:${event.sequence}`))
    }),
  )

  it.effect("fails typed for a future cursor", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:cursor",
        idempotencyKey: "e1",
        prompt: textPrompt("hello"),
      })
      const error = yield* runtime
        .events({ runId: receipt.runId, cursor: Cursor.make(99) })
        .pipe(Stream.runCollect, Effect.flip)
      expect(error).toBeInstanceOf(Errors.CursorExpired)
    }),
  )

  it.effect("preserves wrapped AgentEvent payloads", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:agent-event",
        idempotencyKey: "e1",
        prompt: textPrompt("hello"),
      })
      yield* driver.emitAgentEvent({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: 3 },
      })
      const event = yield* runtime.events({ runId: receipt.runId, cursor: Cursor.make(1) }).pipe(
        Stream.take(1),
        Stream.runHead,
        Effect.map((value) => Option.getOrThrow(value)),
      )
      expect(event._tag).toBe("TurnStarted")
      if (event._tag === "TurnStarted") {
        expect(event.turn).toBe(3)
        expect(event.specVersion).toBe("1")
        expect(event.runId).toBe(receipt.runId)
      }
    }),
  )
})

layer(lagLayer)("Runtime subscriber lag", (it) => {
  it.effect("fails a lagging follower without blocking the producer", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:lag",
        idempotencyKey: "e1",
        prompt: textPrompt("hello"),
      })
      const releaseSlow = yield* Deferred.make<void>()
      const slowStarted = yield* Deferred.make<void>()
      const slowFiber = yield* runtime.events({ runId: receipt.runId, cursor: Cursor.make(1) }).pipe(
        Stream.tap(() => Deferred.succeed(slowStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseSlow)))),
        Stream.runDrain,
        Effect.flip,
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      yield* driver.emitAgentEvent({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: 0 },
      })
      yield* Deferred.await(slowStarted)
      yield* Effect.yieldNow
      yield* driver.emitAgentEvent({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: 1 },
      })
      yield* driver.emitAgentEvent({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        event: { _tag: "TurnStarted", turn: 2 },
      })
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        result: completedResult("ok"),
      })
      yield* Deferred.succeed(releaseSlow, undefined)
      const slowError = yield* Fiber.join(slowFiber)
      expect(slowError).toBeInstanceOf(Errors.SubscriberLagged)
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
    }),
  )
})
