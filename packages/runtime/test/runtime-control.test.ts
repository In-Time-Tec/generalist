import { expect, layer } from "@effect/vitest"
import { Effect, Option, Stream } from "effect"
import { Errors, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, completedResult, memoryLayer, openWait, textPrompt } from "./helpers.js"

layer(memoryLayer)("Runtime control and terminals", (it) => {
  it.effect("enforces first-terminal-wins for complete after cancel", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:terminal",
        idempotencyKey: "t1",
        prompt: textPrompt("hello"),
      })
      const claim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
      yield* runtime.cancel({ runId: receipt.runId, reason: "stop" })
      expect(yield* driver.complete({ ...claim, result: completedResult("too-late") })).toEqual({ _tag: "Completed" })
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
      const inspection = yield* runtime.inspect(receipt.runId)
      const tags = yield* runtime.events({ runId: receipt.runId }).pipe(
        Stream.take(inspection.lastSequence + 1),
        Stream.runCollect,
        Effect.map((chunk) => [...chunk].map((event) => event._tag)),
      )
      expect(tags.filter((tag) => tag === "RunCancelled" || tag === "RunCompleted" || tag === "RunFailed")).toEqual([
        "RunCancelled",
      ])
      expect(tags).toContain("RunCancellationRequested")
    }),
  )

  it.effect("rejects a second respond for the same wait", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:respond",
        idempotencyKey: "t1",
        prompt: textPrompt("hello"),
      })
      yield* driver.wait({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        wait: openWait("wait:1"),
      })
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait:1",
        resolution: { _tag: "ToolResult", result: "one", encodedResult: "one" },
      })
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait:1",
        resolution: { _tag: "ToolResult", result: "one", encodedResult: "one" },
      })
      const error = yield* runtime
        .respond({
          runId: receipt.runId,
          waitId: "wait:1",
          resolution: { _tag: "ToolResult", result: "two", encodedResult: "two" },
        })
        .pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.ResponseConflict)
    }),
  )

  it.effect("marks unknown operations without inventing a second payload vocabulary", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const driver = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:unknown",
        idempotencyKey: "t1",
        prompt: textPrompt("hello"),
      })
      yield* driver.markOperationUnknown({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        operationId: "op:1",
      })
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
      const inspection = yield* runtime.inspect(receipt.runId)
      const event = yield* runtime.events({ runId: receipt.runId }).pipe(
        Stream.take(inspection.lastSequence + 1),
        Stream.filter((item) => item._tag === "OperationUnknown"),
        Stream.runHead,
        Effect.map((value) => Option.getOrThrow(value)),
      )
      expect(event._tag).toBe("OperationUnknown")
      if (event._tag === "OperationUnknown") {
        expect(event.operationId).toBe("op:1")
      }
    }),
  )

  it.effect("fails typed when inspecting a missing run", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const error = yield* runtime.inspect("run_missing").pipe(Effect.flip)
      expect(error).toBeInstanceOf(Errors.RunNotFound)
    }),
  )
})
