import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schedule, Stream } from "effect"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { Agent, ModelResilience } from "../src/index"
import { withProviderFinish } from "./provider-finish"

const rateLimit = AiError.make({
  module: "RestartTestLanguageModel",
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

const partialThenFail = Stream.make(
  Response.makePart("text-delta", { id: "text", delta: "partial " }) as Response.StreamPartEncoded,
).pipe(Stream.concat(Stream.fail(rateLimit)))

const healthy = withProviderFinish(
  Stream.make(Response.makePart("text-delta", { id: "text", delta: "recovered" }) as Response.StreamPartEncoded),
)

const restartPolicy = ModelResilience.layer({
  retrySchedule: Schedule.recurs(0),
  restartConsumedStreams: true,
})

const agent = Agent.make({ name: "stream-restart-agent" })

const runAgent = (
  model: Layer.Layer<LanguageModel.LanguageModel>,
  policy: Layer.Layer<ModelResilience.ModelResilience>,
) => Stream.runCollect(Agent.stream(agent, { prompt: "restart" }).pipe(Stream.provide(Layer.mergeAll(model, policy))))

describe("agent stream restart", () => {
  it.live("restarts a consumed stream after a retryable mid-stream failure", () =>
    Effect.gen(function* () {
      const model = scriptedModel([partialThenFail, healthy])
      const events = yield* runAgent(model.layer, restartPolicy)
      const completed = events.at(-1)

      expect(model.attempts()).toBe(2)
      expect(completed?._tag === "Completed" && completed.text).toBe("recovered")
    }),
  )

  it.live("keeps the failure terminal without the restart opt-in", () =>
    Effect.gen(function* () {
      const model = scriptedModel([partialThenFail, healthy])
      const failure = yield* Effect.flip(
        runAgent(model.layer, ModelResilience.layer({ retrySchedule: Schedule.recurs(0) })),
      )

      expect(model.attempts()).toBe(1)
      expect(String(failure)).toContain("Rate limit exceeded")
    }),
  )

  it.live("stops restarting once the budget is spent", () =>
    Effect.gen(function* () {
      const model = scriptedModel([partialThenFail])
      const failure = yield* Effect.flip(runAgent(model.layer, restartPolicy))

      expect(model.attempts()).toBe(3)
      expect(String(failure)).toContain("Rate limit exceeded")
    }),
  )
})
