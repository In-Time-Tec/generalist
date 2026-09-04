---
title: "generalist/unstable/foldkit"
description: "FoldKit connection and headless Chat projections over Runtime RunEvents."
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
| `Connection` | Scoped Run connection, reconnect status, event stream, and explicit commands            |
| `Chat`       | Headless model, update function, commands, subscriptions, outputs, and view projections |

## Connection

`Connection.layerWebSocket` uses the Server reconnecting client. A scoped connection observes one Host Session from an exclusive cursor and sends explicit cancellation. `Connection.layerTest` provides a deterministic seam for tests.

## Chat

`Chat.update(model, action)` folds connection status and HostEvents into tool entries, explicit run state, approvals, and terminal output. Host filters model-response records, so the Server projection does not reconstruct assistant response entries. `Chat.subscriptions` owns scoped durable observation; command failures return through typed Chat actions. `Chat.Model` has no authoritative streaming-text field. A host that explicitly consumes `Runtime.previews` must keep that disposable state outside Chat.

See [generalist/runtime](/reference/runtime) and [generalist/server](/reference/transport).
