# MCP

`@batonfx/mcp` connects to an MCP server, discovers tools, and exposes them as an Effect AI toolkit plus a Baton `ToolExecutor` adapter at `@batonfx/mcp/baton`.

The bridge keeps MCP SDK dependencies out of core. MCP tool failures become Baton tool failures; MCP tools do not suspend by themselves.

Every `tools/call` passes the running fiber's `AbortSignal` to the SDK, so interrupting a Baton run cancels the in-flight MCP request on the server. An optional `callTimeout` on `McpToolSource.fromTransport`, `layer`, and `layerTagged` bounds each call; on expiry the call fails with `McpToolCallError`.

Runnable workflow: [`../../../examples/mcp-agent/README.md`](../../../examples/mcp-agent/README.md).
