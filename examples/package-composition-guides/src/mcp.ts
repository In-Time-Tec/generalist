import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { McpToolSource } from "tenetkit/mcp"

const source: McpToolSource.Interface = {
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

const sourceLayer = Layer.succeed(McpToolSource.McpToolSource, source)

const program = McpToolSource.McpToolSource.use((mcp) =>
  mcp.tools.pipe(Effect.flatMap((tools) => Console.log(`discovered ${tools.length} MCP tool`))),
)

const runtime = ManagedRuntime.make(sourceLayer)
await runtime.runPromise(program)
