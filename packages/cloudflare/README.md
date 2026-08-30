# @tenetkit/cloudflare

Cloudflare Workers and Durable Objects adapters for TenetKit.

```bash
bun add effect@4.0.0-rc.112 tenetkit@0.44.0 @tenetkit/cloudflare@0.44.0
```

The package root is intentionally not exported. Import only `@tenetkit/cloudflare/workers`, `@tenetkit/cloudflare/durable-objects`, or `@tenetkit/cloudflare/dynamic-workers`; these are Worker entrypoints, not Node or Bun runtime claims.

## Durable Run activation

`@tenetkit/cloudflare/durable-objects` stores only its scheduling projection in
`tenetkit_activations`. Run authority remains in the existing `tenetkit_*` tables.
Import `SqliteRunActivation` and `makeExclusiveExecutionRecovery` from
`tenetkit/runtime/sql-driver`. Construct `SqliteRunActivation.makeProjection(sql, rearm)` with the same full-storage SQLite client
used by `layerRunStore`; `rearm` must synchronously compute the host-wide minimum
due time and call the top-level Durable Object storage alarm API. The Run change,
candidate change, and alarm then share one storage transaction. It must not await
network work. Final-state projection is limited to Runs touched by that mutation;
an inactive final state deletes its candidate before `rearm` runs.

Call `SqliteRunActivation.initialize(rearm)` once inside a SQL transaction to reconstruct
candidates after the runtime has verified its schema metadata and checksum. The
runtime schema is one baseline, migration 1 `tenetkit_runtime` at version 1. The
adapter table is not part of that schema and does not change its version. On each fresh exclusive host incarnation, call
`makeExclusiveExecutionRecovery(...).recoverClaims(...)` before `SqliteRunActivation.drain(...)`.
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

The executor identity is a schema-backed, immutable declaration of the provider, adapter/runtime/template versions,
fresh-worker persistence, physical isolation boundary, default-deny network posture, exact enforcement owner for each
limit, and bounded known limitations. It contains no credentials or mutable Worker IDs. Admission runs before module
normalization or `loader.load()` and fails rather than weakening any requested guarantee. `makeUnavailable()` declares
every guarantee unenforced and cannot admit production execution.

The adapter passes `limits.cpuMs` and `limits.subRequests` to Worker Loader for every fresh execution. Deadline and
caller cancellation abort the guest request and active host callbacks; the callback fence closes before return. Output
is counted while reading the response stream and the reader is cancelled on overflow, deadline, or caller cancellation.
The complete protocol version, request, source digest, and input/output codec identity must match the response envelope.

The exported `tenetkit/test` provider suite and the VM Worker Loader fixture prove adapter protocol semantics, fresh
module/global state, exact capability closure, ambient host denial, bounded output, interruption, and cleanup. The
pinned local `workerd --experimental` test proves the real Worker Loader accepts `subRequests`, creates a fresh worker
for each `load()`, exposes no parent environment or process-spawn API, and enforces `globalOutbound: null`. Neither test
proves Cloudflare's production physical-isolation implementation or production CPU/subrequest governors.

Production CPU/subrequest enforcement and production-observable freshness and egress behavior require the opt-in
credentialed gate. Set
`TENETKIT_CLOUDFLARE_DYNAMIC_WORKER_CONFORMANCE_URL` and
`TENETKIT_CLOUDFLARE_DYNAMIC_WORKER_CONFORMANCE_TOKEN` for a deployed harness that exposes
`/sandbox-conformance/{cpu,subrequests,isolation}` with the response contract in
`test/dynamic-workers-live.test.ts`. Without that gate, local results are protocol/runtime evidence only and must not be
reported as production resource-enforcement evidence. Even the live gate proves only behavior visible through the
request boundary; Cloudflare's documentation and assurance material, not this suite, own the physical-isolate claim.
