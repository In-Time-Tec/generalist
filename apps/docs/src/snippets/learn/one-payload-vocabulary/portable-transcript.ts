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
      if (calls === 1) {
        return Stream.make(
          Ai.Response.makePart("tool-call", {
            id: "weather-1",
            name: "get_weather",
            params: { city: "Boise" },
            providerExecuted: false,
          }),
        )
      }
      if (calls === 2) {
        return Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "Boise is sunny and 72°F." }))
      }
      return Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "You asked about Boise." }))
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  ToolExecutor.testLayer({
    execute: () => Effect.succeed({ _tag: "Success", result: "sunny and 72°F", encodedResult: "sunny and 72°F" }),
  }),
  Approvals.autoApprove,
  ModelMiddleware.identityLayer,
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
}).pipe(Effect.provide(layers))

await Effect.runPromise(program)
