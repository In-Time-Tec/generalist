# ADR-0029 — MCP Remote Payload Decoding

## Status

Accepted

## Decision

`@batonfx/mcp` decodes server-controlled discovery schemas and structured tool-call content as `Schema.Json` within Effect. Discovery decode failures map to `McpConnectionError` with server context. Structured tool-result decode failures map to `McpToolCallError` with server and tool context.

## Consequences

Malformed remote JSON remains an expected, schema-backed failure in each public method's declared error channel instead of terminating the fiber with a defect. Decoding stays lazy and composable, adds no runtime requirements or Promise boundary, preserves scoped MCP transport ownership, and does not expand the accepted JSON vocabulary or change MCP SDK transport semantics.
