# `@batonfx/mcp`

Focused composition guide for MCP toolkit discovery and tool execution.

## Install

```sh
bun add effect @batonfx/mcp
```

## Imports

```ts
import { McpToolSource } from "@batonfx/mcp"
```

## Layer graph

```text
Layer.succeed(test McpToolSource.Interface)
└─ provides McpToolSource.McpToolSource
   └─ program reads discovered tools
```

The hand-built service is deterministic example data. Production code uses `McpToolSource.layer(...)`, which connects to the configured MCP transport and owns that connection in the layer's internal scope.

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/mcp.ts`](../../examples/package-composition-guides/src/mcp.ts)

```ts
import { Console, Effect, Layer, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { McpToolSource } from "@batonfx/mcp"

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
).pipe(Effect.provide(sourceLayer))

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/mcp.ts`.

## Errors, requirements, and resources

This fully provided deterministic program is `Effect<void, never, never>`. Production acquisition fails with schema-backed `McpConnectionFailed`, and production `callTool` fails with schema-backed `McpToolCallFailed`. `McpToolSource.layer` is scoped internally by its layer, so releasing the layer closes the MCP connection. The example has no detached fibers or unbounded concurrency/buffering.

## More

- Current behavior: [MCP](../../docs/features/mcp.md)
- Deeper example: [MCP agent](../../examples/mcp-agent/)
