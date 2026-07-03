# Getting Started

This path gets you to a local Baton agent in five minutes under Bun, without live LLM credentials.

## Install

```bash
bun add effect @batonfx/core @batonfx/providers
```

## Run the local example

```bash
bun --cwd examples/tool-calling-chatbot start
```

The example provides a deterministic local language-model layer, a Baton `ToolExecutor`, `Approvals.autoApprove`, and `ModelMiddleware.identityLayer`. In a real app you replace only the model layer, usually with `@batonfx/providers` or a direct `@effect/ai-*` provider layer.

## Add a tool

Tools are Effect AI `Ai.Tool` values advertised by the agent toolkit. Baton does not execute tool handlers implicitly unless you provide a `ToolExecutor`; the built-in `ToolExecutor.fromToolkit` runs handled toolkits in-process, and hosts can replace it with a durable executor.

## Next steps

- Read [the loop guide](concepts/agent-loop.md).
- Add [approvals and permissions](guides/approvals-hitl-permissions.md).
- Add [memory](guides/memory.md) or [MCP](guides/mcp.md).
