import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, LanguageModel, Response, Tool, Toolkit } from "@batonfx/core"

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

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
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

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ get_weather: ({ city }) => Effect.succeed(`sunny and 72°F in ${city}`) }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Should I bring a jacket in Boise?" })
  yield* Console.log(result.text)
})

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
