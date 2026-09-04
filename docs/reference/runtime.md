---
title: "generalist/runtime"
description: "Addressable Run admission, canonical events, inspection, waits, stores, and workers."
---

generalist/runtime owns the authoritative lifecycle for addressable Generalist runs.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## Core surface

| Namespace                              | Role                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Runtime`                              | Admission, durable events and history, disposable live previews, listing, waits, signals, cancellation, and inspection |
| `RunEvent`                             | Canonical persisted lifecycle and agent-loop event schema                                                              |
| `RunStore`                             | Memory and SQLite storage seam                                                                                         |
| `generalist/runtime/sql-driver`        | `RunClaims` multi-worker claims and leases                                                                             |
| `generalist/runtime/sql-driver`        | `RuntimeWorker` hosted worker loops                                                                                    |
| `Address` / `ExecutableRef` / `Cursor` | Schema-backed boundary identities                                                                                      |

## Staged root activation

`Runtime.admit(input)` is the low-level pinned-executable path that durably admits exactly one caller-identified root as queued without allowing a worker, scheduler, model, or tool to execute it. `Runtime.activate({ runId })` independently makes that root runnable and returns its current `RunInspection`. Activation and cancellation serialize in the authoritative store: cancellation that wins remains terminal across later activation, while duplicate activation appends only one attempt. Exact repeated admission returns the same receipt; changed payloads and conflicting Run IDs fail typed. `Runtime.register(agent)` and `Runtime.start(agent, input, options?)` are the ordinary typed immediate path.

## Semantic history and disposable previews

`Runtime.events` and `Runtime.history` expose semantic model outcomes: one `ModelResponseCommitted` after a successful model operation, or one `ModelResponseInterrupted` when a run settles after partial output. Each compact persisted event references the exact Session entry that stores the normalized response content once. `Runtime.resolveModelResponse` verifies and hydrates that reference, and transport adapters emit the resolved observer view.

`Runtime.previews({ runId })` is a separate process-local observer for append-only text and reasoning while a provider attempt is live. Each frame and cadence buffer is bounded to `ModelPreview.MaxPayloadCharacters` UTF-16 code units and cadence-limited by `ModelPreview.MaxCadenceMillis`. Frame sequences and per-channel UTF-16 offsets expose loss to slow or late subscribers. Preview events are lossy, safe to drop, and never written to a database, assigned a RunEvent sequence, included in a cursor or checkpoint, replayed durably, or projected through the transport and FoldKit Chat contracts.

## Runtime layers

`Runtime.layerMemory` is ephemeral and loses state when its process exits. `SqliteRuntime.layerSqlite` from `generalist/runtime/sqlite-bun` is durable for one process. `layer from generalist/pg` and `layer from generalist/mysql` support multi-worker claims and require the schema to be applied before Runtime startup. PostgreSQL uses `generalist/pg RuntimeSchema`; MySQL 8+ uses `generalist/mysql RuntimeSchema`.

See [transport](/reference/transport), [A2A](/reference/a2a), and [AG-UI](/reference/ag-ui) for projections.
