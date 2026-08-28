# @tenetkit/cloudflare

Cloudflare Workers and Durable Objects adapters for TenetKit.

## Durable Run activation

`@tenetkit/cloudflare/durable-objects` stores only its scheduling projection in
`tenetkit_activations`. Run authority remains in the existing `tenetkit_*` tables.
Construct `makeProjection(sql, rearm)` with the same full-storage SQLite client
used by `layerRunStore`; `rearm` must synchronously compute the host-wide minimum
due time and call the top-level Durable Object storage alarm API. The Run change,
candidate change, and alarm then share one storage transaction. It must not await
network work. Final-state projection is limited to Runs touched by that mutation;
an inactive final state deletes its candidate before `rearm` runs.

Call `migrateAndBackfill(rearm)` once inside a SQL transaction to reconstruct
candidates after the runtime has verified its schema metadata and checksum. The
runtime schema is one baseline, migration 1 `tenetkit_runtime` at version 1. The
adapter table is not part of that schema and does not change its version. On each fresh exclusive host incarnation, call
`makeExclusiveExecutionRecovery(...).recoverClaims(...)` before `drain(...)`.
Drains are deterministic and fuel-bounded. Execute candidates pass through the
normal claim and execution host; cancellation candidates use point cancellation
reconciliation and are conditionally deferred without recreating deleted rows.

Each runtime surface is an independent export so Workers bundle only the capabilities they use:

- `@tenetkit/cloudflare/workers`
- `@tenetkit/cloudflare/durable-objects`
- `@tenetkit/cloudflare/dynamic-workers`

## Dynamic Program Workers

`@tenetkit/cloudflare/dynamic-workers` provides `make(options)` and `layer(options)` for a configured Cloudflare
Worker Loader binding. `make` calls `loader.load()` for every execution, validates the complete module graph and
content digest before loading, disables global outbound access, and supplies only one request-scoped capability RPC
binding plus non-secret protocol identity constants. The host must turn the supplied RPC implementation into a
Cloudflare service binding, normally with a request-scoped `ctx.exports` loopback binding.

The adapter passes `limits.cpuMs` and `limits.subrequests` as the dynamic-worker stage contract. The pinned local
`workerd` does not currently provide observable enforcement evidence for these two WorkerCode fields, so releases
that require those resource guarantees must remain disabled until the target Cloudflare environment confirms them.
Deadline, cancellation, output size, source identity, codec identity, and closed capability authority are enforced by
the adapter independently.
