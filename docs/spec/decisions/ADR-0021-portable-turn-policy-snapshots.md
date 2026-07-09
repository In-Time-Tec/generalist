# ADR-0021 — Portable Turn Policy Snapshots

## Status

Accepted.

## Context

A Baton `Agent` carries a plain `TurnPolicy` whose behavior is an Effectful decision function. Durable hosts cannot persist that closure, any per-turn model `Layer`, or the ambient services captured by user code. Silently replacing a custom policy on reconstruction changes agent behavior, while treating the whole Agent value as JSON would incorrectly make Effect AI toolkits and runtime services part of Baton's wire contract.

## Decision

`TurnPolicy` exposes an optional, inert `Snapshot` union for the portable constructor data of Baton's built-ins: `Recurs`, `UntilToolCall`, and recursive `Both`. `recurs` attaches a snapshot when its count is finite, `untilToolCall` attaches one, and `both` attaches one only when both inputs are portable. A non-finite recurrence count keeps its existing runtime behavior but has no snapshot because JSON would change the value to `null`. `make` remains opaque and attaches none.

Snapshots are descriptive data. They do not drive Baton's own decisions and do not serialize functions, Effects, Layers, toolkit handlers, or services. A durable host may project a recognized snapshot into its own schema and reconstruct it later. A host that cannot support a snapshot must reject it explicitly; it must not accept the Agent and substitute another policy.

## Consequences

- Standalone policy behavior and the default `recurs(8)` remain unchanged.
- Durable hosts can preserve the current built-in policy algebra without depending on mutable process-local code.
- Policies created with `make`, or compositions containing one, remain runtime-only.
- Baton remains non-durable and does not acquire a policy registry or serialization service.
