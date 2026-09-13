import "../suites/send-attestation-suite.js"
import { expect, layer } from "@effect/vitest"
import { DateTime, Effect, Stream } from "effect"
import { Address, Errors } from "../../../../../src/runtime/index.js"
import * as Runtime from "../../../../../src/runtime/engine.js"
import { RunStore } from "../../../../../src/runtime/run/store.js"
import { DurabilityFailure } from "../../../../../src/durability/errors.js"
import { assistantAddress, completedResult, objectLayer, textPrompt } from "../../../execution/fixtures.js"
import { objectWorkerId } from "../../../execution/object.js"

const nonJsonMetadata = { a: 0 }
Reflect.set(nonJsonMetadata, "a", DateTime.toDate(DateTime.makeUnsafe(0)))

layer(objectLayer)("Runtime send", (it) => {
  it.effect("admits a message and starts the lane head", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore
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
      expect(inspection.durability).toBe("durable")
      expect(yield* store.info).toEqual({ durability: "durable", backend: "object", multiWorker: true })
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

  it.effect("fails typed for non-JSON metadata", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime
        .send({
          to: assistantAddress,
          sessionId: "session:metadata",
          idempotencyKey: "metadata",
          prompt: textPrompt("hello"),
          metadata: nonJsonMetadata,
        })
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(DurabilityFailure)
      expect(error).toMatchObject({ reason: "encoding" })
    }),
  )

  it.effect("completes through the test driver", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:1",
        idempotencyKey: "k1",
        prompt: "hello",
      })
      const claim = yield* driver.claimExecution({
        commandId: `${receipt.runId}:complete:claim`,
        runId: receipt.runId,
        ownerId: objectWorkerId,
      })
      yield* driver.complete({
        commandId: `${receipt.runId}:complete`,
        ...claim,
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
