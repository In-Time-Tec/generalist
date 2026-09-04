---
title: "AgentEvent and errors"
description: "Process-local loop events, normalized model responses, telemetry, and typed run failures."
---

AgentEvent is the process-local observation surface of the core loop. Runtime keeps the semantic execution facts from that stream, adds durable lifecycle facts, and deliberately excludes raw provider fragments.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

## Model output has two observation levels

| Event                    | Fields                                                         | Contract                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModelPart`              | `turn`, `modelCallId`, `modelAttemptId`, `attempt`, `part`     | A raw `Ai.Response.StreamPart` visible only while directly observing `Agent.stream`. Empty `text-delta` parts are discarded. Remaining parts are tentative provider activity, not durable response authority. |
| `ModelResponseCommitted` | `turn`, `operationKey`, model identities, `response`, `digest` | Exactly one normalized semantic response after the model operation commits. `response.content` contains complete text, reasoning, tool, source, file, metadata, and finish parts rather than provider deltas. |

<Note title="Runtime persists semantics, not provider fragments">
`generalist/runtime` excludes `ModelPart` from RunEvent history. Successful model operations publish `ModelResponseCommitted`; a run that is cancelled or fails after output escaped can publish one `ModelResponseInterrupted` with the normalized content observed before settlement. Database history, cursors, checkpoints, replay, SSE, WebSocket, and FoldKit all consume those semantic events.
</Note>

## Loop and telemetry events

The rest of the union describes turn boundaries, tool execution and progress, approvals, steering, handoffs, typed completion, and model-call telemetry. Every event carries its stable correlation fields; `turn` is 0-based wherever present. `ModelAttemptFirstOutput` reports text only for the first non-empty text part or delta; a `text-start` lifecycle part does not trigger it.

| Family              | Events                                                                                               | Purpose                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Turns and results   | `TurnStarted`, `TurnCompleted`, `Completed`                                                          | Frame turns, expose transcripts, and report the typed terminal output                           |
| Tools and approvals | `ToolExecutionStarted`, `ToolProgress`, `ToolExecutionCompleted`, `ApprovalRequested`                | Describe tool execution without replacing Effect AI tool-call and tool-result payloads          |
| Control flow        | `SteeringDrained`, `HandoffRequested`, `HandoffCompleted`, `Rejected`                                | Record observed steering and same-run specialist transitions                                    |
| Model telemetry     | `ModelCallStarted`, attempt/retry/fallback events, call completion or failure, and compaction events | Expose provider-neutral lifecycle and retry decisions separately from semantic response content |

### addUsage

`AgentEvent.addUsage(left, right)` returns the fieldwise sum of two `Ai.Response.Usage` values, preserving `undefined` when neither side reports a field.

## Model observation exports

| Export                | Purpose                                                                                                 | Minimal use                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ActiveModelResponse` | Read-only access for a host to the authoritative partial semantic response of the current model attempt | `const active = yield* ActiveModelResponse.ActiveModelResponse`; then read `yield* active.snapshot` during interruption handling                   |
| `ModelTelemetry`      | Schemas for model call, attempt, retry, fallback, and compaction lifecycle events                       | `Schema.decodeUnknown(ModelTelemetry.Event)(input)` decodes an event; `ModelTelemetry.classifyFailureCategory(error)` assigns its bounded category |

## Error classes

Expected failures are Schema tagged error classes under `generalist/`. Key loop failures include:

| Error                                 | Raised when                                                              |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `AgentError`                          | The loop fails and preserves its 0-based turn and cause                  |
| `InvalidOutput`                       | The terminal model value does not satisfy the Agent output schema        |
| `RunEndedWithoutOutput`               | A terminal model turn leaves no committed assistant answer               |
| `TurnLimitExceeded` / `PolicyStopped` | Pending tool results cannot be re-fed under the active policy            |
| `MiddlewareViolation`                 | A middleware hook breaks the loop contract, such as dropping a tool call |
| `AgentSuspended`                      | A tool wait or approval parks a process-local run                        |
| `ResumeMismatch`                      | A supplied suspension does not match the authoritative checkpoint        |

<Note title="AgentSuspended is a contract, not a failure">
The host resolves the token out of band and re-enters through `RunOptions.resume` with the exact suspension. Generalist verifies it before any resumed side effect.
</Note>

For the loop that emits these events, see [The agent loop](/learn/agent-loop). For durable RunEvents and live previews, see [generalist/runtime](/reference/runtime).
