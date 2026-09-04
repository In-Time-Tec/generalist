---
title: "generalist/server"
description: "One typed HttpApi over a Host with HTTP, SSE, WebSocket, authentication, and OpenAPI."
---

generalist/server exposes one Host through a schema-first Effect HttpApi and generates its client from that same contract.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## Exports

| Export              | Role                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `Server.api`        | HttpApi with sessions, runs, events, approvals, and operator groups |
| `Server.layer`      | Host-backed route implementation and /openapi.json                  |
| `Server.authBearer` | Bearer Authentication Layer from a redacted Config                  |
| `Server.client`     | Typed HTTP, SSE, and WebSocket client                               |
| `Server.eventCodec` | Shared HostEvent WebSocket codec                                    |

## Session events

`client.events.subscribe({ sessionId, cursor? })` follows SSE. `client.events.connect({ sessionId, cursor? })` opens WebSocket. Both carry the same HostEvent and resume strictly after the last durable Session cursor. Last-Event-ID takes precedence over the SSE query cursor.

Both routes resolve the Session before committing the response, so an unknown Session returns the typed `SessionNotFound` body with HTTP 404 instead of opening a stream. After SSE headers are committed, a cursor, lag, or Runtime failure is sent as one terminal `effect/httpapi/stream/failure` event containing the encoded `ApiError`; the generated client exposes it as the stream failure.

## Commands and inspection

The client creates and lists Sessions, starts named configured Agents, lists, inspects, and cancels Runs, resolves durable approvals, and calls the Runtime operator surface. Operator mutations return a typed 403 unless the host opts in with `operator: true`. Closing a stream never cancels execution.

See [generalist/runtime](/reference/runtime) for Run ownership and [generalist/unstable/foldkit](/reference/foldkit) for the UI projection.
