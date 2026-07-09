# 11 — Transport wire and in-process session registry

Baton transport is the non-durable, same-process layer that turns `Agent.stream` into replayable wire frames for chat transports. It owns schemas, an in-memory `SessionRegistry`, and thin SSE/WebSocket/client adapters over the registry seam. It does not own durable event logs, Relay integration, multiplexing, or AI SDK data-stream adapters.

## Scope

Baton owns:

- toolkit-parameterized codecs for loop events and server/client frames;
- a loose browser codec that accepts unknown tool names as display data;
- `SessionRegistry`, an interface for opening sessions, sending prompts, attaching to replay/live frames, resolving approval suspensions, interrupting runs, and inspecting status;
- `layerMemory`, a best-effort in-process registry implementation;
- SSE, WebSocket, and isomorphic client adapters that depend only on `SessionRegistry`.

Baton does not own durable storage, cross-process sessions, multiplexing, EventSource wrappers, POST command routes, command acknowledgement envelopes, or browser UI state. Relay implements the same `SessionRegistry` interface over its durable event log.

## Wire contract

`seq` numbers server frames, not agent events. It is 0-based and monotonic per session. Replay cursors compare against frame `seq`; transports such as SSE use the same value as their resume cursor.

Terminal outcomes are data frames, not connection failures:

- `Suspended { suspension }` carries `AgentSuspended` for approval or tool-wait suspension;
- `Failed { error }` carries `AgentError`, `TurnLimitExceeded`, or `MiddlewareViolation`;
- `Ended` marks the end of one logical run.

Every logical run emits exactly one `Ended` frame after `Event(Completed)`, `Suspended`, or `Failed`. `Ended` does not close the session or require an attachment stream to end; clients may remain attached for the next `send`.

`EventSchema(toolkit)` mirrors every current `AgentEvent.Event` tag: `TurnStarted`, `ModelPart`, `ToolExecutionStarted`, `ToolProgress`, `ToolExecutionCompleted`, `ApprovalRequested`, `SteeringDrained`, `TurnCompleted`, `StructuredOutput`, and `Completed`. `ModelPart.part` and `StructuredOutput.content` use Effect AI response-part schemas for the supplied toolkit. Tool-call and tool-result fields are strict for that toolkit.

`LooseEventSchema` and `LooseServerFrame` are for browser display and replay. They accept unknown tool-call and tool-result names with unknown params/results. They are not a server-side execution contract.

When `stripTranscripts` is true, `TurnCompleted` and `Completed` event frames omit `transcript`. Clients that need a full transcript recover it through a `Snapshot { transcript }` frame.

## Session lifecycle

`open` creates or returns a session. `sessionId` defaults to a generated id; `chatId` defaults to `sessionId`. The registry stores live run state and replay frames only. Chat history belongs to `Ai.Chat.Persistence`.

`send` starts an `Agent.stream` run with `{ prompt, sessionId, persistence: { chatId } }` and returns after the run fiber starts. By default, a session in `Running` or `Suspended` status rejects another `send` with `SessionBusy`, preserving the original contract.

`layerMemory` may opt into `onConcurrentMessage: "enqueue"`. In enqueue mode, `send` returns after the prompt is accepted into the process-local queue; it does not wait for that prompt to start or finish. Prompts execute FIFO and never overlap within one session. `pendingMessageCapacity` is a non-negative safe integer, defaults to 128, bounds accepted queued prompts, and overflows with `SessionQueueFull`. `SessionInfo.pendingMessages` exposes the current queue depth without adding a wire lifecycle status.

`maxConcurrentRuns` is an optional positive safe integer that caps registry-owned top-level `Agent.stream` runs across all sessions in that layer. The permit covers the complete run, including model and tool phases, and is released on success, failure, suspension, and interruption. This is a run-level bound for one registry layer, not a process-global bound on nested handoffs or agent calls started outside the registry. Invalid queue-governance numbers are programmer configuration defects detected while building the layer.

Approval resolution has priority over queued ordinary prompts. A prompt accepted while a session is suspended remains queued until the matching approval is resolved and the resumed run reaches a terminal outcome. Failed and interrupted runs retain accepted prompts and start the next one. An idle sweep does not evict a session with accepted queued work. Releasing the registry layer interrupts active runs and drops pending prompts because Baton transport queues are explicitly non-durable.

`attach(sessionId, afterSeq?)` replays ring-buffered frames with `seq > afterSeq`, then streams live frames. If `afterSeq` predates the ring floor, the attachment receives a subscriber-local `Snapshot` frame for the persisted transcript before live frames. Snapshots are not inserted into the shared ring.

