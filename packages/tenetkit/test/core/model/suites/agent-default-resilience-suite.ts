import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { Agent } from "../../../../src/core/index"

const failure = (reason: Parameters<typeof AiError.make>[0]["reason"]) =>
  AiError.make({ module: "DefaultResilienceTestModel", method: "streamText", reason })

const rateLimit = failure(AiError.RateLimitError.make({}))
const unavailable = failure(AiError.InternalProviderError.make({ description: "provider unavailable" }))
const authentication = failure(AiError.AuthenticationError.make({ kind: "InvalidKey" }))
const invalidRequest = failure(AiError.InvalidRequestError.make({ description: "invalid input" }))

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})

const success = Stream.make(
  Response.makePart("text-delta", { id: "text", delta: "recovered" }),
  Response.makePart("finish", { reason: "stop", usage, response: undefined }),
)

const scriptedModel = (attempt: (calls: number) => Stream.Stream<Response.StreamPartEncoded, AiError.AiError>) => {
  let calls = 0
  const layer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () =>
        Stream.suspend(() => {
          calls += 1
          return attempt(calls)
        }),
    }),
  )
  return { layer, calls: () => calls }
}

const agent = Agent.make({ name: "default-resilience-agent" })
const run = (model: Layer.Layer<LanguageModel.LanguageModel>) =>
  Stream.runCollect(Agent.stream(agent, { prompt: "retry" }).pipe(Stream.provide(model)))

describe("Agent default model resilience", () => {
  it.effect("retries provider 429 and 5xx failures with backoff inside one turn", () =>
    Effect.gen(function* () {
      const model = scriptedModel((calls) => {
        if (calls === 1) return Stream.fail(rateLimit)
        if (calls === 2) return Stream.fail(unavailable)
        return success
      })
      const fiber = yield* run(model.layer).pipe(Effect.forkChild)
      yield* Effect.yieldNow

      expect(model.calls()).toBe(1)
      yield* TestClock.adjust("1999 millis")
      expect(model.calls()).toBe(1)
      yield* TestClock.adjust("1 millis")
      expect(model.calls()).toBe(2)
      yield* TestClock.adjust("4 seconds")
      const events = yield* Fiber.join(fiber)

      expect(model.calls()).toBe(3)
      expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(1)
      expect(events.flatMap((event) => (event._tag === "ModelRetryScheduled" ? [event.delayMillis] : []))).toEqual([
        2_000, 4_000,
      ])
      expect(events.at(-1)).toMatchObject({ _tag: "Completed", text: "recovered" })
    }),
  )

  it.effect("interrupts the default backoff without issuing another provider request", () =>
    Effect.gen(function* () {
      const model = scriptedModel(() => Stream.fail(rateLimit))
      const fiber = yield* run(model.layer).pipe(Effect.forkChild)
      yield* Effect.yieldNow

      expect(model.calls()).toBe(1)
      yield* Fiber.interrupt(fiber)
      yield* TestClock.adjust("30 seconds")
      expect(model.calls()).toBe(1)
    }),
  )

  it.effect("fails with the typed provider cause after the default retry budget is exhausted", () =>
    Effect.gen(function* () {
      const model = scriptedModel(() => Stream.fail(unavailable))
      const fiber = yield* Effect.flip(run(model.layer)).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* TestClock.adjust("6 seconds")
      const finalFailure = yield* Fiber.join(fiber)

      expect(model.calls()).toBe(3)
      expect(finalFailure._tag).toBe("tenetkit/core/AgentError")
      if (finalFailure._tag === "tenetkit/core/AgentError") expect(finalFailure.cause).toBe(unavailable)
    }),
  )

  const expectNoRetry = (terminal: AiError.AiError) =>
    Effect.gen(function* () {
      const model = scriptedModel(() => Stream.fail(terminal))
      const finalFailure = yield* Effect.flip(run(model.layer))

      expect(model.calls()).toBe(1)
      expect(finalFailure._tag).toBe("tenetkit/core/AgentError")
      if (finalFailure._tag === "tenetkit/core/AgentError") expect(finalFailure.cause).toBe(terminal)
    })

  it.effect("does not retry authentication failures", () => expectNoRetry(authentication))
  it.effect("does not retry invalid input failures", () => expectNoRetry(invalidRequest))
})
