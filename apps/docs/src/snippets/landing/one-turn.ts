import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, Tool, Toolkit } from "@batonfx/core"

const weatherTool = Tool.make("get_weather", {
  description: "Get local weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(weatherTool)

const agent = Agent.make({
  name: "weather-assistant",
  instructions: "Answer with the weather returned by tools.",
  toolkit,
})

let calls = 0

const scriptedModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "weather-1",
              name: "get_weather",
              params: { city: "Boise" },
              providerExecuted: false,
            }),
          )
        : Stream.make(
            Response.makePart("text-delta", {
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
      toolkit.toLayer({ get_weather: ({ city }) => Effect.succeed(`sunny and 72°F in ${city}`) }),
      Approvals.autoApprove,
      ModelMiddleware.layerIdentity,
    ),
  ),
)

await Effect.runPromise(program)
