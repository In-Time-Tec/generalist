# ADR-0001 — Baton Standalone Agent Framework

> Provenance: extracted from relayfx ADR-0018 ("Baton Standalone Agent Framework"). BatonFX is the standalone home of Baton; the durable-composition half of the original decision lives in the [relayfx](https://github.com/In-Time-Tec/relayfx) repository.

## Status

Accepted.

## Context

A durable agent runtime (Relay) contains a general-purpose, non-durable agent loop shape: build an `Ai.Chat`, stream model output with `disableToolCallResolution: true`, fold stream parts, execute tool calls, re-feed tool results, repeat up to a turn cap. That loop is useful without any durability stack: plain agents and chat streaming do not need an event log, Postgres, or Effect Cluster.

`effect/unstable/ai` ships near-daily betas, and the effect version is pinned exactly through the workspace catalog. Any framework built on it must move in lockstep with that pin or drift immediately.

## Decision

Ship the loop as **Baton** (`@batonfx/core`) — a standalone, Effect-native, non-durable agent framework in its own monorepo (`packages/core`), exact-pinned to a single `effect` catalog entry.

Baton is Effect-native and non-durable. It depends on `effect` only — never on a durable runtime's schema package, event log, or Postgres. The boundary rule is: if a module needs a durable runtime's schema, it belongs in that runtime, not Baton. In this repository the rule is enforced structurally by the `no-relayfx-imports` ast-grep rule. Payload vocabulary is `Ai.Prompt`/`Ai.Response`; Baton adds loop framing only, no second wire format.

Baton exposes exactly three seams — `ToolExecutor`, `Approvals`, `TurnPolicy` — plus a provider-agnostic `ModelRegistry`. Suspension is a typed error (`AgentSuspended`) on the stream's error channel, re-entered via `RunOptions.resume`.

A durable runtime composes Baton behind its own unchanged agent-loop interface: it keeps its durable event log, tool runtime, and schema vocabulary in its own shim and adapts at that boundary.

Every Baton export is `@experimental`.

## Deferred

UI helpers (useChat/data-stream/SSE), memory abstractions, evals, guardrails, and multi-agent/handoffs are explicitly out of scope for v1. (MCP shipped separately as `@batonfx/mcp`; chat persistence shipped as a seam only — see `docs/spec/01-baton-agent-framework.md`.)

## Consequences

- Consumers can use an Effect-native agent loop without adopting any durability stack.
- A durable runtime's agent loop becomes a composition over Baton; its public loop interface does not change.
- The `effect` version is pinned once in the workspace catalog; Baton and any lockstep consumer cannot drift.
- `@experimental` markers keep the API free to move while `effect/unstable/ai` is itself unstable.
- The `@batonfx` npm org is claimed; the packages are `@batonfx/core` and `@batonfx/mcp`.

## Rejected alternatives

- Porting AI SDK/Mastra vocabulary: rejected; Baton is the Effect version of an agent framework, with `Schedule`-inspired turn policies and `Ai.Prompt`/`Ai.Response` as the only payload vocabulary.
- Making `TurnPolicy` a service: rejected; policies are plain values so agents carry their own default, exactly like `Schedule` values.
- Shipping UI/memory/evals/multi-agent in v1: rejected; deferred until the loop core stabilizes.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- [relayfx ADR-0018 and ADR-0021](https://github.com/In-Time-Tec/relayfx) — the durable-composition decision.
