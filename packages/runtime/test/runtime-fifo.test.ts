import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { Runtime, RunStore } from "../src/index.js"
import { assistantAddress, completedResult, memoryLayer, openWait, textPrompt } from "./helpers.js"

layer(memoryLayer)("Runtime FIFO lanes", (it) => {
  it.effect("keeps only the lane head runnable until it settles", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fifo",
        idempotencyKey: "a",
        prompt: textPrompt("one"),
      })
      const second = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:fifo",
        idempotencyKey: "b",
        prompt: textPrompt("two"),
      })
      expect((yield* runtime.inspect(first.runId)).status).toBe("running")
      expect((yield* runtime.inspect(second.runId)).status).toBe("queued")
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: first.runId, ownerId: "test" })),
        runId: first.runId,
        result: completedResult("one"),
      })
      expect((yield* runtime.inspect(first.runId)).status).toBe("succeeded")
      expect((yield* runtime.inspect(second.runId)).status).toBe("running")
      expect(second.acceptedSequence).toBe(1)
    }),
  )

  it.effect("keeps successors pending across waits on the lane head", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:wait",
        idempotencyKey: "a",
        prompt: textPrompt("one"),
      })
      const second = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:wait",
        idempotencyKey: "b",
        prompt: textPrompt("two"),
      })
      yield* driver.wait({
        ...(yield* driver.claimExecution({ runId: first.runId, ownerId: "test" })),
        runId: first.runId,
        wait: openWait("approval:1", "approval"),
      })
      expect((yield* runtime.inspect(first.runId)).status).toBe("waiting")
      expect((yield* runtime.inspect(second.runId)).status).toBe("queued")
      yield* runtime.respond({ runId: first.runId, waitId: "approval:1", resolution: { _tag: "Approved" } })
      expect((yield* runtime.inspect(first.runId)).status).toBe("running")
      expect((yield* runtime.inspect(second.runId)).status).toBe("queued")
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: first.runId, ownerId: "test" })),
        runId: first.runId,
        result: completedResult("one"),
      })
      expect((yield* runtime.inspect(second.runId)).status).toBe("running")
    }),
  )

  it.effect("lets cancel bypass the FIFO lane", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:cancel",
        idempotencyKey: "a",
        prompt: textPrompt("one"),
      })
      const second = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:cancel",
        idempotencyKey: "b",
        prompt: textPrompt("two"),
      })
      yield* runtime.cancel({ runId: second.runId, reason: "client-cancel" })
      expect((yield* runtime.inspect(second.runId)).status).toBe("cancelled")
      expect((yield* runtime.inspect(first.runId)).status).toBe("running")
      const secondInspection = yield* runtime.inspect(second.runId)
      const secondTags = yield* runtime.events({ runId: second.runId }).pipe(
        Stream.take(secondInspection.lastSequence + 1),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(secondTags).toContain("RunCancellationRequested")
      expect(secondTags.at(-1)).toBe("RunCancelled")
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: first.runId, ownerId: "test" })),
        runId: first.runId,
        result: completedResult("one"),
      })
    }),
  )

  it.effect("lets signal bypass the FIFO lane for a waiting head", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const first = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:signal",
        idempotencyKey: "a",
        prompt: textPrompt("one"),
      })
      yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:signal",
        idempotencyKey: "b",
        prompt: textPrompt("two"),
      })
      yield* driver.wait({
        ...(yield* driver.claimExecution({ runId: first.runId, ownerId: "test" })),
        runId: first.runId,
        wait: openWait("timer:1", "timer"),
      })
      const follower = yield* runtime
        .events({ runId: first.runId })
        .pipe(Stream.take(4), Stream.runCollect, Effect.forkChild)
      yield* runtime.signal({ runId: first.runId, name: "timer:1" })
      const events = [...(yield* Fiber.join(follower))]
      expect(events.map((event) => event._tag)).toContain("RunResumed")
      expect((yield* runtime.inspect(first.runId)).status).toBe("running")
    }),
  )
})
