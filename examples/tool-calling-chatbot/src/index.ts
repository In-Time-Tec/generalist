import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

type ModelParams = Parameters<typeof Ai.LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<Ai.LanguageModel.LanguageModel> =>
  Layer.effect(
    Ai.LanguageModel.LanguageModel,
    Ai.LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const textDelta = (delta: string) => Ai.Response.makePart("text-delta", { id: "assistant", delta })

const toolCall = (id: string, name: string, params: unknown) =>
  Ai.Response.makePart("tool-call", { id, name, params, providerExecuted: false })

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

const program = Effect.gen(function* () {
  const result = yield* Agent.generate(agent, { prompt: "Should I bring a jacket in Boise?" })
  yield* Console.log(result.text)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      modelLayer(() => {
        calls += 1
        return calls === 1
          ? Stream.make(toolCall("weather-1", "get_weather", { city: "Boise" }))
          : Stream.make(textDelta("Boise is sunny and 72°F; no jacket needed."))
      }),
      ToolExecutor.testLayer({
        execute: (request) =>
          Effect.succeed({
            _tag: "Success",
            result: `sunny and 72°F for ${String((request.call.params as { readonly city?: string }).city ?? "unknown")}`,
            encodedResult: `sunny and 72°F for ${String((request.call.params as { readonly city?: string }).city ?? "unknown")}`,
          }),
      }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
