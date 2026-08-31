# MCP Toolkit Server (legacy protocol)

This credential-free example serves a Generalist `Toolkit` directly through Effect's owning `McpServer` API. It intentionally pins the legacy MCP `2025-06-18` protocol; Effect does not yet expose an MCP `2026-07-28` adapter.

```bash
bun --cwd examples/mcp-toolkit-server start
```

The Streamable HTTP endpoint is `POST /mcp` on port `4001` by default. Set `PORT` to choose another port.

The example does not add a Generalist MCP server abstraction: Generalist tools are Effect AI tools, so `McpServer.toolkit` accepts their `Toolkit` directly.
