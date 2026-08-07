import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, Tool, Toolkit } from "@batonfx/core"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "assistant", delta })

const toolCall = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const weatherTool = Tool.make("get_weather", {
  description: "Get local weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(weatherTool)

const toolkitLayer = toolkit.toLayer({
  get_weather: ({ city }) => Effect.succeed(`sunny and 72°F for ${city}`),
})

const agent = Agent.make({
  name: "weather-assistant",
  instructions: "Answer with the weather returned by tools.",
  toolkit,
})

let calls = 0

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Should I bring a jacket in Boise?" })
  yield* Console.log(result.text)
})

const runtimeLayer = Layer.mergeAll(
  modelLayer(() => {
    calls += 1
    return calls === 1
      ? Stream.make(toolCall("weather-1", "get_weather", { city: "Boise" }))
      : Stream.make(textDelta("Boise is sunny and 72°F; no jacket needed."))
  }),
  toolkitLayer,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
