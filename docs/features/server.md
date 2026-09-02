# Server

`generalist/server` is the stable HTTP boundary over one `Host`. One schema-first `Server.api` declares authenticated Session, Run, event, approval, and operator groups; `Server.layer` implements that API, serves its OpenAPI document, and delegates all state and execution to the Host.

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
        auth: Server.authBearer(Config.redacted("GENERALIST_SERVER_TOKEN")),
      }),
    ),
  ),
)

const app = HttpRouter.serve(apiLayer)
declare const services: Layer.Layer<never, never, Approvals.Approvals | Permissions.Permissions>
void app
void services
```

`Server.layer({ host, auth, operator? })` returns an Effect `HttpApiBuilder` Layer. Mount that Layer with the platform `HttpServer` used by the application. `operator` defaults to false. Operator reads remain available, while mutation routes return `OperatorDisabled` until the server is built with `operator: true`.

`Server.authBearer(Config.redacted(...))` supplies the built-in bearer-token policy. Authentication is an Effect HttpApi middleware Layer, so a host can provide its own `Server.Authentication` implementation. `/openapi.json` is public so tools can discover the contract; every declared API route uses Authentication.

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
client.sessions.create/get/list
client.runs.start/list/inspect/cancel
client.events.subscribe({ sessionId, cursor?, reconnect? })
client.events.connect({ sessionId, cursor?, eventCapacity?, reconnect? })
client.approvals.resolve({ runId, token, decision, operator })
client.operator.explain/retry/wake/resolveUnknown/extendBudget
```

The caller provides an Effect `HttpClient`. Add the bearer token there with `HttpClient.mapRequest(HttpClientRequest.bearerToken(...))`. WebSocket construction also requires `Socket.WebSocketConstructor` and a Scope.

## Routes

| Group     | Method | Path                         | Client call               |
| --------- | ------ | ---------------------------- | ------------------------- |
| sessions  | POST   | `/sessions`                  | `sessions.create`         |
| sessions  | GET    | `/sessions`                  | `sessions.list`           |
| sessions  | GET    | `/sessions/:id`              | `sessions.get`            |
| runs      | POST   | `/sessions/:sessionId/runs`  | `runs.start`              |
| runs      | GET    | `/sessions/:sessionId/runs`  | `runs.list`               |
| runs      | GET    | `/runs/:id`                  | `runs.inspect`            |
| runs      | POST   | `/runs/:id/cancel`           | `runs.cancel`             |
| events    | GET    | `/sessions/:id/events`       | `events.subscribe`        |
| events    | GET    | `/sessions/:id/ws`           | `events.connect`          |
| approvals | POST   | `/runs/:id/approvals/:token` | `approvals.resolve`       |
| operator  | GET    | `/runs/:id/explain`          | `operator.explain`        |
| operator  | POST   | `/runs/:id/retry`            | `operator.retry`          |
| operator  | POST   | `/runs/:id/wake`             | `operator.wake`           |
| operator  | POST   | `/runs/:id/resolve-unknown`  | `operator.resolveUnknown` |
| operator  | POST   | `/runs/:id/extend-budget`    | `operator.extendBudget`   |

Future ingress features add one HttpApi group to `Server.api` and one matching implementation module. They do not create another router or wire contract.

## SSE and WebSocket

Both streaming transports carry the same Schema-validated `Server.HostEvent`. Events are Session-scoped and use the Host's durable exclusive cursor. SSE sets `id` to the Host cursor, uses the Host wrapper tag as `event`, and JSON-encodes the complete HostEvent as `data`. `Last-Event-ID` takes precedence over the `cursor` query parameter.

The WebSocket URL is `/sessions/:id/ws`. Server frames use `Server.eventCodec`. The only client command is `{ _tag: "Cancel", runId, reason? }`; the server verifies that the Run belongs to the path Session before cancelling it. Closing a stream only stops observation.

The default client reconnect schedule is jittered exponential backoff bounded by two elapsed minutes. Reconnection resumes strictly after the last admitted Host cursor. A bounded WebSocket queue prevents an unbounded slow-client buffer.

Browser WebSocket constructors cannot attach an Authorization header. A bearer-protected browser should use the SSE and HTTP methods, or the application should provide an Authentication implementation compatible with its cookie or gateway policy rather than putting credentials in a WebSocket URL.

## Invariants

- Host is the only Session, Run, execution, approval, operator, and cursor authority.
- The server validates every serialized request, response, event, and command with Schema.
- SSE and WebSocket share one HostEvent codec and one exclusive Session cursor contract.
- Operator mutations are denied by default even though their typed routes remain discoverable.
- `/openapi.json` and `docs/openapi.json` come from `Server.api`; `bun run test` checks the committed document for drift.
- The server does not expose Runtime model-response records that Host intentionally filters from its product event projection.

## Related

- Source: `packages/generalist/src/server/`
- OpenAPI: [`../openapi.json`](../openapi.json)
- Sibling features: [`host.md`](./host.md), [`transport.md`](./transport.md), [`recovery.md`](./recovery.md)
