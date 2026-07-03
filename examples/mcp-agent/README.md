# MCP Agent

Run a Baton agent against a fake in-memory MCP source. The code uses the same `@batonfx/mcp/baton` adapter shape as a real MCP connection, but no server process is started in CI.

```bash
bun --cwd examples/mcp-agent start
```
