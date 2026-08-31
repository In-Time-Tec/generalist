# Transport

Transport projects Runtime-owned `RunEvent` history and live updates over SSE or WebSocket. Runtime remains the authority for execution, persistence, Run state, replay, and cancellation.

## Usage

```ts
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest } from "effect/unstable/http"
import { SSE, WebSocket } from "generalist/transport"

const serveEvents = (runId: string) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    return yield* SSE.respond({ runId, request, keepAlive: "5 seconds" })
  })

const routesLayer = HttpRouter.use((router) =>
  Effect.gen(function* () {
    // One WebSocket attaches to one Run with an Attach command.
    yield* router.add("GET", "/ws", WebSocket.handle)
    yield* router.add("GET", "/runs/run-1/events", serveEvents("run-1"))
  }),
)
```

Provide the same `Runtime` Layer that starts and executes Runs to these routes; transport does not start an Agent or create a second lifecycle.

## What runs

```text
client connects with cursor 41
└── SSE.respond(...) or WebSocket.handle
    └── Runtime.events({ runId: "run-7", cursor: 41 })
        ├── replay persisted events where sequence > 41
        ├── resolve referenced model responses for observers
        ├── continue with Runtime's bounded live subscription
        └── client disconnects
            └── interrupt observer only; Run keeps executing

cursor expired
├── Snapshot.get("run-7") -> { run: ..., cursor: 58, ... }
└── reconnect with cursor 58 -> events where sequence > 58
```

Snapshots are finite inspection resources, not stream frames. `Replay.page` provides the same exclusive, bounded history projection for hosts that must page explicitly.

## Data flow

```text
ResolvedRunEvent
{ _tag: "RunAttemptStarted", runId: "run-1", sequence: 2,
  eventId: "run-1:2", specVersion: "1", ... }
        │ Wire.observerCodec.encode
        ▼
JSON string
{"_tag":"RunAttemptStarted",...,"sequence":2}
        │ SSE.respond
        ▼
SSE frame
id: 2
event: RunAttemptStarted
data: {"_tag":"RunAttemptStarted",...,"sequence":2}
```

Persisted `ModelResponseCommitted` and `ModelResponseInterrupted` events hold compact model references. An observer host calls `Runtime.resolveModelResponse`, adds `response`, and only then uses `observerCodec`; hydration does not add an event or sequence.

## Failure paths

```text
malformed cursor "wat" -> InvalidCursor
expired cursor 17      -> CursorExpired; fetch snapshot
slow live subscriber   -> SubscriberLagged { lastDeliveredSequence: 23 }
WebSocket lag close    -> code 4000, reason "lagged:23"
SSE id 24 + sequence 25 -> protocol/InvalidCursor failure
```

The reconnecting WebSocket `RunClient` keeps a bounded event queue, records the last decoded event sequence, and sends `{ _tag: "Attach", runId: "run-1", cursor: 7 }` on reconnect. Its default policy retries socket failures with bounded exponential backoff; exhaustion completes `connection.exhausted` with `ReconnectExhausted` and fails the event stream.

## Invariants

- Transport streams `ResolvedRunEvent`: persisted lifecycle identity and sequence plus hydrated response content only for committed or interrupted model-response delivery.
- SSE event IDs and WebSocket reconnect cursors equal the persisted event `sequence`.
- Replay cursors are exclusive: cursor `n` requests events with `sequence > n`.
- `Last-Event-ID` takes precedence over the SSE `cursor` query parameter.
- Malformed cursors fail with `InvalidCursor`; `CursorExpired` remains a typed Runtime failure and recovery uses `Snapshot.get`.
- `Snapshot.get(runId)` returns Runtime's snapshot, including `run` inspection state and its last applied `cursor`; it is not a `RunEvent` and neither consumes nor reuses a sequence.
- Runtime owns bounded live subscriber queues; lag reports `SubscriberLagged.lastDeliveredSequence` so an observer can replay from its last delivery.
- WebSocket accepts only `Attach` and explicit `Cancel`; one socket may attach to only one Run.
- Closing SSE, WebSocket, or a client scope interrupts observation only and never calls `Runtime.cancel`; only explicit `Cancel` does.
- Transport emits terminal facts and cursors exactly as persisted; it never appends synthetic `Ended`, status, failure, or snapshot frames.
- `producerCodec` is the strict canonical compact Runtime codec; observer hosts resolve model references before `observerCodec` encoding.
- Observer decoding validates common identity and cursor fields, rejects unresolved known model events, and retains unknown future event tags.
- Disposable `Runtime.previews` are process-local and are not part of transport streams, cursors, snapshots, or replay.
- Cloudflare hibernating sockets persist only a bounded attachment whose attached state includes `{ runId, cursor }`, not a resident subscription, fiber, or timer.
- Each Cloudflare host flush pages authoritative Runtime history strictly after its cursor with bounded page fuel, sends in sequence order, and advances the attachment cursor only after a successful send.
- Malformed Cloudflare attachments or commands close the socket without resetting replay state.

## Related

- Source: `packages/generalist/src/transport/`
- Site: `/docs/guides/serve-transport`, `/docs/reference/transport`
- Decisions/tradeoffs: `../decisions/runtime-dynamic-transport.md`, `../tradeoffs/process-local-transport.md`
