# 12 — FoldKit adapter

`@batonfx/foldkit` adapts Baton transport into FoldKit applications. It is a display and command adapter over `@batonfx/transport`; it is not a durable runtime, a styled chat component, or a Relay integration.

## Scope

Baton owns:

- an `AgentConnection` resource service that FoldKit applications provide through runtime `resources`;
- a WebSocket-backed connection layer that composes `@batonfx/transport`'s client;
- a subscription that streams decoded transport frames and connection facts into FoldKit messages;
- a chat message for accepting a host-opened session id and starting the connection subscription;
- command definitions for user messages, approval resolution, and cancellation;
- a headless `Chat` model and pure `update` for reference chat state.
- foldcn-aligned view-data helpers for prompt input status, tool status, and conversation rows.

Baton does not own styled views, FoldCN components, durable execution addressability, Relay-specific session semantics, multi-session UI, history pagination beyond `Snapshot`, EventSource wrappers, or generic SSE command POST routes.

## AgentConnection resource

`AgentConnection` is a long-lived Effect service supplied to FoldKit through static runtime `resources`. The FoldKit `managedResources` API is for model-driven acquire/re-acquire lifecycles and is not used for the shared agent socket in this milestone.

The resource exposes:

- `frames({ sessionId, afterSeq? })`, a never-failing stream of decoded server frames and connection facts;
- `send(frame)`, a command-side write of an existing `Wire.ClientFrameType`.

Transport failures are folded into `Incoming` values such as `ConnectionFailed`; they are not replay `Failed` frames. Command failures become `SendFailed` and are converted by commands into FoldKit messages.

The first layer is WebSocket-backed. SSE is downstream-only in the transport spec; this package does not define a command POST convention.

## Subscription contract

The chat subscription depends on `sessionId` and `afterSeq`, but it keeps the stream alive when only `afterSeq` changes. `sessionId` changes restart the stream; cursor changes are read by the running stream where FoldKit supplies `readDependencies`.

Current WebSocket transport reconnects with the last sequence it has seen internally. Its initial `connect` call has no `afterSeq` option, so the FoldKit adapter accepts `afterSeq` for subscription shape and idempotence but does not invent a new transport cursor contract.

## Chat model and update

`Chat.Model` is a headless display model. It tracks the selected `sessionId`, connection state, last accepted `seq`, run state, display entries, streaming assistant text/reasoning, and draft text.

Hosts open sessions through their own route or direct registry call, then dispatch `OpenedSession { sessionId }` into the chat model. The adapter does not add an `OpenSession` wire frame or standard HTTP route. Accepting an opened session selects the session, resets replay cursor and display entries, and lets the existing subscription attach.

Replay idempotence is mandatory: any server frame with `seq <= lastSeq` is dropped without changing state or emitting commands/out messages. Accepted frames set `lastSeq` before applying their content.

Frame handling:

| Input                                         | Transition                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ConnectionOpened`                            | `connection = "open"`                                                                |
| `ConnectionLost`                              | `connection = "reconnecting"` when a session is selected, otherwise `"disconnected"` |
| `ConnectionFailed`                            | `connection = "disconnected"`, `run = Failed`, emit `RunFailed`                      |
| `Event.TurnStarted`                           | `run = Running`, initialize streaming text/reasoning                                 |
| text and reasoning deltas                     | append to the current streaming buffer                                               |
| tool call parts or `ToolExecutionStarted`     | upsert a pending `ToolEntry`                                                         |
| `ToolProgress`                                | append progress text to the matching tool entry                                      |
| `ToolExecutionCompleted` or tool-result parts | resolve the matching tool entry outcome                                              |
| `ApprovalRequested`                           | upsert pending tool entry; wait for `Suspended` to carry the approval token          |
| `TurnCompleted`                               | flush streaming assistant content into entries                                       |
| `Completed`                                   | flush streaming content, set `run = Idle`, emit `RunCompleted`                       |
| `Suspended` with approval                     | set `AwaitingApproval`, emit `ApprovalRequired`                                      |
| `Suspended` with tool-wait                    | set `Failed`, emit `RunFailed` because this adapter cannot resolve tool waits        |
| `Failed`                                      | set `Failed`, emit `RunFailed`                                                       |
| `SessionStatus`                               | project idle/running/suspended/failed status into run state                          |
| `Snapshot`                                    | replace display entries from the prompt transcript projection                        |
| `Ended`                                       | no-op logical run terminator                                                         |

User messages update draft state and emit commands. Commands convert every send failure into `FailedAgentCommand`; no command fails silently.

Tool entries retain the difference between a tool call observed in model output and execution actually starting. Foldcn tool status helpers map that to `input-streaming` before `ToolExecutionStarted`, `input-available` while execution is running, and `output-available` / `output-error` after completion.

The adapter exposes pure helpers that map the headless model to foldcn component inputs without importing copied foldcn components:

- prompt input status from `RunState`;
- tool status from a `ToolEntry`;
- conversation rows for user messages, assistant messages, tool calls, streaming assistant output, waiting indicator, and failures.

## Related docs

- `docs/spec/11-transport.md`
- `docs/spec/decisions/ADR-0016-foldkit-adapter.md`
