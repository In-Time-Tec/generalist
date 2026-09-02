import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, AgentTool, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

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

const modelLayer = TestModel.layer([
  TestModel.toolCall("summarize", { document: "Generalist is an Effect-native agent loop." }, { id: "summarize-1" }),
  TestModel.text("Generalist runs agent loops on Effect."),
  TestModel.text("Summary ready: Generalist runs agent loops on Effect."),
])

const program = Agent.run(parent, "Summarize the intro document.").pipe(Effect.flatMap((result) => Console.log(result)))

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  parentToolkit.toLayer({ summarize: () => Effect.die("agent tool bridge handles summarize") }),
  ToolExecutor.layerToolkit(summarizeToolkit).pipe(Layer.provide(modelLayer)),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
