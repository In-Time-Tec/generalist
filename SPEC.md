# BatonFX Specification Index

`SPEC.md` is the root index for BatonFX's specification tree. BatonFX is a standalone, non-durable, Effect-native agent framework built on `effect/unstable/ai`. Compose it directly into your own Effect app; back it with a durable runtime such as [Relay](https://github.com/In-Time-Tec/relayfx) when you need suspend/resume durability.

## How to read this tree

Read `CONTEXT.md` for the vocabulary, then this index, then the feature branch under `docs/spec/`. Stable decisions have an ADR under `docs/spec/decisions/`. If implementation discovers a new invariant, update the feature document and add or amend an ADR before changing code.

```diagram
SPEC.md
├─ CONTEXT.md                                  vocabulary
├─ docs/spec/
│  └─ 01-baton-agent-framework.md              the agent loop contract
└─ docs/spec/decisions/
   ├─ ADR-0001-baton-standalone-agent-framework.md
   ├─ ADR-0002-tool-context-output-spill.md
   ├─ ADR-0003-model-resilience.md
   └─ ADR-0004-guardrail-combinators.md
```

## Packages

| Package         | npm             | Directory       | Purpose                                                                                                                                                                                                                   |
| --------------- | --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@batonfx/core` | `@batonfx/core` | `packages/core` | The Effect-native agent loop: Agent, structured output, TurnPolicy, ToolExecutor, ToolContext, ToolOutputStore, Approvals, ModelRegistry, ModelResilience, ModelMiddleware, Guardrail combinators, chat persistence seam. |
| `@batonfx/mcp`  | `@batonfx/mcp`  | `packages/mcp`  | MCP client bridge: discover an MCP server's tools as an `Ai.Toolkit` plus a Baton `ToolExecutor` adapter (`@batonfx/mcp/baton`).                                                                                          |

## Feature branches

- Agent framework contract: `docs/spec/01-baton-agent-framework.md`

## Decisions

- ADR-0001 — Baton Standalone Agent Framework: `docs/spec/decisions/ADR-0001-baton-standalone-agent-framework.md`
- ADR-0002 — Tool Context and Output Spill: `docs/spec/decisions/ADR-0002-tool-context-output-spill.md`
- ADR-0003 — Model Resilience: `docs/spec/decisions/ADR-0003-model-resilience.md`
- ADR-0004 — Guardrail Combinators: `docs/spec/decisions/ADR-0004-guardrail-combinators.md`
