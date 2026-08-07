import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import {
  Agent,
  AgentTool,
  Approvals,
  LanguageModel,
  ModelMiddleware,
  Response,
  ToolExecutor,
  Tool,
  Toolkit,
} from "@batonfx/core"

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

const parentToolkit = Toolkit.make(
  Tool.make("summarize", {
    description: "Summarize a document in one sentence",
    parameters: Schema.Struct({ document: Schema.String }),
    success: Schema.String,
    failure: Schema.String,
    failureMode: "return",
  }),
)

const parent = Agent.make({
  name: "editor",
  instructions: "Use the summarize tool before answering.",
  toolkit: parentToolkit,
})

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      switch (calls) {
        case 1:
          return Stream.make(
            Response.makePart("tool-call", {
              id: "summarize-1",
              name: "summarize",
              params: { document: "Baton is an Effect-native agent loop." },
              providerExecuted: false,
            }),
          )
        case 2:
          return Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "Baton runs agent loops on Effect." }),
          )
        default:
          return Stream.make(
            Response.makePart("text-delta", {
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
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  parentToolkit.toLayer({ summarize: () => Effect.die("agent tool bridge handles summarize") }),
  ToolExecutor.layerToolkit(summarizeToolkit).pipe(Layer.provide(modelLayer)),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
