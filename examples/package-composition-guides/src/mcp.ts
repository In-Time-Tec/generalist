import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { MCPClient } from "tenetkit/mcp"

const client: MCPClient.Service = {
  server: "local-docs",
  tools: Effect.succeed([
    {
      name: "local-docs_search",
      rawName: "search",
      description: "Search local documentation",
      inputSchema: { type: "object" },
      outputSchema: {},
    },
  ]),
  callTool: (_name, input) => Effect.succeed(input),
  aiTools: Effect.succeed([
    Tool.dynamic("local-docs_search", {
      description: "Search local documentation",
      parameters: { type: "object" },
      success: Schema.Unknown,
      failure: Schema.String,
      failureMode: "return",
    }),
  ]),
}

const clientLayer = Layer.succeed(MCPClient.MCPClient, client)

const program = MCPClient.MCPClient.use((mcp) =>
  mcp.tools.pipe(Effect.flatMap((tools) => Console.log(`discovered ${tools.length} MCP tool`))),
)

const runtime = ManagedRuntime.make(clientLayer)
await runtime.runPromise(program)
