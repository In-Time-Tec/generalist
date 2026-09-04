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

`Runtime.previews({ runId })` observes bounded append frames for text and reasoning from the live Runtime process. Contiguous per-attempt sequences and per-channel UTF-16 offsets let consumers detect a dropped frame. This lane is intentionally lossy, droppable, and non-authoritative: it is not stored, cursor-addressed, checkpointed, durably replayed, transported, or folded into FoldKit Chat.Model. Losing every preview does not change execution or the eventual semantic response event.

## Choose the storage layer

| Layer                         | Use it for                                                       |
| ----------------------------- | ---------------------------------------------------------------- |
| `Runtime.layerMemory`         | Local development and tests; all state is lost with the process  |
| `SqliteRuntime.layerSqlite`   | Durable single-process execution with automatic schema migration |
| `layer from generalist/pg`    | Durable multi-worker execution on PostgreSQL                     |
| `layer from generalist/mysql` | Durable multi-worker execution on MySQL 8+                       |

PostgreSQL and MySQL startup verifies an already-applied schema rather than running DDL. Use `RuntimeSchema from generalist/pg` for PostgreSQL or `RuntimeSchema from generalist/mysql` for MySQL in a predeploy migration step.

Import `Runtime as SqliteRuntime` from `generalist/runtime/sqlite-bun`. The generic `generalist/runtime` entrypoint does not load or require the SQLite peer.

## The package boundary

Core does not depend on Runtime, so the same agent value works in a script, deterministic test, or durable worker. Runtime depends on core, persists the closed executable manifest at admission, reconstructs its exact Agent and service Layers through a scoped resolver during execution, journals model and tool operations, and commits lifecycle state around the core driver. Transport then projects Runtime-owned events; it does not invent a second session or persistence model.

See [the generalist/runtime reference](/reference/runtime) for the public namespaces and [Serve over SSE and WebSocket](/guides/serve-transport) for a complete projection flow.
