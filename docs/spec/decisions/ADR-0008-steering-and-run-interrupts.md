# ADR-0008 — Steering and Run Interrupts

## Status

Accepted.

## Context

Long-running agent loops need in-process input that can arrive while a run is active. This is distinct from approvals and permissions: steering is soft input delivered at turn boundaries, while approvals are hard gates that may suspend tool execution.

## Decision

Introduce `Steering` in `@batonfx/core` as an optional two-queue service. `steering` drains after tool results are available and before the next model turn; `followUp` drains only when the run would otherwise complete. The queues are Effect `Queue` values configured by explicit drain and overflow policies so hosts choose whether bounded overload suspends, fails typed, drops newest input, or keeps the newest bounded window. Baton emits `SteeringDrained { turn, queue, count }` when a queue is consumed into the next prompt. Baton uses existing Effect interruption for run abort and adds no new abort API.

The service is non-durable and in-process. Relay and other hosts deliver remote envelopes and provide durable queue/wait behavior outside Baton.

## Consequences

- Steering and approvals remain separate primitives with separate semantics.
- Existing applications are unchanged unless they provide a `Steering` layer.
- Follow-up input can extend a run while remaining visible in the normal `AgentEvent.Event` stream.
- Bounded overload is explicit and typed through the steering service boundary instead of hidden in unbounded queues.
- Undrained messages remain queued after interruption; stronger drained-but-not-sent requeue semantics require a later acknowledgment design.

## Related docs

- `docs/spec/05-steering-and-interrupts.md`
- `docs/spec/01-baton-agent-framework.md`
