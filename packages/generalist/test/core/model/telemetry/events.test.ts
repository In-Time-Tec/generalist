import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
import { AiError, Response } from "effect/unstable/ai"
import { ModelStreamTermination, ModelTelemetry } from "../../../../src/index.js"

const aiError = (reason: AiError.AiError["reason"]): AiError.AiError =>
  AiError.make({ module: "TestLanguageModel", method: "streamText", reason })

const usage = (): Response.Usage =>
  Response.Usage.make({
    inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 2, text: 2, reasoning: undefined },
  })

describe("ModelTelemetry", () => {
  it("maps model failures onto the bounded cross-provider categories", () => {
    expect(
      ModelTelemetry.classifyFailureCategory(aiError(AiError.AuthenticationError.make({ kind: "InvalidKey" }))),
    ).toBe("authentication")
    expect(ModelTelemetry.classifyFailureCategory(aiError(AiError.RateLimitError.make({})))).toBe("rate-limit")
    expect(ModelTelemetry.classifyFailureCategory(aiError(AiError.QuotaExhaustedError.make({})))).toBe("token-budget")
    expect(
      ModelTelemetry.classifyFailureCategory(
        aiError(AiError.InternalProviderError.make({ description: "provider exploded" })),
      ),
    ).toBe("provider-response")
    expect(
      ModelTelemetry.classifyFailureCategory(aiError(AiError.InvalidOutputError.make({ description: "bad json" }))),
    ).toBe("stream-decode")
    expect(
      ModelTelemetry.classifyFailureCategory(
        aiError(AiError.ToolParameterValidationError.make({ toolName: "echo", toolParams: {}, description: "bad" })),
      ),
    ).toBe("invalid-tool-call")
    expect(ModelTelemetry.classifyFailureCategory(aiError(AiError.UnknownError.make({})))).toBe("unknown")
    expect(ModelTelemetry.classifyFailureCategory(new Cause.TimeoutError())).toBe("timeout")
    expect(ModelTelemetry.classifyFailureCategory(new Error("plain"))).toBe("unknown")
    expect(
      ModelTelemetry.classifyFailureCategory(
        ModelStreamTermination.Truncated.make({ turn: 0, emitted: { _tag: "Nothing" } }),
      ),
    ).toBe("truncated-stream")
    expect(
      ModelTelemetry.classifyFailureCategory(
        ModelStreamTermination.Timeout.make({
          turn: 0,
          emitted: { _tag: "Nothing" },
          idleMillis: 120000,
        }),
      ),
    ).toBe("timeout")
  })

  it("decodes every lifecycle event through the closed Event union", () => {
    const decode = Schema.decodeUnknownSync(ModelTelemetry.Event)
    const payloads: ReadonlyArray<ModelTelemetry.EventPayload> = [
      {
        _tag: "ModelCallStarted",
        turn: 0,
        modelCallId: "call-1",
        purpose: "conversation",
        provider: "test-provider",
        model: "test-model",
        startedAt: 1,
      },
      {
        _tag: "ModelAttemptStarted",
        turn: 0,
        modelCallId: "call-1",
        modelAttemptId: "attempt-1",
        attempt: 0,
        startedAt: 2,
      },
      {
        _tag: "ModelAttemptFirstOutput",
        turn: 0,
        modelCallId: "call-1",
        modelAttemptId: "attempt-1",
        attempt: 0,
        kind: "text",
        at: 3,
      },
      {
        _tag: "ModelAttemptFailed",
        turn: 0,
        modelCallId: "call-1",
        modelAttemptId: "attempt-1",
        attempt: 0,
        failedAt: 4,
        category: "rate-limit",
        classification: "transient",
        disposition: "retry",
        providerUsage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
      },
      {
        _tag: "ModelRetryScheduled",
        turn: 0,
        modelCallId: "call-1",
        attempt: 0,
        reason: "provider-resilience",
        category: "rate-limit",
        delayMillis: 100,
        at: 4,
      },
      {
        _tag: "ModelAttemptCompleted",
        turn: 0,
        modelCallId: "call-1",
        modelAttemptId: "attempt-2",
        attempt: 1,
        completedAt: 5,
        usage: usage(),
        usageAt: 5,
        finishReason: "stop",
        requestId: "req-1",
        responseModel: "returned-model",
      },
      {
        _tag: "ModelCallCompleted",
        turn: 0,
        modelCallId: "call-1",
        purpose: "conversation",
        attempts: 2,
        completedAt: 5,
        failedAttemptUsage: { totalTokens: 10 },
      },
      {
        _tag: "ModelCallFailed",
        turn: 1,
        modelCallId: "call-2",
        purpose: "structured-output",
        attempts: 1,
        failedAt: 6,
        category: "authentication",
        classification: "terminal",
        failedAttemptUsage: { inputTokens: 2, outputTokens: 1 },
      },
      {
        _tag: "CompactionStarted",
        turn: 2,
        compactionId: "compaction-1",
        trigger: "threshold",
        startedAt: 7,
        contextTokensBefore: 900,
        entriesBefore: 12,
      },
      {
        _tag: "CompactionApplied",
        turn: 2,
        compactionId: "compaction-1",
        kind: "summarize",
        checkpointId: "checkpoint-1",
        appliedAt: 8,
        commit: { compactionId: "compaction-1", checkpointId: "checkpoint-1", summaryModelCallId: "call-3" },
      },
      { _tag: "CompactionFailed", turn: 3, compactionId: "compaction-2", failedAt: 9 },
    ]

    for (const [index, payload] of payloads.entries()) {
      const event: ModelTelemetry.Event = { ...payload, deliveryId: `run:${index}` }
      expect(decode(event)).toEqual(event)
    }
  })

  it("keeps absent correlation and provider fields absent instead of zero", () => {
    const decode = Schema.decodeUnknownSync(ModelTelemetry.Event)
    const decoded = decode({
      _tag: "ModelAttemptCompleted",
      deliveryId: "run:0",
      turn: 0,
      modelCallId: "call-1",
      modelAttemptId: "attempt-1",
      attempt: 0,
      completedAt: 1,
      usage: usage(),
      usageAt: 1,
      finishReason: "stop",
    })

    expect("requestId" in decoded).toBe(false)
    expect("responseModel" in decoded).toBe(false)
    expect("serviceTier" in decoded).toBe(false)
    expect("cost" in decoded).toBe(false)
  })

  it("rejects a completed attempt that carries no provider finish", () => {
    const decode = Schema.decodeUnknownOption(ModelTelemetry.Event)
    const withoutFinish = {
      _tag: "ModelAttemptCompleted",
      deliveryId: "run:0",
      turn: 0,
      modelCallId: "call-1",
      modelAttemptId: "attempt-1",
      attempt: 0,
      completedAt: 1,
    }

    expect(decode(withoutFinish)._tag).toBe("None")
    expect(decode({ ...withoutFinish, usage: usage(), usageAt: 1 })._tag).toBe("None")
    expect(decode({ ...withoutFinish, usage: usage(), finishReason: "stop" })._tag).toBe("None")
    expect(decode({ ...withoutFinish, usageAt: 1, finishReason: "stop" })._tag).toBe("None")
    expect(decode({ ...withoutFinish, usage: usage(), usageAt: 1, finishReason: "stop" })._tag).toBe("Some")
  })

  it("bounds provider-reported failed-attempt usage to non-negative safe integers", () => {
    const decode = Schema.decodeUnknownOption(ModelTelemetry.ProviderUsage)

    expect(decode({ totalTokens: 10 })._tag).toBe("Some")
    expect(decode({ inputTokens: 7, outputTokens: 3 })._tag).toBe("Some")
    expect(decode({})._tag).toBe("Some")
    for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(decode({ totalTokens: invalid })._tag).toBe("None")
    }
  })

  it("rejects a failed call that carries no classification", () => {
    const decode = Schema.decodeUnknownOption(ModelTelemetry.Event)
    const withoutClassification = {
      _tag: "ModelCallFailed",
      deliveryId: "run:0",
      turn: 0,
      modelCallId: "call-1",
      purpose: "conversation",
      attempts: 1,
      failedAt: 1,
      category: "truncated-stream",
    }

    expect(decode(withoutClassification)._tag).toBe("None")
    expect(decode({ ...withoutClassification, classification: "transient" })._tag).toBe("Some")
  })

  it("rejects unbounded categories and negative attempt ordinals", () => {
    const decode = Schema.decodeUnknownOption(ModelTelemetry.Event)
    expect(
      decode({
        _tag: "ModelCallFailed",
        turn: 0,
        modelCallId: "call-1",
        purpose: "conversation",
        attempts: 1,
        failedAt: 1,
        category: "provider-error-body",
        classification: "terminal",
      })._tag,
    ).toBe("None")
    expect(
      decode({
        _tag: "ModelAttemptStarted",
        turn: 0,
        modelCallId: "call-1",
        modelAttemptId: "attempt-1",
        attempt: -1,
        startedAt: 1,
      })._tag,
    ).toBe("None")
  })

  it.effect("defaults the current purpose to conversation", () =>
    Effect.gen(function* () {
      const purpose = yield* ModelTelemetry.CurrentPurpose
      const compactionId = yield* ModelTelemetry.CurrentCompactionId
      const instrumentation = yield* ModelTelemetry.CurrentInstrumentation

      expect(purpose).toBe("conversation")
      expect(compactionId).toBeUndefined()
      expect(instrumentation).toBeUndefined()
    }),
  )
})
