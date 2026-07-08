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

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
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

const layers = Layer.mergeAll(
  modelLayer,
  ToolExecutor.testLayer({
    execute: (request) =>
      Effect.succeed({
        _tag: "Success",
        result: `sunny and 72°F in ${String((request.call.params as { readonly city?: string }).city ?? "unknown")}`,
        encodedResult: `sunny and 72°F in ${String((request.call.params as { readonly city?: string }).city ?? "unknown")}`,
      }),
  }),
  Approvals.autoApprove,
  ModelMiddleware.identityLayer,
)

const program = Agent.stream(agent, { prompt: "Should I bring a jacket in Boise?" }).pipe(
  Stream.runForEach((event) => Console.log(event._tag)),
  Effect.provide(layers),
)

await Effect.runPromise(program)
