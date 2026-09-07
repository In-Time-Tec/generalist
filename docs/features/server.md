---
title: "Server"
description: "Authenticate and authorize a Host API with committed Session snapshots and event cursors."
---

`generalist/server` is the stable HTTP boundary over one `Host`. One schema-first `Server.api` declares authenticated attachment, Session, Run, event, approval, and operator groups; `Server.layer` implements that API, serves its OpenAPI document, and delegates all state and execution to the Host.

## Usage

```ts
import { Config, Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { Server } from "generalist/server"

const agent = Agent.make({ name: "support" })

const apiLayer = Layer.unwrap(
  Generalist.create({ agents: [agent] }).pipe(
    Effect.map((host) =>
      Server.layer({
        host,
        auth: Server.authBearer({
          token: Config.redacted("GENERALIST_SERVER_TOKEN"),
          principal: { id: "support-service", tenantId: "support", role: "controller" },
        }),
        authorization: { tenantId: "support", authorize: () => Effect.succeed(true) },
      }),
    ),
  ),
)

const app = HttpRouter.serve(apiLayer)
declare const services: Layer.Layer<never, never, Approvals.Approvals | Permissions.Permissions>
void app
void services
```

This is a composition fragment, not a runnable server. Provide the activated object-backed Host dependencies and platform HTTP server. The permissive resource callback above is for a single-principal demonstration; a real application must authorize each resource.

`Server.layer({ host, auth, authorization, operator? })` returns an Effect `HttpApiBuilder` Layer. `operator` defaults to false. Operator reads remain available, while mutation routes return `OperatorDisabled` until the server is built with `operator: true`.

`Server.authBearer({ token, principal })` rejects an empty token or invalid principal at construction. The principal has nonempty `id` and `tenantId` plus role `controller` or `spectator`. Authorization checks tenant identity, prevents spectator mutations, and invokes the application resource policy before bytes or mutations cross the boundary. Custom `Server.Authentication` implementations must provide `Server.CurrentPrincipal`. Operator attribution uses that authenticated principal. `/openapi.json` is public; every declared API route uses Authentication.

## Typed client

```ts
import { Effect, Stream } from "effect"
import { HttpClient } from "effect/unstable/http"
import { Server } from "generalist/server"

const program = Effect.gen(function* () {
  const client = yield* Server.client({ baseUrl: "https://agents.example.com" })
  const session = yield* client.sessions.create({ title: "Support" })
  const run = yield* client.runs.start({
    sessionId: session.id,
    agent: "support",
    input: "Cannot sign in",
  })
  const events = yield* client.events.subscribe({ sessionId: session.id }).pipe(Stream.runCollect)
  return { run, events }
})

declare const authenticatedHttpClient: HttpClient.HttpClient
void program.pipe(Effect.provideService(HttpClient.HttpClient, authenticatedHttpClient))
```

`Server.client` is generated from the same `Server.api` declaration as the server. Its public surface is:

```text
client.attachments.put({ data, mediaType, filename? })
client.attachments.get({ sha256 }) -> { body: Uint8Array, headers }
client.sessions.create/get/list/snapshot
client.runs.start/list/inspect/cancel
client.events.subscribe({ sessionId, cursor?, reconnect? })
client.events.connect({ sessionId, eventCapacity?, reconnect? })
client.approvals.resolve({ runId, token, decision, operator })
client.operator.explain/retry/wake/resolveUnknown/extendBudget
```

The caller provides an Effect `HttpClient`. Add the bearer token there with `HttpClient.mapRequest(HttpClientRequest.bearerToken(...))`. WebSocket construction also requires `Socket.WebSocketConstructor` and a Scope.

## Routes

| Group       | Method | Path                         | Client call               |
| ----------- | ------ | ---------------------------- | ------------------------- |
| attachments | POST   | `/attachments`               | `attachments.put`         |
| attachments | GET    | `/attachments/:sha256`       | `attachments.get`         |
| sessions    | POST   | `/sessions`                  | `sessions.create`         |
| sessions    | GET    | `/sessions`                  | `sessions.list`           |
| sessions    | GET    | `/sessions/:id`              | `sessions.get`            |
| sessions    | GET    | `/sessions/:id/snapshot`     | `sessions.snapshot`       |
| runs        | POST   | `/sessions/:sessionId/runs`  | `runs.start`              |
| runs        | GET    | `/sessions/:sessionId/runs`  | `runs.list`               |
| runs        | GET    | `/runs/:id`                  | `runs.inspect`            |
| runs        | POST   | `/runs/:id/cancel`           | `runs.cancel`             |
| events      | GET    | `/sessions/:id/events`       | `events.subscribe`        |
| events      | GET    | `/sessions/:id/ws`           | `events.connect`          |
| approvals   | POST   | `/runs/:id/approvals/:token` | `approvals.resolve`       |
| operator    | GET    | `/runs/:id/explain`          | `operator.explain`        |
| operator    | POST   | `/runs/:id/retry`            | `operator.retry`          |
| operator    | POST   | `/runs/:id/wake`             | `operator.wake`           |
| operator    | POST   | `/runs/:id/resolve-unknown`  | `operator.resolveUnknown` |
| operator    | POST   | `/runs/:id/extend-budget`    | `operator.extendBudget`   |

