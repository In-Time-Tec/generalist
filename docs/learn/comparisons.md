---
title: "When to use Generalist"
description: "The workloads Generalist is built for, the workloads it deliberately is not, and how to tell in one read which side yours falls on."
---

Generalist is a TypeScript framework for building AI agents on Effect, and it is scoped on purpose: agents as plain values, runs as typed event streams, every seam an Effect service. This page states plainly which workloads that scope serves and which it does not, so you can decide in one read.

## Reach for Generalist when

- **The agent lives inside your process.** CLIs, scripts, servers, and tests that need a tool-calling agent with no external infrastructure. `Agent.stream` emits a closed ten-event union you fold, persist, or forward ([The agent loop](/learn/agent-loop)).
- **A human has to approve tool calls.** An approval-gated tool suspends the run as `AgentSuspended` on the error channel, carrying a resume token. Suspension is a value in the type signature, not a callback to wire ([Suspension as a typed error](/learn/suspension)).
- **Agent behavior must be assertable in CI.** A scripted model runs the loop with zero API keys. [The quickstart](/start/quickstart) demonstrates the wiring; [testing and evals](/guides/testing-evals) adds assertions.
- **You are streaming a run to a browser.** generalist/server exposes Host Sessions and their durable event cursor over SSE and WebSocket, with a client generated from the same HttpApi ([Serve over a transport](/guides/serve-transport)).
- **Your codebase is Effect.** Agents compose with the services, layers, typed errors, and streams you already have; nothing is bolted on.

## Reach elsewhere when

- **A single model call with tools is enough.** Use `effect/unstable/ai` directly: it is Generalist's own substrate, and it resolves tool calls within one generation. Generalist starts paying for itself when a model call becomes an agent: multiple turns, policies, approvals, an observable stream.
- **You expect core runs to survive deploys or crashes by themselves.** Core is process-local. Add `generalist/runtime` and persistent storage for durable, addressable runs ([where durability lives](/learn/native-runtime)); memory Runtime is not restart-safe storage.
- **You need multi-step orchestration across services.** Generalist owns one agent's turns, nothing wider. Orchestration belongs to your application or to a durable runtime above it.
- **Effect is not in your stack.** Generalist's extension mechanism is Effect services and layers; without Effect you would be fighting the framework's one idea.

## The shape of the decision

Count the turns and decide whether execution state must survive the process. One model call: use Effect AI directly. For a process-local agent loop, use Generalist. For addressable runs that need replay or recovery, add `generalist/runtime`. Try the [offline quickstart](/start/quickstart), then [local and SQLite reopen](/start/examples#local-and-sqlite-in-five-minutes).

## Compatibility is experimental

Generalist is pre-1.0 with no compatibility promise. All public exports remain experimental while Effect AI is unstable; APIs can change in any 0.x release. Pin the matching Effect and provider versions from [Installation](/start/installation). The [generated API](/api/index) is the signature reference for this checkout; guides explain usage, not a separate API contract. See [versioning](/reference/versioning) before upgrading.
