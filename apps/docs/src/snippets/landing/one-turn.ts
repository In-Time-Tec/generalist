import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

const weatherTool = Ai.Tool.make("get_weather", {
  description: "Get local weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({
  name: "weather-assistant",
  instructions: "Answer with the weather returned by tools.",
  toolkit: Ai.Toolkit.make(weatherTool),
})

let calls = 0

const scriptedModel = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Ai.Response.makePart("tool-call", {
              id: "weather-1",
              name: "get_weather",
              params: { city: "Boise" },
              providerExecuted: false,
            }),
          )
        : Stream.make(
            Ai.Response.makePart("text-delta", {
              id: "assistant",
              delta: "Boise is sunny and 72°F; no jacket needed.",
            }),
          )
    },
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Should I bring a jacket in Boise?" })
  yield* Console.log(result.text)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      scriptedModel,
      ToolExecutor.testLayer({
        execute: () =>
          Effect.succeed({
            _tag: "Success",
            result: "sunny and 72°F in Boise",
            encodedResult: "sunny and 72°F in Boise",
          }),
      }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
