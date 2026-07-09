# ADR-0018 — In-process Session Run Queue

## Status

Accepted.

## Context

Local Baton servers need to accept messages that arrive while a session is already running without overlapping two agent runs for the same chat. They also need a bounded way to keep many independent sessions from starting unlimited top-level runs at once. The existing `SessionRegistry` already owns process-local run fibers, status, replay frames, approvals, interruption, and idle eviction.

## Decision

Extend `SessionRegistry.layerMemory` with opt-in FIFO message enqueueing and an optional registry-wide top-level run cap. Rejection remains the default for compatibility. Queue capacity is explicit and overflow fails typed. Approval resume always precedes ordinary queued prompts. Accepted queued prompts survive run failure and interruption but not registry-layer release, process restart, or eviction; sessions with pending prompts are not idle-eviction candidates.

The global permit covers a complete registry-owned `Agent.stream` run. It does not claim to govern nested handoffs or agent runs started outside that registry layer. Baton adds no durable queue table, workflow, or cross-process coordinator.

Queue capacity must be a non-negative safe integer and the optional concurrency cap must be a positive safe integer. Invalid values are programmer configuration defects detected while building the layer. Each reserved run receives a monotonically increasing per-session token so stale finalizers and interruption requests cannot mutate a successor run.

## Consequences

- Hosts can serialize messages per session while running different sessions concurrently.
- Hosts can cap concurrent top-level runs without blocking `send` until completion.
- Existing hosts keep `SessionBusy` behavior unless enqueueing is explicitly enabled.
- Durable acceptance and restart recovery remain Relay responsibilities.

## Related docs

- `docs/spec/11-transport.md`
- `docs/spec/decisions/ADR-0014-transport-wire-and-session-registry.md`
