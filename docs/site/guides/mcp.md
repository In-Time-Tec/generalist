# MCP

`@batonfx/mcp` connects to an MCP server, discovers tools, and exposes them as an Effect AI toolkit plus a Baton `ToolExecutor` adapter at `@batonfx/mcp/baton`.

The bridge keeps MCP SDK dependencies out of core. MCP tool failures become Baton tool failures; MCP tools do not suspend by themselves.

Runnable workflow: [`../../../examples/mcp-agent/README.md`](../../../examples/mcp-agent/README.md).
