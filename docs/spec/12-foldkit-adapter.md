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

`AgentConnection` is a long-lived Effect service supplied to FoldKit through static runtime `resources`. It is a connection factory and compatibility router, not the owner of one global socket. `session({ sessionId, afterSeq? })` acquires a `SessionConnection` in the caller's `Scope`; that value owns one transport connection whose frame subscription and command writes share the same lifetime. Closing the scope interrupts and releases only that acquisition exactly once.

The resource exposes:

- `session({ sessionId, afterSeq? })`, a scoped acquisition returning the selected `sessionId`, a never-failing stream of decoded server frames and connection facts, and a command-side `send(frame)` that rejects a frame for any other session;
- `frames({ sessionId, afterSeq? })`, a source-compatible adapter that acquires a session for the stream lifetime;
- `send(frame)`, a source-compatible command route that selects only the active acquisition keyed by the frame's `sessionId` and fails typed when none exists.

Compatibility routing uses a bounded map of active session acquisitions. A newer acquisition for the same session replaces the map entry, and every finalizer removes its entry only when its generation still matches. Overlapping sessions therefore cannot overwrite each other's command route, and finalizing an older same-session acquisition cannot remove its successor. New integrations should acquire `SessionConnection` directly; the compatibility methods remain for existing FoldKit commands whose execution environment contains only the static resource layer.

Callers of `frames` and `send` require no migration, and `testLayer({ frames, send })` continues to adapt legacy test implementations. Custom providers typed as `AgentConnection.Interface` or constructed directly with `AgentConnection.of` must add the scoped `session` acquisition; they may use `testLayer` as a temporary compatibility adapter.

Expected `TransportError` failures from the frame stream are folded into structured `ConnectionFailed` incoming facts that retain the `connect` operation and original error. They are not replay `Failed` frames. Defects and interruption remain in the stream cause. Command sends fail with the `AgentCommandError` union of transport `TransportError` and adapter `SendFailed`; built-in commands recover only those expected errors into structured `FailedAgentCommand` messages that retain the operation and original error. Defects and interruption retain their Effect semantics.

The first layer is WebSocket-backed. SSE is downstream-only in the transport spec; this package does not define a command POST convention.

## Subscription contract

The chat subscription depends on `sessionId` and `afterSeq`, but it keeps the scoped session connection alive when only `afterSeq` changes. `sessionId` changes release the old acquisition and acquire the new session; cursor changes are read by the running stream where FoldKit supplies `readDependencies`.

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
| `SteeringDrained`                             | no display transition; hosts may log it separately                                   |
| `TurnCompleted`                               | flush streaming assistant content into entries                                       |
| `Completed`                                   | flush streaming content, set `run = Idle`, emit `RunCompleted`                       |
| `Suspended` with approval                     | set `AwaitingApproval`, emit `ApprovalRequired`                                      |
| `Suspended` with tool-wait                    | set `Failed`, emit `RunFailed` because this adapter cannot resolve tool waits        |
| `Failed`                                      | set `Failed`, emit `RunFailed`                                                       |
| `SessionStatus`                               | project idle/running/suspended/failed status into run state                          |
| `Snapshot`                                    | replace display entries from the prompt transcript projection                        |
| `Ended`                                       | no-op logical run terminator                                                         |

User messages update draft state and emit commands. Commands convert every expected `AgentCommandError` into `FailedAgentCommand`; no expected command failure is silent. The default chat update renders structured connection and command facts from their typed error message while preserving their discriminator and fields for custom updates and diagnostics.

`ChatCommand` now exposes `AgentCommandError` instead of `any`. `ConnectionFailed.reason` and `FailedAgentCommand.reason` remain available as the default display text, while their new `operation` and `error` fields provide structured handling. Consumers that construct either message directly must supply those fields; consumers that only read `reason` remain source-compatible.

Failed policy evaluation displays the `TurnPolicyError.message`. An explicit policy stop displays a custom `Policy.detail` when present and otherwise the standard stop-reason tag. Configured turn limits retain the existing turn-limit message.

Tool entries retain the difference between a tool call observed in model output and execution actually starting. Foldcn tool status helpers map that to `input-streaming` before `ToolExecutionStarted`, `input-available` while execution is running, and `output-available` / `output-error` after completion.

The adapter exposes pure helpers that map the headless model to foldcn component inputs without importing copied foldcn components:

- prompt input status from `RunState`;
- tool status from a `ToolEntry`;
- conversation rows for user messages, assistant messages, tool calls, streaming assistant output, waiting indicator, and failures.

## Related docs

- `docs/spec/11-transport.md`
- `docs/spec/decisions/ADR-0016-foldkit-adapter.md`
