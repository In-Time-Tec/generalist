# MCP Agent

Run a Generalist agent against a fake in-memory MCP client. The code uses the same `generalist/unstable/mcp/tools` adapter shape as a real MCP connection, but no server process is started in CI.

```bash
bun --cwd examples/mcp-agent start
```
