# ADR-0017 — Effect Toolkit as Tool Runtime

## Status

Accepted.

## Context

Effect AI already defines the canonical tool model: `Tool.make`, `Toolkit.make`, and `Toolkit.toLayer`. Baton had grown an additional required `ToolExecutor` layer even for ordinary in-process tools, plus required `Approvals` and `ModelMiddleware` layers for runs that did not use those features. That made the happy path look like a second framework instead of an Effect-native agent loop over Effect AI.

## Decision

Baton treats Effect AI `Tool` and `Toolkit` values as the public tool runtime. Authors define tools with `Tool.make`, group them with `Toolkit.make`, implement handlers with `toolkit.toLayer(...)`, and pass the toolkit to `Agent.make`.

`@batonfx/core` directly re-exports selected Effect AI modules for developer ergonomics: `AiError`, `Chat`, `EmbeddingModel`, `IdGenerator`, `LanguageModel`, `Model`, `Prompt`, `Response`, `ResponseIdTracker`, `Telemetry`, `Tokenizer`, `Tool`, and `Toolkit`. These exports are transparent, identity-preserving re-exports from `effect/unstable/ai`; Baton does not wrap, rename, fork, or become the owner of those primitives.

`Agent.make` accepts the name first: `Agent.make("assistant", { instructions, toolkit, policy })`. The object form remains accepted only as a migration convenience; documentation uses the name-first form.

`Agent.stream` and derived helpers require only `Ai.LanguageModel.LanguageModel` for a no-tool run. `ModelMiddleware` defaults to the empty chain when absent. `Approvals` is resolved only when a tool declares `needsApproval`; if the service is absent for an approval-gated call, Baton fails closed by feeding a failed tool result back to the model. `ToolExecutor` is an optional override seam. When it is absent, Baton executes framework tool calls through the active Effect toolkit handlers in the current Effect context.

The advanced `ToolExecutor` seam stays for durable hosts, remote tool runners, MCP adapters, and suspension. It overrides local toolkit handler execution when provided, and it remains the only way for a host to return `Suspend` from a tool call.

Placement helpers (`ToolExecutor.client`, `ToolExecutor.remote`, `ToolExecutor.mcp`, and `ToolExecutor.sandbox`) are named route constructors, not a second tool definition API. They route by Effect AI tool names from an existing `Toolkit`, pass the original `Tool` value to the placement executor, and validate successful placement results with the tool's existing `success` schema. Remote retry is limited to infrastructure failures in the Effect error channel; returned tool failures remain model-visible tool failures and are not retried.

## Execution plan

1. Update the agent loop so no-tool runs do not require `ToolExecutor`, `Approvals`, or `ModelMiddleware`.
2. Route ordinary local tool calls through `Toolkit.toLayer` handlers when no `ToolExecutor` is provided.
3. Keep `ToolExecutor` as an override with unchanged outcome semantics.
4. Update tests, examples, docs snippets, and references to show the Effect-native path first and the override seam only for durable or remote execution.
5. Align Relay to consume Effect toolkits at the SDK/runtime boundary instead of exposing a duplicate registered-tool authoring shape.
6. Re-export Effect AI primitives from `@batonfx/core` directly so examples can import `Agent`, `Tool`, `Toolkit`, `LanguageModel`, `Prompt`, and `Response` from one Baton entrypoint while still using upstream Effect AI values.
7. Add first-class placement route constructors over Effect AI toolkit definitions for client, remote worker, MCP, and sandbox execution.

## Consequences

- Baton's tool story matches upstream Effect AI instead of duplicating it.
- Simple agents need fewer layers and less ceremony.
- Tests can swap tool behavior with ordinary Effect layers.
- Durable runtimes still have a seam for waits, remote execution, and persisted approvals.
- Relay can derive its durable tool registry from the same Effect toolkit definitions that Baton executes locally.
- The root Baton import becomes ergonomic without hiding provenance: `Tool.make` from `@batonfx/core` is the same value as `Tool.make` from `effect/unstable/ai`.
- Placement-specific routing is explicit without adding duplicate fields like registered-tool definitions, AI-tool wrappers, or per-host tool schemas.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/04-permissions-policy.md`
- `docs/spec/10-multi-agent.md`
