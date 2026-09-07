---
title: "generalist/unstable/foldkit"
description: "Snapshot-first Session conversation restore, live HostEvents, and headless Chat projections."
---

generalist/unstable/foldkit adapts Server HostEvents and explicit commands to FoldKit's Elm architecture without owning run lifecycle state.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist foldkit@0.148.2
```

`generalist/unstable/foldkit` is an import subpath; foldkit is its optional peer dependency.

## Exports

| Namespace    | Role                                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| `Connection` | Scoped Session snapshot and event delivery, reconnect status, and explicit commands     |
| `Chat`       | Headless model, update function, commands, subscriptions, outputs, and view projections |

## Connection

`Connection.layerWebSocket` uses the Server reconnecting client. A scoped connection first delivers a committed Session snapshot and then follows its exclusive cursor. Snapshot and live Conversation updates retain original entry and leaf identities. An invalid previous leaf, retained-prefix anchor, or duplicate identity triggers bounded snapshot resynchronization under a new connection-local epoch; stale-epoch deliveries are ignored. `Connection.layerTest` provides a deterministic seam for tests.

## Chat

`Chat.update(model, action)` restores user messages, assistant text/reasoning, and tool calls/results from the snapshot's bounded active-path conversation. Conversation updates retain a visible prefix and replace its suffix, including on rewind or branch change. Run-derived HostEvents update turns, tool progress, approvals, and terminal state without synthesizing transcript entries from Run summaries. Instruction, memory, and skill bodies are omitted from the display projection; [snapshot limits](/features/server#snapshot-limits) reject rather than truncate.

`Chat.subscriptions` owns scoped durable observation; command failures return through typed Chat actions. `Chat.Model` has no authoritative streaming-text field. A host that explicitly consumes `Runtime.previews` must keep that disposable state outside Chat.

See [generalist/runtime](/reference/runtime) and [generalist/server](/reference/transport).
