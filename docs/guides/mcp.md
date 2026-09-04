---
title: "How to connect MCP servers"
description: "Connect to an MCP server with MCPClient, expose its discovered tools as a Generalist toolkit, and proxy tool calls through the MCP executor."
---

`generalist/unstable/mcp` connects to an MCP server, discovers its tools, and exposes one scoped `connect` containing the toolkit the model sees and the executor layer that proxies calls to the same connection. The bridge keeps MCP SDK dependencies out of `generalist`.

**Terminal**

```bash
bun add effect@4.0.0-rc.112 generalist @modelcontextprotocol/sdk@1.29.0
```

## 1. Connect to a server

`MCPClient.layer` remains the lower-level client API for a raw MCP SDK transport. Construct Streamable HTTP transports with `generalist/unstable/mcp/client/http` in browsers and Workers, or opt into the Node/Bun-only `generalist/unstable/mcp/client/stdio`. The usual `connect` API opens the connection, lists the tools once, and closes the client when its Effect scope ends. Discovered tool names are prefixed with the client name: a `search` tool on the `files` server becomes `files_search`.

**connect-server.ts**

```typescript
import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions } from "generalist"
import { connect } from "generalist/unstable/mcp/tools"
import { make as makeStdioTransport } from "generalist/unstable/mcp/client/stdio"
import { layer as openRouterLayer } from "generalist/providers/openrouter"
import { FetchHttpClient } from "effect/unstable/http"

const program = Effect.gen(function* () {
  const tools = yield* connect({
    name: "files",
    transport: makeStdioTransport({
      command: "bunx",
      args: ["@modelcontextprotocol/server-filesystem", "."],
    }),
    callTimeout: "30 seconds",
  })
  const agent = Agent.make({
    name: "file-agent",
    instructions: "Use the filesystem tools to answer.",
    toolkit: tools.toolkit,
  })
  const result = yield* Effect.scoped(
    Effect.flatMap(
      Layer.build(
        Layer.mergeAll(
          openRouterLayer({
            model: "openai/gpt-4o-mini",
            apiKey: Config.redacted("OPENROUTER_API_KEY"),
          }),
          tools.executorLayer,
          Permissions.layerAllowAll,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
      ),
      (services) =>
        ModelRegistry.withModel(
          { provider: "openrouter", model: "openai/gpt-4o-mini" },
          Agent.run(agent, "List the markdown files in this project."),
        ).pipe(Effect.provideContext(services)),
    ),
  )
  yield* Console.log(result)
}).pipe(Effect.scoped)

const runtime = ManagedRuntime.make(FetchHttpClient.layer)
await runtime.runPromise(program)
```

| Transport                              | Fields                                             |
| -------------------------------------- | -------------------------------------------------- |
| `generalist/unstable/mcp/client/http`  | `make({ url, requestInit?, oauth? })`; Worker-safe |
| `generalist/unstable/mcp/client/stdio` | `make({ command, args?, env? })`; Node/Bun only    |

Construct bearer headers in HTTP `requestInit` only after resolving the host's secret reference; do not persist the raw credential in executable registration data. Hosts that run several servers side by side register each under its own tag with `MCPClient.layerTagged`.

## 2. How calls behave

- MCP tool failures become Generalist tool `Failure` outcomes, so the model sees a failed tool result and can react. MCP tools never `Suspend`.
- Every `tools/call` passes the running fiber's `AbortSignal` to the SDK, so interrupting a Generalist run cancels the in-flight MCP request on the server.
- An optional `callTimeout` bounds each call; on expiry the call fails with `MCPToolCallFailed` and the loop continues.

## 3. Test without a live server

`MCPClient.Service` is plain data plus effects, so tests hand the adapter an in-memory client instead of a connection. This is the [examples/mcp-agent](https://github.com/In-Time-Tec/generalist/tree/main/examples/mcp-agent) program, runnable with zero credentials.

**scripted-client.ts**

```typescript
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

const modelLayer = TestModel.layer([
  TestModel.toolCall("local_search", { query: "setup" }, { id: "search-1" }),
  TestModel.text("Found local setup docs."),
])

const runtimeLayer = Layer.mergeAll(
  modelLayer,
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
```

**Output**

```text
Found local setup docs.
```

Local tools and MCP tools use the same executor seam, so start with [How to define tools and toolkits](/guides/define-tools) if you have not built a toolkit before. The full interface is in [the generalist/unstable/mcp reference](/reference/mcp).
