import { runMain } from "@effect/platform-bun/BunRuntime"
import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Agent, LanguageModel, Response, Tool, Toolkit } from "@batonfx/core"

const weatherTool = Tool.make("get_weather", {
  description: "Get local weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({
  name: "weather-assistant",
  instructions: "Answer with the weather returned by tools.",
  toolkit: Toolkit.make(weatherTool),
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

runMain(Console.log(agent.name, Layer.isLayer(modelLayer)))