Future ingress features add one HttpApi group to `Server.api` and one matching implementation module. They do not create another router or wire contract.

`POST /attachments` sends an `application/octet-stream` body with required `x-media-type` and optional `x-filename` headers, returning `Media.Ref` as JSON. `GET /attachments/:sha256` returns the bytes with their stored `content-type` and optional `x-filename`. The generated client constructs upload headers and decodes the buffered download. Both routes use the same Authentication middleware as every other declared route.

## SSE and WebSocket

Both streaming transports carry the same Schema-validated `Server.HostEvent`. Events are Session-scoped and use the Host's durable exclusive cursor. SSE sets `id` to the Host cursor, uses the Host wrapper tag as `event`, and JSON-encodes the complete HostEvent as `data`. `Last-Event-ID` takes precedence over the `cursor` query parameter.

Both event routes resolve the Session before committing an SSE response or upgrading a WebSocket. An unknown Session therefore returns the declared `SessionNotFound` JSON body with HTTP 404. If an SSE stream fails after its HTTP 200 headers have been committed—for example, because its cursor expired or its subscriber lagged—Effect HttpApi emits one terminal `effect/httpapi/stream/failure` event containing the encoded `ApiError`, then closes the stream. The generated client decodes that event into the typed stream failure.

The WebSocket URL is `/sessions/:id/ws`. Server frames use `Server.eventCodec`. The client cancellation command is `{ _tag: "Cancel", runId, commandId, reason? }`; the server verifies that the Run belongs to the path Session before cancelling it. Preserve `commandId` when retrying. Closing a stream only stops observation.

The default client reconnect schedule is jittered exponential backoff bounded by two elapsed minutes. Reconnection resumes strictly after the last admitted Host cursor. A bounded WebSocket queue prevents an unbounded slow-client buffer.

Browser WebSocket constructors cannot attach an Authorization header. A bearer-protected browser should use the SSE and HTTP methods, or the application should provide an Authentication implementation compatible with its cookie or gateway policy rather than putting credentials in a WebSocket URL.

## Session snapshot and resynchronization

`client.sessions.snapshot({ sessionId })` reads a bounded authoritative Session snapshot with its exclusive cursor. `client.events.connect({ sessionId })` obtains that snapshot before observation; the connection exposes `snapshot`, events, and status. FoldKit establishes a connection-local epoch from the snapshot and rejects events from obsolete epochs. A reconnect can rebuild the view from committed state without submitting a new user message. Snapshots are inspection resources, not a second journal, and oversized snapshots fail with `SessionSnapshotTooLarge`.

Browser authentication and snapshot/resync are implemented contracts, not a claim of completed browser acceptance. Verify your own cookie/header policy, tenant denials, initial view, reconnect, lag, and spectator behavior before deployment.

## Invariants

- Host is the only Session, Run, execution, approval, operator, and cursor authority.
- The server validates every serialized request, response, event, and command with Schema.
- SSE and WebSocket share one HostEvent codec and one exclusive Session cursor contract.
- Operator mutations are denied by default even though their typed routes remain discoverable.
- `/openapi.json` and `docs/openapi.json` come from `Server.api`; `bun run test` checks the committed document for drift.
- The server does not expose Runtime model-response records that Host intentionally filters from its product event projection.

## Related

- Snapshot tests: [`host/snapshot-suite.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/host/snapshot-suite.ts)
- Authorization tests: [`server/auth.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/server/auth.test.ts)
- Source: `packages/generalist/src/server/`
- OpenAPI: [`../openapi.json`](../openapi.json)
- Sibling features: [`media.md`](./media.md), [`host.md`](./host.md), [`transport.md`](./transport.md), [`recovery.md`](./recovery.md)
