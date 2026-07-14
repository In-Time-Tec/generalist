# ADR-0028 — Scoped MCP Baton Tools

## Status

Accepted.

## Context

The MCP package separately exposed connection layers, discovered toolkits, and handler layers. Consumers had to know the core `ToolExecutor.fromToolkit` assembly path, could accidentally give the connection a shorter lifetime than the Agent run, and the handler layer reduced `McpToolCallError` to its message string.

## Decision

Add `route(options)`, a scoped Effect that acquires one `McpToolSource.Interface` and returns `BatonTools` containing the discovered Effect AI toolkit and a ready-to-provide Baton `ToolExecutor` layer. The route accepts Baton's declarative transport values and MCP SDK `Transport` implementations, uses the caller's scope for connection ownership, and performs no Effect execution until composed by the caller.

MCP dynamic tools use the encoded fields of `McpToolCallError` as their failure schema with `failureMode: "return"`. Their handlers project the original tagged error to that structured failure without dropping fields. Effect AI validates and encodes it as a failed handler result, and the existing core toolkit executor maps it to Baton's failed tool outcome. The Agent loop therefore continues while the MCP server, raw tool name, tag, and diagnostic remain represented at the tool boundary.

Retain `toolkit` and `toolkitLayer` as lower-level additive APIs. They remain useful when a host supplies an already acquired or tagged source.

## Consequences

- Consumers acquire and release the MCP connection and its complete Baton integration under one visible `Scope.Scope` requirement.
- Connection failures, including OAuth pending and provider failures, stay typed on the acquisition Effect; individual call failures stay typed and schema-backed until Effect AI converts them into a failed tool result.
- Toolkit and executor cannot disagree about discovery or connection identity because both derive from one source value.
- Existing consumers remain source-compatible and can migrate incrementally.
- Baton core remains MCP-SDK-free, non-durable, and unchanged.
