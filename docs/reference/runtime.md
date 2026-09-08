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

| Namespace                                               | Role                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Runtime`                                               | Admission, durable events and history, disposable live previews, listing, waits, signals, cancellation, and inspection |
| `RunEvent`                                              | Canonical persisted lifecycle and agent-loop event schema                                                              |
| `RunStore`                                              | Canonical Run state and operation storage contract                                                                     |
| `generalist/durability`                                 | Shared object engine, reconstruction, and explicit scoped activation                                                   |
| `generalist/durability/s3` / `generalist/durability/r2` | Conditional-create object transports                                                                                   |
| `Address` / `ExecutableRef` / `Cursor`                  | Schema-backed boundary identities                                                                                      |

## Staged root activation

`Runtime.admit(input)` is the low-level pinned-executable path that durably admits exactly one caller-identified root as queued without allowing a worker, scheduler, model, or tool to execute it. `Runtime.activate({ runId })` independently makes that root runnable and returns its current `RunInspection`. Activation and cancellation serialize in the authoritative store: cancellation that wins remains terminal across later activation, while duplicate activation appends only one attempt. Exact repeated admission returns the same receipt; changed payloads and conflicting Run IDs fail typed. `Runtime.register(agent)` and `Runtime.start(agent, input, options?)` are the ordinary typed immediate path.

## Semantic history and disposable previews

`Runtime.events` and `Runtime.history` expose semantic model outcomes: one `ModelResponseCommitted` after a successful model operation, or one `ModelResponseInterrupted` when a run settles after partial output. Each compact persisted event references the exact Session entry that stores the normalized response content once. `Runtime.resolveModelResponse` verifies and hydrates that reference, and transport adapters emit the resolved observer view.

Session observation is a distinct projection over the same canonical state. `Runtime.sessionSnapshot(sessionId)` returns version-1 Session metadata, bounded Run projections, and the active-path conversation with original entry IDs, parents, and leaf identity. `Runtime.sessionEvents` emits tagged `Run | Conversation` entries on one exclusive Session cursor. Conversation updates describe retained-prefix/suffix replacement; they do not turn the Run journal into a transcript. Internal system/instruction, memory, and skill bodies are omitted from display messages, and [snapshot bounds](/features/server#snapshot-limits) fail with `SessionSnapshotTooLarge` rather than truncate.

`Runtime.previews({ runId })` is a separate process-local observer for append-only text and reasoning while a provider attempt is live. Each frame and cadence buffer is bounded to `ModelPreview.MaxPayloadCharacters` UTF-16 code units and cadence-limited by `ModelPreview.MaxCadenceMillis`. Frame sequences and per-channel UTF-16 offsets expose loss to slow or late subscribers. Preview events are lossy, safe to drop, and never persisted, assigned a RunEvent sequence, included in a cursor or checkpoint, or replayed durably. The Host admits authority-checked previews to a separate WebSocket delivery lane; FoldKit displays them as an ephemeral overlay, not canonical conversation entries. See [recovery and client truth](/learn/architecture-recovery#two-snapshot-meanings-two-output-lanes).

## Runtime layers

`Durability.layer` from `generalist/durability` reconstructs the sole production Runtime from S3 or native R2. Supply explicit environment, tenant, partition, Crypto, and executable resolver services. Construction is read-only; `Durability.activate` acquires host authority and starts owned execution inside a scope. Do not confuse host activation with `runtime.activate({ runId })`, which makes a staged root runnable.

Local processes, servers, Cloudflare Durable Objects, and Rivet actors are compute choices over that same engine. There is no production memory, filesystem, or SQL Runtime. `generalist/testing/durability` is a test-only object simulator; process-local Agents need neither it nor Runtime. See [object durability](/features/durable-stores) for configuration and local qualification limits.

Caller mutations carry stable command identities: environmental wake takes `{ runId, commandId, event }`, with `event.dedupeKey` separately identifying the external delivery. Steering and operator actions also preserve command IDs across retries. An exact retry returns the original immutable receipt, including its original `duplicate` field; a new command ID means a distinct request.

See [transport](/reference/transport), [A2A](/reference/a2a), and [AG-UI](/reference/ag-ui) for projections.
