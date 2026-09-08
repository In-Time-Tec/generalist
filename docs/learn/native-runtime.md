---
title: "Core and Runtime: where durability lives"
description: "How the process-local generalist agent loop composes with the native generalist/runtime for durable, addressable runs."
---

`generalist` owns the agent loop: model turns, tool execution, policies, approvals, and typed AgentEvents. It can run by itself and keeps no durable execution state. `generalist/runtime` is Generalist's optional native durable host. It persists a constructor-verified executable manifest and exact active reference with each finite, addressable Run, alongside one canonical RunEvent stream.

## What Runtime owns

- Idempotent admission through `send` and child execution through `spawn`.
- Stable Run identity, ordered RunEvents, exclusive replay cursors, inspection, snapshots, and finite history.
- Normalized model outcomes as one `ModelResponseCommitted` or terminal `ModelResponseInterrupted` event; raw provider parts never enter durable history.
- Durable waits, responses, signals, cancellation, parent-child links, and operation recovery.
- Address bindings carry a pinned `{ ref, manifest }` authority. Admission persists that pair without reconstructing live code.
- A caller-supplied `ExecutableResolver` reconstructs the exact Agent and services only in the execution scope, then attests the persisted identity before work begins.

## Live previews are outside durability

`Runtime.previews({ runId })` observes bounded append frames for text and reasoning from the live Runtime process. The Host checks current attempt authority before admitting a `PreviewDelivery` over WebSocket; these deliveries never advance the durable Session cursor. SSE carries canonical events only.

FoldKit renders previews as an ephemeral overlay rather than conversation entries. It checks connection epochs, attempt authority, contiguous per-attempt sequences, and per-channel UTF-16 offsets; gaps clear and tombstone the preview. This lane is intentionally lossy and non-authoritative: it is not stored, checkpointed, or durably replayed. Losing every preview does not change execution or the eventual semantic response event. See [recovery and client truth](/learn/architecture-recovery#two-snapshot-meanings-two-output-lanes).

## Choose a transport, not another state machine

`generalist/durability` supplies the single production engine. Provide `generalist/durability/s3` for an S3 object endpoint or `generalist/durability/r2` for a native R2 binding, plus Crypto and the executable resolver. Each Runtime names its environment, tenant, and partition explicitly.

The partition is the atomic boundary: related Runs, Sessions, and children must be colocated when they change together. Object conditional creation, not a local mutex or a host alarm, orders commits. There are no cross-partition transactions or exactly-once external effects.

For a process-local agent, call `Agent.run` without Runtime. The simulator in `generalist/testing/durability` runs the production engine against test objects; it is not durable and must never be a production fallback. Local durability development uses an explicitly configured compatible object server.

See [object durability](/features/durable-stores) for runnable setup, provider requirements, bounds, and backup/restore.

## The package boundary

Core does not depend on Runtime, so the same agent value works in a script, deterministic test, or durable worker. Runtime depends on core, persists the closed executable manifest at admission, reconstructs its exact Agent and service Layers through a scoped resolver during execution, journals model and tool operations, and commits lifecycle state around the core driver. Transport then projects Runtime-owned events; it does not invent a second session or persistence model.

See [the generalist/runtime reference](/reference/runtime) for the public namespaces and [Serve over SSE and WebSocket](/guides/serve-transport) for a complete projection flow.
