# `@batonfx/transport`

SSE, WebSocket, and reconnect adapters for canonical `@batonfx/runtime` RunEvents.

## Install

```sh
bun add effect @batonfx/runtime @batonfx/transport
```

## Follow A Run

```ts
import { Effect } from "effect"
import { Sse, Snapshot } from "@batonfx/transport"

const snapshot = Snapshot.get(runId)

const response = Sse.respond({
  runId,
  request,
  keepAlive: "15 seconds",
})
```

Provide the same `Runtime.Runtime` Layer used by the worker host. `Sse.respond` reads `Last-Event-ID` first and then the `cursor` query parameter. Both are exclusive Runtime cursors.

## WebSocket

`Ws.handle` binds one socket to one Run after an `Attach` command. The socket streams canonical RunEvents and accepts an explicit `Cancel` command. Disconnecting only releases the observer; it does not cancel the Run.

```ts
import { Client } from "@batonfx/transport"

const connection =
  yield * Client.RunClient.use((client) => client.connect({ url: "wss://example.test/runs", runId, cursor }))

yield * connection.cancel("user requested cancellation")
```

The client owns a bounded event queue and reconnects from the last event admitted to that queue. Runtime subscriber lag carries the last delivered sequence so replay can resume without inventing a terminal or snapshot frame.

## Wire Contract

`Wire.producerCodec` encodes Runtime-owned RunEvents. `Wire.observerCodec` retains unknown future event tags while validating their common identity and sequence fields. `Snapshot.get` is the point-in-time recovery resource and remains outside the RunEvent log.

Public namespaces are `Client`, `Errors`, `Snapshot`, `Sse`, `Wire`, and `Ws`.
