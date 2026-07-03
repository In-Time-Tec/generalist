# 11 — Transport wire and in-process session registry

Baton transport is the non-durable, same-process layer that turns `Agent.stream` into replayable wire frames for chat transports. It owns schemas and an in-memory `SessionRegistry`; it does not own SSE, WebSocket, clients, durable event logs, or Relay integration.

## Scope

Baton owns:

- toolkit-parameterized codecs for loop events and server/client frames;
- a loose browser codec that accepts unknown tool names as display data;
- `SessionRegistry`, an interface for opening sessions, sending prompts, attaching to replay/live frames, resolving approval suspensions, interrupting runs, and inspecting status;
- `layerMemory`, a best-effort in-process registry implementation.

Baton does not own durable storage, cross-process sessions, multiplexing, SSE/WS handlers, or a browser client in this milestone. Relay implements the same `SessionRegistry` interface over its durable event log.

## Wire contract

`seq` numbers server frames, not agent events. It is 0-based and monotonic per session. Replay cursors compare against frame `seq`; transports such as SSE use the same value as their resume cursor.

Terminal outcomes are data frames, not connection failures:

- `Suspended { suspension }` carries `AgentSuspended` for approval or tool-wait suspension;
- `Failed { error }` carries `AgentError`, `TurnLimitExceeded`, or `MiddlewareViolation`;
- `Ended` marks the end of one logical run.

Every logical run emits exactly one `Ended` frame after `Event(Completed)`, `Suspended`, or `Failed`. `Ended` does not close the session or require an attachment stream to end; clients may remain attached for the next `send`.

`EventSchema(toolkit)` mirrors every current `AgentEvent.Event` tag: `TurnStarted`, `ModelPart`, `ToolExecutionStarted`, `ToolProgress`, `ToolExecutionCompleted`, `ApprovalRequested`, `TurnCompleted`, `StructuredOutput`, and `Completed`. `ModelPart.part` and `StructuredOutput.content` use Effect AI response-part schemas for the supplied toolkit. Tool-call and tool-result fields are strict for that toolkit.

`LooseEventSchema` and `LooseServerFrame` are for browser display and replay. They accept unknown tool-call and tool-result names with unknown params/results. They are not a server-side execution contract.

When `stripTranscripts` is true, `TurnCompleted` and `Completed` event frames omit `transcript`. Clients that need a full transcript recover it through a `Snapshot { transcript }` frame.

## Session lifecycle

`open` creates or returns a session. `sessionId` defaults to a generated id; `chatId` defaults to `sessionId`. The registry stores live run state and replay frames only. Chat history belongs to `Ai.Chat.Persistence`.

`send` starts an `Agent.stream` run with `{ prompt, sessionId, persistence: { chatId } }` and returns after the run fiber starts. A session in `Running` or `Suspended` status rejects another `send` with `SessionBusy`.

`attach(sessionId, afterSeq?)` replays ring-buffered frames with `seq > afterSeq`, then streams live frames. If `afterSeq` predates the ring floor, the attachment receives a subscriber-local `Snapshot` frame for the persisted transcript before live frames. Snapshots are not inserted into the shared ring.

`resolveApproval` resumes only a suspended approval with a matching token. `Approved` re-enters with a one-shot approvals override that approves the suspended call. `Denied` re-enters with a one-shot denial so the model receives the same failed tool-result path as core approval denial. Tool-wait suspension is surfaced as `Suspended` but not resolved by this client frame.

`interrupt` cancels a running fiber and emits terminal data frames. It is idempotent when no run is active.

## Backpressure and idle policy

Each subscriber has a bounded queue. A lagging subscriber fails with `SubscriberLagged`; the producer run and other subscribers continue. Slow clients never block the model stream.

`layerMemory` evicts non-running sessions after `idleTimeout`. Running sessions are not evicted. Eviction loses ring buffers, subscribers, fibers, and pending suspension state. Persisted chat history survives only when the provided `Ai.Chat.Persistence` survives.

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

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0014-transport-wire-and-session-registry.md`
