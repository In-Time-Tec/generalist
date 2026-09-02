import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { Tool } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"
import { MCPClient } from "generalist/unstable/mcp"
import { layerToolkit, toolkit } from "generalist/unstable/mcp/tools"

const client: MCPClient.Service = {
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

const runtimeLayer = Layer.mergeAll(
  TestModel.layer([
    TestModel.toolCall("local_search", { query: "setup" }, { id: "search-1" }),
    TestModel.text("Found local setup docs."),
  ]),
  layerToolkit(client),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const program = Effect.gen(function* () {
  const mcpToolkit = yield* toolkit(client)
  const agent = Agent.make({ name: "mcp-agent", toolkit: mcpToolkit })
  const result = yield* Agent.run(agent, "Find the setup docs")
  yield* Console.log(result)
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
