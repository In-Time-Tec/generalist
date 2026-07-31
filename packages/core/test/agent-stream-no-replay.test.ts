import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Schedule, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { Agent, ModelResilience } from "../src/index"
import { withProviderFinish } from "./provider-finish"

const rateLimit = AiError.make({
  module: "NoReplayTestLanguageModel",
  method: "streamText",
  reason: AiError.RateLimitError.make({}),
})

const scriptedModel = (streams: Array<Stream.Stream<Response.StreamPartEncoded, AiError.AiError>>) => {
  let attempts = 0
  const layer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () =>
        Stream.suspend(() => {
          const script = streams[Math.min(attempts, streams.length - 1)]!
          attempts += 1
          return script
        }),
    }),
  )
  return { layer, attempts: () => attempts }
}

const textThenFail = Stream.make(
  Response.makePart("text-delta", { id: "text", delta: "partial " }) as Response.StreamPartEncoded,
).pipe(Stream.concat(Stream.fail(rateLimit)))

const reasoningThenFail = Stream.make(
  Response.makePart("reasoning-delta", { id: "reasoning", delta: "thinking" }) as Response.StreamPartEncoded,
).pipe(Stream.concat(Stream.fail(rateLimit)))

const toolParamsThenFail = Stream.make(
  Response.makePart("tool-params-start", {
    id: "call-1",
    name: "write",
    providerExecuted: false,
  }) as Response.StreamPartEncoded,
  Response.makePart("tool-params-delta", { id: "call-1", delta: '{"path"' }) as Response.StreamPartEncoded,
).pipe(Stream.concat(Stream.fail(rateLimit)))

const inBandTextThenFail = Stream.make(
  Response.makePart("text-delta", { id: "text", delta: "partial " }) as Response.StreamPartEncoded,
  Response.makePart("error", { error: rateLimit }) as Response.StreamPartEncoded,
)

const invalidToolCall = AiError.make({
  module: "NoReplayTestLanguageModel",
  method: "streamText",
  reason: AiError.InvalidOutputError.make({ description: "tool arguments were not valid JSON" }),
})

const healthy = withProviderFinish(
  Stream.make(Response.makePart("text-delta", { id: "text", delta: "recovered" }) as Response.StreamPartEncoded),
)

const resilience = ModelResilience.layer({ retrySchedule: Schedule.recurs(3) })

const agent = Agent.make({ name: "no-replay-agent" })

const runAgent = (
  model: Layer.Layer<LanguageModel.LanguageModel>,
  policy: Layer.Layer<ModelResilience.ModelResilience, ModelResilience.ModelResilienceMisconfigured> = resilience,
) =>
  Stream.runCollect(
    Agent.stream(agent, { prompt: "no replay" }).pipe(Stream.provide(Layer.mergeAll(model, policy.pipe(Layer.orDie)))),
  )

const expectTerminalWithoutReplay = (first: Stream.Stream<Response.StreamPartEncoded, AiError.AiError>) =>
  Effect.gen(function* () {
    const model = scriptedModel([first, healthy])
    const fiber = yield* Effect.flip(runAgent(model.layer)).pipe(Effect.forkChild)
    yield* Effect.yieldNow
    yield* TestClock.adjust("10 seconds")
    const failure = yield* Fiber.join(fiber)

    expect(model.attempts()).toBe(1)
    expect(String(failure)).toContain("Rate limit exceeded")
  })

describe("agent model stream replay safety", () => {
  it.effect("corrects pre-output invalid tool output through the public Agent path", () =>
    Effect.gen(function* () {
      const model = scriptedModel([Stream.fail(invalidToolCall), healthy])
      const events = yield* runAgent(
        model.layer,
        ModelResilience.layer({
          retrySchedule: Schedule.recurs(0),
          invalidToolCallCorrectionLimit: 1,
        }),
      )
      const completed = events.at(-1)

      expect(model.attempts()).toBe(2)
      expect(completed?._tag === "Completed" && completed.text).toBe("recovered")
    }),
  )

  it.effect("retries an explicit idle timeout before output through the public Agent path", () =>
    Effect.gen(function* () {
      const model = scriptedModel([Stream.never, healthy])
      const fiber = yield* runAgent(
        model.layer,
        ModelResilience.layer({
          retrySchedule: Schedule.recurs(1),
          streamIdleTimeout: "10 millis",
        }),
      ).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* TestClock.adjust("10 millis")
      const events = yield* Fiber.join(fiber)

      expect(model.attempts()).toBe(2)
      expect(events.at(-1)?._tag).toBe("Completed")
    }),
  )

  it.effect("fails an explicit idle timeout after output without replay", () =>
    Effect.gen(function* () {
      const model = scriptedModel([
        Stream.make(
          Response.makePart("text-delta", { id: "text", delta: "partial" }) as Response.StreamPartEncoded,
        ).pipe(Stream.concat(Stream.never)),
        healthy,
      ])
      const fiber = yield* Effect.flip(
        runAgent(
          model.layer,
          ModelResilience.layer({
            retrySchedule: Schedule.recurs(1),
            streamIdleTimeout: "10 millis",
          }),
        ),
      ).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* TestClock.adjust("10 millis")
      const failure = yield* Fiber.join(fiber)

      expect(model.attempts()).toBe(1)
      expect(String(failure)).toContain("ModelStreamTimeout")
    }),
  )

  it.effect("never restarts after text escaped", () => expectTerminalWithoutReplay(textThenFail))

  it.effect("never restarts after reasoning escaped", () => expectTerminalWithoutReplay(reasoningThenFail))

  it.effect("never restarts after tool parameters escaped", () => expectTerminalWithoutReplay(toolParamsThenFail))

  it.effect("never restarts an in-band failure after text escaped", () =>
    expectTerminalWithoutReplay(inBandTextThenFail),
  )
})
