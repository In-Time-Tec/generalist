import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Permissions, Response, Tool, Toolkit } from "generalist"

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

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

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
            Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
          )
        : Stream.make(
            Response.makePart("text-delta", {
              id: "assistant",
              delta: "Boise is sunny and 72°F; no jacket needed.",
            }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          )
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ get_weather: ({ city }) => Effect.succeed(`sunny and 72°F in ${city}`) }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const program = Agent.stream(agent, { prompt: "Should I bring a jacket in Boise?" }).pipe(
  Stream.filter((event) => event._tag !== "ModelPart"),
  Stream.runForEach((event) => Console.log(event._tag)),
)

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
