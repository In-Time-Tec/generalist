import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, AgentTool, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

const summarizer = Agent.make({
  name: "summarizer",
  instructions: "Summarize the given text in one sentence.",
})

const summarizeToolkit = AgentTool.asTool(summarizer, {
  name: "summarize",
  description: "Summarize a document in one sentence",
  parameters: Schema.Struct({ document: Schema.String }),
  toPrompt: (params) => `Summarize this: ${params.document}`,
})

const parent = Agent.make({
  name: "editor",
  instructions: "Use the summarize tool before answering.",
  toolkit: Ai.Toolkit.make(...Object.values(summarizeToolkit.tools)),
})

let calls = 0

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      switch (calls) {
        case 1:
          return Stream.make(
            Ai.Response.makePart("tool-call", {
              id: "summarize-1",
              name: "summarize",
              params: { document: "Baton is an Effect-native agent loop." },
              providerExecuted: false,
            }),
          )
        case 2:
          return Stream.make(
            Ai.Response.makePart("text-delta", { id: "assistant", delta: "Baton runs agent loops on Effect." }),
          )
        default:
          return Stream.make(
            Ai.Response.makePart("text-delta", {
              id: "assistant",
              delta: "Summary ready: Baton runs agent loops on Effect.",
            }),
          )
      }
    },
  }),
)

const program = Agent.generate(parent, { prompt: "Summarize the intro document." }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.fromToolkit(summarizeToolkit),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
    ),
  ),
)

await Effect.runPromise(program)
