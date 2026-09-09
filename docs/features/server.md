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
import { Host } from "generalist/host"
import { Server } from "generalist/server"

const agent = Agent.make({ name: "support" })

const apiLayer = Layer.unwrap(
  Host.make({
    agents: { support: agent },
    revision: "support-build-2026-09-08",
    limits: { tree: { maxDepth: 3, maxSessions: 32 }, concurrency: { agents: 4, tools: 8 } },
  }).pipe(
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
client.sessions.create/get/list/snapshot/family/control/queue
client.runs.start/list/inspect/messages/cancel
client.events.subscribe({ sessionId, cursor?, reconnect? })
client.events.connect({ sessionId, eventCapacity?, reconnect? })
client.approvals.resolve({ runId, token, decision })
client.operator.explain/retry/wake/resolveUnknown/extendBudget (operator comes from CurrentPrincipal)
```

The caller provides an Effect `HttpClient`. Add the bearer token there with `HttpClient.mapRequest(HttpClientRequest.bearerToken(...))`. WebSocket construction also requires `Socket.WebSocketConstructor` and a Scope.

## Routes

| Group       | Method | Path                           | Client call               |
| ----------- | ------ | ------------------------------ | ------------------------- |
| attachments | POST   | `/attachments`                 | `attachments.put`         |
| attachments | GET    | `/attachments/:sha256`         | `attachments.get`         |
| sessions    | POST   | `/sessions`                    | `sessions.create`         |
| sessions    | GET    | `/sessions`                    | `sessions.list`           |
| sessions    | GET    | `/sessions/:id`                | `sessions.get`            |
| sessions    | GET    | `/sessions/:id/snapshot`       | `sessions.snapshot`       |
| sessions    | POST   | `/sessions/:id/family`         | `sessions.family`         |
| sessions    | POST   | `/sessions/:id/control`        | `sessions.control`        |
| sessions    | POST   | `/sessions/:id/queue`          | `sessions.submit`         |
| sessions    | PATCH  | `/sessions/:id/queue/:inputId` | `sessions.updateInput`    |
| sessions    | DELETE | `/sessions/:id/queue/:inputId` | `sessions.removeInput`    |
| runs        | POST   | `/sessions/:sessionId/runs`    | `runs.start`              |
| runs        | GET    | `/sessions/:sessionId/runs`    | `runs.list`               |
| runs        | GET    | `/runs/:id`                    | `runs.inspect`            |
| runs        | POST   | `/runs/:id/cancel`             | `runs.cancel`             |
| runs        | POST   | `/runs/:id/messages`           | `runs.message`            |
| runs        | GET    | `/runs/:id/messages`           | `runs.messages`           |
| events      | GET    | `/sessions/:id/events`         | `events.subscribe`        |
| events      | GET    | `/sessions/:id/ws`             | `events.connect`          |
| approvals   | POST   | `/runs/:id/approvals/:token`   | `approvals.resolve`       |
| operator    | GET    | `/runs/:id/explain`            | `operator.explain`        |
| operator    | POST   | `/runs/:id/retry`              | `operator.retry`          |
| operator    | POST   | `/runs/:id/wake`               | `operator.wake`           |
| operator    | POST   | `/runs/:id/resolve-unknown`    | `operator.resolveUnknown` |
| operator    | POST   | `/runs/:id/extend-budget`      | `operator.extendBudget`   |

Future ingress features add one HttpApi group to `Server.api` and one matching implementation module. They do not create another router or wire contract.

`POST /attachments` sends an `application/octet-stream` body with required `x-media-type` and optional `x-filename` headers, returning `Media.Ref` as JSON. `GET /attachments/:sha256` returns the bytes with their stored `content-type` and optional `x-filename`. The generated client constructs upload headers and decodes the buffered download. Both routes use the same Authentication middleware as every other declared route.

## SSE and WebSocket

Both streaming transports carry the same Schema-validated `Server.HostEvent`. Events are Session-scoped and use the Host's durable exclusive cursor. SSE sets `id` to the Host cursor, uses the Host wrapper tag as `event`, and JSON-encodes the complete HostEvent as `data`. `Last-Event-ID` takes precedence over the `cursor` query parameter. Authorization is rechecked before each committed event and preview delivery, so a revoked resource closes its stream instead of retaining opening-time authority.

`Conversation` events carry committed conversation changes alongside the Run lifecycle wrappers. Both advance the same Session cursor. A Conversation event has `sessionId`, `cursor`, and `update`; it is not a Run event and has no `runId` or `event` field. Host filters some Runtime Run events, so visible cursor values need not be consecutive.

Both event routes resolve the Session before committing an SSE response or upgrading a WebSocket. An unknown Session therefore returns the declared `SessionNotFound` JSON body with HTTP 404. If an SSE stream fails after its HTTP 200 headers have been committed—for example, because its cursor expired or its subscriber lagged—Effect HttpApi emits one terminal `effect/httpapi/stream/failure` event containing the encoded `ApiError`, then closes the stream. The generated client decodes that event into the typed stream failure.

The WebSocket URL is `/sessions/:id/ws`. Server frames use `Server.eventCodec`. The client cancellation command is `{ _tag: "Cancel", runId, commandId, reason? }`; the server verifies that the Run belongs to the path Session before cancelling it. Preserve `commandId` when retrying. Closing a stream only stops observation.

The default client reconnect schedule is jittered exponential backoff bounded by two elapsed minutes. Reconnection resumes strictly after the last admitted Host cursor. A bounded WebSocket queue prevents an unbounded slow-client buffer.

Browser WebSocket constructors cannot attach an Authorization header. A bearer-protected browser should use the SSE and HTTP methods, or the application should provide an Authentication implementation compatible with its cookie or gateway policy rather than putting credentials in a WebSocket URL.

## Session snapshot and resynchronization

`client.sessions.snapshot({ sessionId })` returns the current version-1 `HostSessionSnapshot`: Session metadata, its exact exclusive `cursor`, recent Run summaries, and `conversation: { leafId, entries, nextLeafId? }`. The conversation follows the authoritative active Session path. Each visible entry retains its original `id`, `parentId`, and Effect AI `Prompt.Message` values; `leafId` remains the original Session leaf, even when that leaf or a parent is a filtered context entry. This is a committed user/tool/assistant display projection, not a transcript reconstructed from Run summaries. System messages and internal context bodies, including memory and skill entries, are omitted.

`client.events.connect({ sessionId })` obtains the snapshot before observing events strictly after its cursor. A Conversation update contains `previousLeafId`, `leafId`, `afterEntryId`, and `entries`. For an append, retain the visible prefix through `afterEntryId` and replace the rest with `entries`; an empty suffix can still advance a leaf through a non-display entry. A `reset: true` update replaces the display with its bounded page and optional `nextLeafId`. It does not delete the old branch's immutable entries.

FoldKit validates the previous leaf, retained-prefix anchor, and duplicate entry IDs. An inconsistent update triggers bounded snapshot resynchronization rather than an invented append. Each accepted snapshot establishes a new connection-local epoch; deliveries from obsolete epochs cannot modify it. Reopening or resynchronizing restores committed user messages, tool calls/results, and assistant text without sending another user message. Snapshots are projections of the canonical state, not a second journal.

The FoldKit adapter reads canonical `session.activeRunId` at startup and after root admission or terminal events. Its local `HostDelivery` frame includes that value, or null while idle; the reducer does not infer ownership from a later queued admission. Cancellation and WebSocket preview selection use the same canonical metadata. Queue promotion can therefore change control without waiting for a new admission event from an already-admitted Run. Preview fences remain memory-only and are retired on completion.

### Snapshot limits

The first view contains at most 32 recent Run summaries, selected from the last 256 Session events, plus the canonical `session.activeRunId` summary if it is absent from that window. The total is at most 33, with no duplicate IDs. It traverses at most 64 native conversation entries. Those Run summaries are a keyed activity overlay, not the first admission-history page, and admission order does not determine conversational control. Session selection and pending queue metadata remain canonical and are not projected from history. Start complete Run history separately at the snapshot cursor and reconcile matching IDs with the live overlay. The snapshot does not enumerate the partition's Runs or accumulate all their events, manifests, usage facts, compactions, and results. A summary reports Run identity, family identity, current status and Run cursor, with bounded turn/approval display data. Full inspection and committed-event APIs retain their existing roles.

Use these Session-authorized methods for older content:

- `client.sessions.history({ sessionId, leafId, limit })` traverses at most `limit` native entries, including filtered context entries, and returns visible `entries` in chronological order plus `nextLeafId`. The limit is an integer from 1 to 64. Follow `nextLeafId` until null, even if a page contains no visible entries. Every page is anchored to its own immutable leaf. Retain the opening leaf as the view identity; a reconnect or branch change does not change that old path.
- `client.sessions.runs({ sessionId, at, before?, rootRunId?, limit })` scans at most 256 committed Session events and returns at most 64 Run summaries in admission order. Start with `at: snapshot.cursor`; continue with the same `at` and the returned `nextBefore` until null. Membership is pinned to that event cursor, but statuses report current committed state. Empty filtered pages can still have continuations. `rootRunId` selects a family and must belong to the authorized Session.
- `client.sessions.run({ sessionId, runId })` reads one Session-owned Run summary without enumerating history. A known Run ID is not a grant to access another Session.
- `client.sessions.entry({ sessionId, entryId })` hydrates an immutable entry's complete public conversation content. An encoded entry larger than 8 KiB appears in pages and live Conversation updates with `contentDeferred: true` and `messages: []`; its text is not truncated. Hydration reuses the canonical Session entry reader and excludes internal context and system messages.

The HTTP routes are `POST /sessions/:id/history`, `POST /sessions/:id/runs/page`, `GET /sessions/:id/runs/:runId`, and `GET /sessions/:id/entries/:entryId`. All require Session read authorization before accessing storage. Schema rejects malformed or out-of-range request bodies. Unknown or cross-Session selectors return `SessionPageInvalid` with HTTP 400. The existing Session event stream and disposable previews remain the live delivery paths; pagination adds neither a second store nor a UI scheduler.

These bounds apply to display projection and response work. They do not solve canonical partition growth, reduce retained receipts, or certify cold-recovery cost. The durability engine still materializes its canonical state. The administrative `runs.list` and full Run inspection APIs are not bounded display pages.

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
