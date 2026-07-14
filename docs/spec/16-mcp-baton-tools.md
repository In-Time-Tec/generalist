# 16 — MCP Baton Tools

`@batonfx/mcp/baton` owns the scoped composition from one MCP transport to the complete tool integration consumed by a Baton Agent.

## Contract

- `route(options)` acquires an MCP connection, discovers its tools, and returns `BatonTools` under the caller's `Scope`.
- `BatonTools.toolkit` is the Effect AI toolkit advertised to the model. `BatonTools.executorLayer` provides both its Effect AI handlers and the core `ToolExecutor` that dispatches every discovered tool to the same acquired connection, so it is the only tool layer an Agent run must install.
- Releasing the scope that acquired `BatonTools` closes the MCP connection. The toolkit and executor are valid only within that ownership scope; the API does not create a durable or reconnecting client.
- `route` accepts either Baton's declarative stdio/HTTP transport configuration or an MCP SDK `Transport`. The latter keeps deterministic in-memory transports and custom SDK transports composable without a hidden runtime boundary.
- Connection, transport-construction, and discovery failures remain typed on the `route` error channel as `McpConnectionError`, `OAuthPendingError`, or `OAuthProviderError`, matching the lower-level transport path. Tool-call failures remain schema-backed `McpToolCallError` values handled through Effect AI's `failureMode: "return"`; the executor turns them into failed Baton tool outcomes without failing the Agent run.
- `toolkit(source)` and `toolkitLayer(source)` remain additive lower-level APIs for consumers that intentionally manage `McpToolSource.Interface` acquisition and executor composition themselves.

## Runtime invariants

- Acquisition is lazy and requires `Scope.Scope` in the Effect environment.
- Calls preserve Effect interruption through the MCP SDK request `AbortSignal`, and `callTimeout` remains an optional finite per-call bound.
- One route performs one discovery and shares one connection across its toolkit and executor. Concurrent calls use the MCP client under the same bounded Agent/tool fibers; the route starts no detached work and introduces no queue or retry policy.

## Decision

The ownership decision is recorded by `ADR-0028-scoped-mcp-baton-tools.md`.