`resolveApproval` resumes only a suspended approval with a matching token. `Approved` re-enters with a one-shot approvals override that approves the suspended call. `Denied` re-enters with a one-shot denial so the model receives the same failed tool-result path as core approval denial. Tool-wait suspension is surfaced as `Suspended` but not resolved by this client frame.

`interrupt` cancels by session status, not by fiber presence. When the run fiber is already recorded, it interrupts that fiber. When the cancel lands after `send`/`resolveApproval` reserved the run but before the fiber is recorded, it marks the reservation interrupt-requested; `send`/`resolveApproval` consume the mark when recording the fiber and cancel the run immediately, so a `Cancel` racing a `SendMessage` is never dropped. A cancelled run publishes a `Failed` frame carrying `AgentError` with message `Session interrupted`, a `Failed` session status, and `Ended`, leaving the session free for the next `send`. It is idempotent when no run is active or reserved.

## Backpressure and idle policy

Each subscriber has a bounded queue. A lagging subscriber fails with `SubscriberLagged`; the producer run and other subscribers continue. Slow clients never block the model stream.

`layerMemory` evicts non-running sessions without pending prompts after `idleTimeout`. Running sessions and sessions with accepted queued work are not evicted. Eviction loses ring buffers, subscribers, fibers, and pending suspension state. Persisted chat history survives only when the provided `Ai.Chat.Persistence` survives.

## Relay seam

`SessionRegistry` is the seam Relay replaces durably:

| Baton transport                     | Relay durable runtime                      |
| ----------------------------------- | ------------------------------------------ |
| `sessionId`                         | execution id                               |
| `seq`                               | execution event sequence                   |
| `attach(sessionId, afterSeq)`       | durable event-log replay after cursor      |
| `layerMemory` ring buffer           | durable event log                          |
| in-process suspension and run fiber | durable execution state and addressability |

The SSE/WS handlers added later depend on `SessionRegistry`, not `layerMemory`, so Relay can provide its own implementation without changing those handlers.

## SSE contract

SSE is downstream-only. Hosts expose ordinary command routes for `SendMessage`, `ResolveApproval`, and `Cancel`; those routes call `SessionRegistry` methods directly.

`Sse.respond(toolkit)` reads the resume cursor from `Last-Event-ID`; if absent, it falls back to `?after_seq=`. Invalid cursors are ignored. The cursor is passed to `SessionRegistry.attach(sessionId, afterSeq)`.

Each SSE event has:

- `id` equal to the server frame `seq`;
- `event` equal to the server frame `_tag`;
- `data` equal to JSON for `Wire.ServerFrame(toolkit)`.

Responses use `text/event-stream`, `cache-control: no-cache`, `connection: keep-alive`, and `baton-sse-version: 1`. Heartbeats are SSE comment lines and do not carry frame data.

## WebSocket contract

WebSocket transport is text-JSON only. Clients send existing `Wire.ClientFrame` values, and servers send existing `Wire.ServerFrame` values.

One socket attaches to one session at a time. A new `Attach` frame interrupts and replaces the previous attachment fiber. `SendMessage`, `ResolveApproval`, and `Cancel` dispatch to `SessionRegistry.send`, `resolveApproval`, and `interrupt`.

`SubscriberLagged` closes the socket with code `4000` and reason `lagged`. Clients reconnect and reattach with the last seen `seq`. Malformed client frames and transport command errors are socket/protocol errors; they are not encoded as replay `Failed` frames because replay frames must keep monotonic session `seq` semantics.

## Client contract

The default client decodes server frames with `Wire.LooseServerFrame`, so browser clients can display unknown tool-call and tool-result names without importing the server toolkit. Hosts that need strict decoding can add their own decode layer around the wire schema.

The WebSocket client reconnects with bounded exponential backoff while its scope is open. On every connection it sends `Attach { sessionId, afterSeq }`, where `afterSeq` is the last seen server frame `seq` when available. It does not buffer commands while disconnected; `send` fails with `TransportError` unless a writer is currently open.

The SSE client helper decodes `text/event-stream` response bodies into loose server frames. Browser `EventSource` integration is outside this contract.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0014-transport-wire-and-session-registry.md`
- `docs/spec/decisions/ADR-0015-transport-sse-websocket-client.md`
- `docs/spec/decisions/ADR-0018-in-process-session-run-queue.md`
