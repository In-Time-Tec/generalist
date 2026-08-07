import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
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

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      if (calls === 1) {
        return Stream.make(
          Response.makePart("tool-call", {
            id: "weather-1",
            name: "get_weather",
            params: { city: "Boise" },
            providerExecuted: false,
          }),
        )
      }
      if (calls === 2) {
        return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Boise is sunny and 72°F." }))
      }
      return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "You asked about Boise." }))
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ get_weather: () => Effect.succeed("sunny and 72°F") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const program = Effect.gen(function* () {
  const first = yield* Agent.generate(agent, { prompt: "What is the weather in Boise?" })
  yield* Console.log(first.text)
  yield* Console.log(first.transcript.content.map((message) => message.role).join(" "))
  const second = yield* Agent.generate(agent, {
    prompt: "Which city did I ask about?",
    history: first.transcript,
  })
  yield* Console.log(second.text)
})

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
