# BatonFX Docs

BatonFX is a standalone, non-durable, Effect-native agent framework. These pages are consumer-facing documentation; the normative contracts remain in [`../spec`](../spec) and [`../../SPEC.md`](../../SPEC.md), and the vocabulary remains in [`../../CONTEXT.md`](../../CONTEXT.md).

## Getting started

- [Getting started](getting-started.md)

## Core concepts

- [The loop and AgentEvent stream](concepts/agent-loop.md)
- [Suspension as a typed error](concepts/suspension-as-typed-error.md)
- [Seams as services](concepts/seams-as-services.md)

## Guides

- [Tools and toolkits](guides/tools-and-toolkits.md)
- [Approvals, HITL, and permissions](guides/approvals-hitl-permissions.md)
- [Steering and interrupts](guides/steering-interrupts.md)
- [Structured output](guides/structured-output.md)
- [Skills](guides/skills.md)
- [Instructions and context sources](guides/instructions-context-sources.md)
- [Compaction](guides/compaction.md)
- [Memory](guides/memory.md)
- [MCP](guides/mcp.md)
- [Model registry and providers](guides/model-registry-providers.md)
- [Middleware, guardrails, and resilience](guides/middleware-guardrails-resilience.md)
- [Multi-agent](guides/multi-agent.md)
- [Streaming UI and FoldKit](guides/streaming-ui-foldkit.md)
- [Testing and evals](guides/testing-evals.md)

## Recipes

- [Context-truncation middleware](recipes/context-truncation-middleware.md)
- [pgvector VectorStore](recipes/pgvector-vector-store.md)
- [PII-scrub guardrail](recipes/pii-scrub-guardrail.md)
- [Token-budget TurnPolicy](recipes/token-budget-turn-policy.md)
- [Gemini via OpenAI compatibility](recipes/gemini-openai-compat.md)

## Reference

- [API stability](reference/api-stability.md)
- [Package exports](reference/package-exports.md)
- [0.1.0 release train](reference/release-0.1.0.md)

## Positioning

- [Baton vs AI SDK](positioning/baton-vs-ai-sdk.md)
- [Baton vs Mastra](positioning/baton-vs-mastra.md)
- [Baton + Relay: when you need durability](positioning/baton-relay-durability.md)

## Examples

- [Tool-calling chatbot](../../examples/tool-calling-chatbot/README.md)
- [Structured extraction](../../examples/structured-extraction/README.md)
- [HITL over SSE](../../examples/hitl-over-sse/README.md)
- [MCP agent](../../examples/mcp-agent/README.md)
- [Memory chat](../../examples/memory-chat/README.md)
- [Multi-agent](../../examples/multi-agent/README.md)
- [Eval in CI](../../examples/eval-in-ci/README.md)
- [Capstone local assistant](../../examples/capstone-local-assistant/README.md)
