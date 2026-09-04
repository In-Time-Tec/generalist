---
title: "generalist/unstable/mcp"
description: "MCPClient for discovering and calling MCP tools, plus the Generalist toolkit and executor adapters."
---

generalist/unstable/mcp connects Model Context Protocol servers to Generalist: MCPClient discovers and calls MCP tools, and the tools subpath adapts them into a toolkit and a ToolExecutor.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist @modelcontextprotocol/sdk@1.29.0
```

`generalist/unstable/mcp` is an import subpath and requires the optional peer `@modelcontextprotocol/sdk`.

## Exports map

| Subpath          | Contents                                                         |
| ---------------- | ---------------------------------------------------------------- |
| `.`              | Namespace `MCPClient`                                            |
| `./client`       | Transport-neutral source API over an MCP SDK `Transport`         |
| `./client/http`  | Worker-safe Streamable HTTP `make`, `layer`                      |
| `./client/stdio` | Node/Bun-only stdio `make`, `layer`                              |
| `./oauth`        | Worker-safe OAuth service, errors, and token-store layers        |
| `./tools`        | `connect(options)`, `toolkit(client)` and `layerToolkit(client)` |

## MCPClient

The service shape: `{ server, tools, callTool(rawName, input), aiTools }`. Discovered tool names are namespaced as `<server>_<rawName>`; `aiTools` renders each as a dynamic `Ai.Tool` whose parameters are the server's JSON input schema.

| Export                                      | Notes                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Options.transport`                         | A raw `@modelcontextprotocol/sdk` Transport constructed by an exact client subpath |
| `layer({ name, transport, callTimeout? })`  | Scoped layer that connects, lists tools once, and fails with `MCPConnectionFailed` |
| `layerTagged(tag, options)`                 | The same service bound to a custom Context key, for multiple servers side by side  |
| `fromTransport(name, transport, options?)`  | Scoped effect building a client from a raw `@modelcontextprotocol/sdk` transport   |
| `CallOptions`                               | `{ callTimeout?: Duration.Input }` applied to every tool call                      |
| `MCPConnectionFailed` / `MCPToolCallFailed` | `{ server, message }` and `{ server, tool, message }`                              |

`generalist/unstable/mcp/client/http` accepts `requestInit` and OAuth at the process/request boundary. Resolve secret references and construct bearer headers there; never persist raw credentials in executable identity or registration configuration.

`callTool` returns the server's structured content when present, otherwise the joined text content; `isError` results fail with `MCPToolCallFailed`.

## The tools adapter

| Export                                       | Notes                                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `connect({ name, transport, callTimeout? })` | Scoped acquisition returning `MCPTools { toolkit, executorLayer }`. The executor layer installs both handlers and `ToolExecutor`          |
| `toolkit(client)`                            | Discovered MCP tools as an `Ai.Toolkit` for `Agent.make`                                                                                  |
| `layerToolkit(client)`                       | Lower-level Effect AI handlers for an already acquired client. Structured MCP failures retain their tag, server, tool, and message fields |

Prefer connect so the toolkit, handlers, executor, and connection lifetime cannot drift. Use the lower-level exports only when the host already owns the client. See [How to connect MCP servers](/guides/mcp).
