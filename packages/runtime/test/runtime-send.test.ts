import { expect, layer } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { Address, Errors, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, completedResult, memoryLayer, textPrompt } from "./helpers.js"

layer(memoryLayer)("Runtime send", (it) => {
  it.effect("admits a message and starts the lane head", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "k1",
        prompt: textPrompt("hello"),
      })
      expect(receipt.duplicate).toBe(false)
      expect(receipt.acceptedSequence).toBe(0)
      const inspection = yield* runtime.inspect(receipt.runId)
      expect(inspection.status).toBe("running")
      expect(inspection.durability).toBe("volatile")
      expect((yield* store.info).durability).toBe("volatile")
      const tags = yield* runtime.events({ runId: receipt.runId }).pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(tags).toEqual(["RunAccepted", "RunAttemptStarted"])
    }),
  )

  it.effect("fails typed for unknown addresses", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime
        .send({
          to: Address.make("agent:missing"),
          sessionId: "session:1",
          idempotencyKey: "k1",
          prompt: "hello",
        })
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.AddressNotFound)
    }),
  )

  it.effect("completes through the test driver", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "k1",
        prompt: "hello",
      })
      yield* driver.complete({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        result: completedResult("done"),
      })
      const inspection = yield* runtime.inspect(receipt.runId)
      expect(inspection.status).toBe("succeeded")
      const tags = yield* runtime.events({ runId: receipt.runId }).pipe(
        Stream.take(inspection.lastSequence + 1),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(tags.at(-1)).toBe("RunCompleted")
    }),
  )
})
