# Transport

HTTP, SSE, and WebSocket transport now belong to stable `generalist/server`. The removed `generalist/unstable/transport/*` entrypoints exposed raw per-Run Runtime history; the current contract exposes product Sessions and their Host event cursor through one schema-first HttpApi.

## Current contract

```text
Server.api
├── Server.layer({ host, auth, operator? })
│   ├── HTTP commands and inspection
│   ├── GET /sessions/:id/events   (SSE)
│   ├── GET /sessions/:id/ws       (WebSocket)
│   └── GET /openapi.json
└── Server.client({ baseUrl })
    ├── sessions / runs / approvals / operator
    └── events.subscribe / events.connect
```

SSE and WebSocket carry `Server.HostEvent`. Its cursor is the Host Session's durable exclusive cursor, not a count of visible events and not a per-Run sequence. Runtime events that the Host does not project are absent, so adjacent Host cursors need not be consecutive.

## Migration from the removed transport exports

| Removed API                        | Replacement                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `RunClient.streamSSE`              | `client.events.subscribe({ sessionId, cursor? })`                               |
| `RunClient.connect`                | `client.events.connect({ sessionId, cursor? })`                                 |
| WebSocket `Cancel`                 | `client.runs.cancel({ runId, reason? })` or `connection.cancel(runId, reason?)` |
| `Snapshot.get`                     | `client.runs.inspect({ runId })`                                                |
| `Replay.page`                      | `client.events.subscribe({ sessionId, cursor })`                                |
| `Wire.observerCodec`               | `Server.eventCodec`                                                             |
| `SSE.respond` / `WebSocket.handle` | mount `Server.layer({ host, auth })`                                            |

There are no compatibility subpaths or transport shims. A caller must create a Host Session before starting a Run and retain the Session ID for streaming.

## Invariants

- Runtime remains the execution and persistence authority; Host owns product Session membership and cursors.
- `Last-Event-ID` takes precedence over the SSE `cursor` query parameter.
- Reconnect cursors are exclusive: cursor `n` requests visible Host events after the authoritative Session entry at `n`.
- Closing SSE or WebSocket never cancels a Run; cancellation is explicit.
- Session-scoped WebSocket cancellation names a Run and rejects a Run outside that Session.
- The removed Cloudflare hibernating per-Run replay adapter was not retained because it cannot implement authoritative Session replay from a finite page API.

See [`server.md`](./server.md) for setup, routes, auth, clients, and OpenAPI.
