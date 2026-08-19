# @tenetkit/cloudflare

Cloudflare Workers and Durable Objects adapters for TenetKit.

## Durable Run activation

`@tenetkit/cloudflare/durable-objects` stores only its scheduling projection in
`tenetkit_activations`. Run authority remains in the existing `baton_*` tables.
Construct `makeProjection(sql, rearm)` with the same full-storage SQLite client
used by `layerRunStore`; `rearm` must synchronously compute the host-wide minimum
due time and call the top-level Durable Object storage alarm API. The Run change,
candidate change, and alarm then share one storage transaction. It must not await
network work. Final-state projection is limited to Runs touched by that mutation;
an inactive final state deletes its candidate before `rearm` runs.

Call `migrateAndBackfill(rearm)` once inside a SQL transaction to reconstruct
candidates after the baseline `baton_runtime` migration has verified schema-meta
version 8 and its checksum. This adapter table does not change the `baton_*`
schema version. On each fresh exclusive host incarnation, call
`makeExclusiveExecutionRecovery(...).recoverClaims(...)` before `drain(...)`.
Drains are deterministic and fuel-bounded. Execute candidates pass through the
normal claim and execution host; cancellation candidates use point cancellation
reconciliation and are conditionally deferred without recreating deleted rows.

Each runtime surface is an independent export so Workers bundle only the capabilities they use:

- `@tenetkit/cloudflare/workers`
- `@tenetkit/cloudflare/durable-objects`
- `@tenetkit/cloudflare/dynamic-workers`
- `@tenetkit/cloudflare/testing`
