# Transport

Stable `generalist/server` exposes product Sessions through one schema-first HTTP API, a committed conversation snapshot, and SSE/WebSocket observation on the Host Session cursor.

```ts
import { Effect, Stream } from "effect"
import { Server } from "generalist/server"

const firstEvent = Effect.gen(function* () {
  const client = yield* Server.client({ baseUrl: "https://agents.example.com" })
  return yield* client.events.subscribe({ sessionId: "session-42" }).pipe(Stream.runHead)
})
```

Test: [`server/websocket.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/server/websocket.test.ts)

## Current contract

```text
Server.api
├── Server.layer({ host, auth, authorization, operator? })
│   ├── HTTP commands and inspection
│   ├── GET /sessions/:id/snapshot
│   ├── GET /sessions/:id/events   (SSE)
│   ├── GET /sessions/:id/ws       (WebSocket)
│   └── GET /openapi.json
└── Server.client({ baseUrl })
    ├── sessions / runs / approvals / operator
    └── events.subscribe / events.connect
```

SSE and WebSocket carry `Server.HostEvent`, including committed `Conversation` updates and Run-derived lifecycle events. Both use the Host Session's durable exclusive cursor, not a count of visible events and not a per-Run sequence. Runtime's underlying `HostSessionEvent` is tagged `Run | Conversation`. Run events that Host does not project are absent from the wire, so adjacent visible cursors need not be consecutive.

## Snapshot-first observation

`client.sessions.snapshot({ sessionId })` returns the version-1 Session metadata, Run projections, active-path conversation, and exact cursor. `client.events.connect({ sessionId })` obtains that snapshot before following changes strictly after its cursor. `client.events.subscribe({ sessionId, cursor })` supplies cursor-based SSE observation when the caller already owns its starting state.

Conversation entries preserve original Session entry IDs, parents, and leaf identity while omitting system/instruction, memory, and skill bodies. An update retains the visible prefix through `afterEntryId` and replaces its suffix; it can represent a branch change without any Run event. FoldKit restores user/tool/assistant rows from this conversation and fetches a fresh snapshot when the previous leaf or prefix is inconsistent. [Snapshot bounds](./server.md#snapshot-limits) reject oversized projections instead of truncating them.

Create a Host Session before starting a Run and retain its ID for snapshots and streaming. Cancel explicitly with `client.runs.cancel({ runId, commandId, reason? })` or `connection.cancel(runId, commandId, reason?)`.

## Invariants

- Runtime remains the execution and persistence authority; Host owns product Session membership and cursors.
- `Last-Event-ID` takes precedence over the SSE `cursor` query parameter.
- Reconnect cursors are exclusive: cursor `n` requests visible Host events after the authoritative Session entry at `n`.
- Closing SSE or WebSocket never cancels a Run; cancellation is explicit.
- Session-scoped WebSocket cancellation names a Run and rejects a Run outside that Session.
- Conversation changes and Run events have one cursor and one canonical state authority; reconnect does not submit another user message or redispatch completed work.

See [`server.md`](./server.md) for setup, routes, auth, clients, and OpenAPI.
