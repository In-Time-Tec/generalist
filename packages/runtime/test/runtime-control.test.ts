import { expect, layer } from "@effect/vitest"
import { Effect, Option, Stream } from "effect"
import { Errors, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, completedResult, memoryLayer, openWait, suspension, textPrompt } from "./helpers.js"

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
      yield* driver.suspend({
        ...(yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        wait: openWait("wait:1"),
        suspension: suspension("wait:1"),
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
      const claim = yield* driver.claimExecution({ runId: receipt.runId, ownerId: "test" })
      const operation = yield* driver.recordOperation({
        ...claim,
        operationKey: "tool:unknown",
        kind: "tool",
        inputDigest: "unknown",
        input: {},
        replayPolicy: "never",
        attempt: claim.attempt,
      })
      yield* driver.startOperation({ ...claim, operationId: operation.operationId })
      yield* driver.completeOperation({
        ...claim,
        operationId: operation.operationId,
        outcome: { _tag: "Unknown" },
        checkpoint: {
          driverVersion: "1",
          executable: claim.executableRef,
          turn: 0,
          budget: { allocation: {}, remaining: {}, depth: 0 },
          state: {},
        },
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
        expect(event.operationId).toBe(operation.operationId)
      }
      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: operation.operationId,
        idempotencyKey: "retry:unknown",
        resolution: { _tag: "Retry" },
      })
      expect((yield* driver.getOperation({ runId: receipt.runId, operationId: operation.operationId })).status).toBe(
        "requested",
      )
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("running")
    }),
  )

  it.effect("resolves an expired non-replayable operation exactly once", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:resolve-operation",
        idempotencyKey: "send",
        prompt: textPrompt("hello"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "worker:one" })
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey: "tool:non-replayable",
        kind: "tool",
        inputDigest: "digest",
        input: { call: "once" },
        replayPolicy: "never",
        attempt: claim.attempt,
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId })
      yield* store.expireRunningOperation({ ...claim, operationId: operation.operationId })
      expect((yield* runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
      expect(
        (yield* store.claimExecution({ runId: receipt.runId, ownerId: "worker:two" }).pipe(Effect.flip))._tag,
      ).toBe("@batonfx/runtime/RuntimeUnavailable")

      const resolution = { _tag: "Succeeded" as const, value: { answer: 42, source: { kind: "manual", rank: 1 } } }
      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: operation.operationId,
        idempotencyKey: "resolution:one",
        resolution: {
          _tag: "Succeeded",
          value: { source: { rank: 1, kind: "manual" }, answer: 42 },
        },
      })
      yield* runtime.resolveOperation({
        runId: receipt.runId,
        operationId: operation.operationId,
        idempotencyKey: "resolution:one",
        resolution,
      })
      const conflict = yield* runtime
        .resolveOperation({
          runId: receipt.runId,
          operationId: operation.operationId,
          idempotencyKey: "resolution:one",
          resolution: {
            _tag: "Succeeded",
            value: { answer: 43, source: { kind: "manual", rank: 1 } },
          },
        })
        .pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(Errors.OperationResolutionConflict)

      const resumed = yield* store.claimExecution({ runId: receipt.runId, ownerId: "worker:two" })
      const replayed = yield* store.recordOperation({
        ...resumed,
        operationKey: "tool:non-replayable",
        kind: "tool",
        inputDigest: "digest",
        input: { call: "once" },
        replayPolicy: "never",
        attempt: resumed.attempt,
      })
      expect(replayed.status).toBe("succeeded")
      expect(replayed.result).toEqual({ answer: 42, source: { kind: "manual", rank: 1 } })
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
