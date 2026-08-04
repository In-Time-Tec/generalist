import { expect, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { Errors, Run, RunEvent, Runtime, RunStore } from "../src/index.js"
import { assistantAddress, emptyTranscript, memoryLayer, openWait, textPrompt } from "./helpers.js"

layer(memoryLayer)("Runtime inspection contracts", (it) => {
  it.effect("exposes canonical snapshot, finite history, list, and structured wait resolution", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:inspection",
        idempotencyKey: "inspection:1",
        prompt: textPrompt("inspect"),
      })
      yield* store.wait({
        ...(yield* store.claimExecution({ runId: receipt.runId, ownerId: "test" })),
        runId: receipt.runId,
        wait: openWait("wait:inspection"),
      })
      expect((yield* runtime.inspect(receipt.runId)).wait).toEqual(openWait("wait:inspection"))
      yield* runtime.respond({
        runId: receipt.runId,
        waitId: "wait:inspection",
        resolution: { _tag: "ToolResult", result: "accepted", encodedResult: "accepted" },
      })
      const snapshot = yield* runtime.snapshot(receipt.runId)
      expect(snapshot.cursor).toBe(snapshot.run.lastSequence)
      expect(snapshot.run.wait?.resolution?._tag).toBe("ToolResult")
      expect(yield* Run.decodeSnapshot(yield* Run.encodeSnapshot(snapshot))).toEqual(snapshot)
      const history = yield* runtime.history({ runId: receipt.runId, cursor: -1, limit: 2 })
      expect(history).toHaveLength(2)
      const listed = yield* runtime.list({ status: "running", limit: 10 })
      expect(listed.map((run) => run.runId)).toContain(receipt.runId)
    }),
  )

  it.effect("rejects an unknown or malformed producer event", () =>
    Effect.sync(() => {
      const malformed = {
        _tag: "RunWaiting",
        specVersion: "1",
        eventId: "run:0",
        runId: "run",
        sequence: 0,
        agent: { id: "agent", version: "1", digest: "digest" },
        rootRunId: "run",
        occurredAt: "2026-08-03T00:00:00.000Z",
        wait: { waitId: "wait" },
      }
      expect(Schema.is(RunEvent.RunEvent)(malformed)).toBe(false)
    }),
  )

  it.effect("derives raw usage only from canonical attempt events", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:usage",
        idempotencyKey: "usage:1",
        prompt: textPrompt("usage"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "usage-worker" })
      const usage: Response.Usage = {
        inputTokens: { total: 10, uncached: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 4, text: 4, reasoning: 0 },
      }
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "ModelCallStarted",
          deliveryId: "call",
          turn: 0,
          modelCallId: "call:1",
          purpose: "conversation",
          provider: "provider",
          model: "model",
          startedAt: 1,
        },
      })
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "ModelAttemptCompleted",
          deliveryId: "attempt:0",
          turn: 0,
          modelCallId: "call:1",
          modelAttemptId: "attempt:0",
          attempt: 0,
          completedAt: 2,
          usageAt: 2,
          usage,
          finishReason: "stop",
          requestId: "request:1",
        },
      })
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "ModelAttemptFailed",
          deliveryId: "attempt:1",
          turn: 0,
          modelCallId: "call:1",
          modelAttemptId: "attempt:1",
          attempt: 1,
          failedAt: 3,
          category: "provider-response",
          classification: "terminal",
          providerUsage: { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
        },
      })
      yield* store.emitAgentEvent({
        ...claim,
        event: { _tag: "TurnCompleted", turn: 0, transcript: emptyTranscript, usage },
      })
      const snapshot = yield* runtime.snapshot(receipt.runId)
      expect(snapshot.usage.map((fact) => fact._tag)).toEqual(["Completed", "Failed"])
      expect(snapshot.usage[0]).toMatchObject({ provider: "provider", model: "model", requestId: "request:1" })
    }),
  )

  it.effect("rejects conflicting call and compaction lifecycle projections", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:projection-corruption",
        idempotencyKey: "projection-corruption",
        prompt: textPrompt("corrupt"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "projection-corruption" })
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "ModelCallStarted",
          deliveryId: "call:a",
          turn: 0,
          modelCallId: "same-call",
          purpose: "conversation",
          provider: "one",
          startedAt: 1,
        },
      })
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "ModelCallStarted",
          deliveryId: "call:b",
          turn: 0,
          modelCallId: "same-call",
          purpose: "conversation",
          provider: "two",
          startedAt: 1,
        },
      })
      expect(yield* runtime.snapshot(receipt.runId).pipe(Effect.flip)).toBeInstanceOf(Errors.RuntimeUnavailable)

      const second = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:missing-compaction-start",
        idempotencyKey: "missing-compaction-start",
        prompt: textPrompt("corrupt"),
      })
      const secondClaim = yield* store.claimExecution({ runId: second.runId, ownerId: "missing-start" })
      yield* store.emitAgentEvent({
        ...secondClaim,
        event: {
          _tag: "CompactionFailed",
          deliveryId: "failed",
          turn: 0,
          compactionId: "missing",
          failedAt: 1,
        },
      })
      expect(yield* runtime.snapshot(second.runId).pipe(Effect.flip)).toBeInstanceOf(Errors.RuntimeUnavailable)
    }),
  )

  it.effect("requires call-before-attempt ordering and one attempt identity mapping", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const makeRun = (key: string) =>
        runtime.send({
          to: assistantAddress,
          sessionId: `session:${key}`,
          idempotencyKey: key,
          prompt: textPrompt(key),
        })
      const attempt = {
        _tag: "ModelAttemptFailed" as const,
        deliveryId: "attempt",
        turn: 0,
        modelCallId: "call",
        modelAttemptId: "attempt:0",
        attempt: 0,
        failedAt: 2,
        category: "provider-response" as const,
        classification: "terminal" as const,
      }

      const unordered = yield* makeRun("unordered-attempt")
      const unorderedClaim = yield* store.claimExecution({ runId: unordered.runId, ownerId: "unordered" })
      yield* store.emitAgentEvent({ ...unorderedClaim, event: attempt })
      yield* store.emitAgentEvent({
        ...unorderedClaim,
        event: {
          _tag: "ModelCallStarted",
          deliveryId: "call",
          turn: 0,
          modelCallId: "call",
          purpose: "conversation",
          startedAt: 1,
        },
      })
      expect(yield* runtime.snapshot(unordered.runId).pipe(Effect.flip)).toBeInstanceOf(Errors.RuntimeUnavailable)

      const conflicting = yield* makeRun("conflicting-attempt-map")
      const conflictingClaim = yield* store.claimExecution({ runId: conflicting.runId, ownerId: "conflicting" })
      yield* store.emitAgentEvent({
        ...conflictingClaim,
        event: {
          _tag: "ModelCallStarted",
          deliveryId: "call",
          turn: 0,
          modelCallId: "call",
          purpose: "conversation",
          startedAt: 1,
        },
      })
      yield* store.emitAgentEvent({ ...conflictingClaim, event: attempt })
      yield* store.emitAgentEvent({
        ...conflictingClaim,
        event: { ...attempt, deliveryId: "attempt-2", modelAttemptId: "attempt:other" },
      })
      expect(yield* runtime.snapshot(conflicting.runId).pipe(Effect.flip)).toBeInstanceOf(Errors.RuntimeUnavailable)
    }),
  )

  it.effect("accepts one compaction failure and rejects a terminal turn mismatch", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:failed-compaction",
        idempotencyKey: "failed-compaction",
        prompt: textPrompt("compact"),
      })
      const claim = yield* store.claimExecution({ runId: receipt.runId, ownerId: "failed-compaction" })
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "CompactionStarted",
          deliveryId: "started",
          turn: 3,
          compactionId: "compaction",
          trigger: "threshold",
          startedAt: 1,
        },
      })
      yield* store.emitAgentEvent({
        ...claim,
        event: {
          _tag: "CompactionFailed",
          deliveryId: "failed",
          turn: 3,
          compactionId: "compaction",
          failedAt: 2,
        },
      })
      expect((yield* runtime.snapshot(receipt.runId)).compactions.map((item) => item._tag)).toEqual(["Failed"])

      const mismatch = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:mismatched-compaction",
        idempotencyKey: "mismatched-compaction",
        prompt: textPrompt("compact"),
      })
      const mismatchClaim = yield* store.claimExecution({ runId: mismatch.runId, ownerId: "mismatch" })
      yield* store.emitAgentEvent({
        ...mismatchClaim,
        event: {
          _tag: "CompactionStarted",
          deliveryId: "started",
          turn: 3,
          compactionId: "compaction",
          trigger: "threshold",
          startedAt: 1,
        },
      })
      yield* store.emitAgentEvent({
        ...mismatchClaim,
        event: {
          _tag: "CompactionFailed",
          deliveryId: "failed",
          turn: 4,
          compactionId: "compaction",
          failedAt: 2,
        },
      })
      expect(yield* runtime.snapshot(mismatch.runId).pipe(Effect.flip)).toBeInstanceOf(Errors.RuntimeUnavailable)
    }),
  )
})
