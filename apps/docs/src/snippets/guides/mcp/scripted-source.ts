import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, Tool } from "@batonfx/core"
import { McpToolSource } from "@batonfx/mcp"
import { layerToolkit, toolkit } from "@batonfx/mcp/baton"
const source: McpToolSource.Interface = {
  server: "local",
  tools: Effect.succeed([
    {
      name: "local_search",
      rawName: "search",
      description: "Search local docs",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      outputSchema: {},
    },
  ]),
  callTool: (_rawName, input) => Effect.succeed({ ok: true, input }),
  aiTools: Effect.succeed([
    Tool.dynamic("local_search", {
      description: "Search local docs",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      success: Schema.Unknown,
      failure: Schema.String,
      failureMode: "return",
    }),
  ]),
}

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
              id: "search-1",
              name: "local_search",
              params: { query: "setup" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Found local setup docs." }))
    },
  }),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  layerToolkit(source),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const program = Effect.gen(function* () {
  const mcpToolkit = yield* toolkit(source)
  const agent = Agent.make({ name: "mcp-agent", toolkit: mcpToolkit })
  const result = yield* Agent.generate(agent, { prompt: "Find the setup docs" })
  yield* Console.log(result.text)
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
