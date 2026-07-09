# ADR-0013 — In-process multi-agent

## Status

Accepted. Amended: child `AgentSuspended` collapses into a failed tool result at the parent tool boundary, so Baton does not create a second suspension protocol for agent-as-tool calls.

## Context

Baton needs a first-class in-process multi-agent story while keeping durable, addressable child executions outside core. Existing primitives already cover most of the behavior: an agent can run with `Agent.generate`, a parent can execute local tools through `ToolExecutor.fromToolkit`, and Effect layers carry model/tool/approval/middleware services.

## Decision

Add `AgentTool` and `Handoff` to `@batonfx/core`.

`AgentTool.asTool` exposes a child agent as an Effect AI tool handler. It runs the child in the current Effect context and converts child run failures, including child suspension, into failed parent tool results.

`Handoff.transferTool` names child-agent tools with `transfer_to_<name>`. `Handoff.supervisor` builds a supervisor agent plus the handled transfer toolkit needed by `ToolExecutor.fromToolkit`. `Handoff.fanOut` runs isolated child agents concurrently and propagates child run errors because there is no tool boundary.

## Consequences

- Baton supports rich same-process composition without introducing a bespoke orchestrator.
- Durable/addressable children and cross-process handoff remain host responsibilities.
- Parent runs receive child suspension as an ordinary failed tool result and can decide what to do next through the model loop.
- Fan-out callers handle child run errors directly.

## Related docs

- `docs/spec/10-multi-agent.md`
- `docs/spec/01-baton-agent-framework.md`
