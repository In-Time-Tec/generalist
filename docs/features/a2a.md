# A2A

`generalist/unstable/a2a` projects A2A v1 tasks onto authoritative Runtime runs.
The SDK handler stores no second task lifecycle.

## Usage

```ts
import type { AgentCard } from "@a2a-js/sdk"
import { Effect, Layer } from "effect"
import { A2A } from "generalist/unstable/a2a"
import { Address, Runtime } from "generalist/runtime"

declare const card: AgentCard
declare const runtimeLayer: Layer.Layer<Runtime.Runtime>

const deployment = { address: Address.make("agent:support"), card }

// Mount this SDK handler in the host's A2A transport.
const handler = Effect.gen(function* () {
  return (yield* A2A.A2A).handler
}).pipe(Effect.provide(A2A.layer(deployment)), Effect.provide(runtimeLayer))
```

See the runnable offline [two-host A2A example](../../examples/a2a).

## Implemented from the spec

- A2A v1 message send and streaming through the SDK `DefaultRequestHandler`.
- Runtime-backed task get, list, cancel, and resubscribe behavior.
- Text and JSON user input, task statuses, completion artifacts, waits, and approval responses.

## Not implemented

- A built-in HTTP transport mount; applications mount the handler in their chosen A2A SDK transport.
- Push notification delivery and authenticated extended agent cards.
- File, URL, audio, video, and other non-text input parts.

## What runs

```text
handler.sendMessageStream(message)
├── Content.decode(user text/plain or application/json)
├── new task
│   ├── Runtime.send(runId = taskId, sessionId = contextId)
│   ├── Projection.fromRuntime() → full A2A Task
│   └── Runtime.events(cursor = -1)
└── existing task
    ├── Runtime.snapshot(taskId)
    ├── resolve the first open wait
    └── Runtime.events(cursor = snapshot.cursor)
        ├── RunAttemptStarted → TASK_STATE_WORKING
        └── RunCompleted → artifact, then TASK_STATE_COMPLETED
```

## Data flow

```text
A2A Message
{ messageId: "msg-7", taskId: "task-42", text: "continue" }
        │ Content.decode()
        ▼
Prompt
user: "continue"
        │ Runtime.respond(waitId = "wait-3")
        ▼
RunResumed → RunCompleted { result.text: "complete" }
        │ statusFromEvent() / artifactFromEvent()
        ▼
TASK_STATE_WORKING
Artifact { name: "result", text: "complete" }
TASK_STATE_COMPLETED
```

```text
queued    → SUBMITTED       running   → WORKING
waiting   → INPUT_REQUIRED  Approval  → AUTH_REQUIRED
succeeded → COMPLETED       failed    → FAILED
cancelled → CANCELED
```

## Invariants

- `Task.id` is exactly the Runtime Run ID; `contextId` is the run correlation ID.
- Runtime snapshots and canonical history are the authority for get, list, subscribe, status, artifacts, waits, and cancellation.
- Only `ROLE_USER` messages with at least one part are admitted.
- Accepted parts are `text/plain` text and `application/json` data; JSON is encoded into a text prompt part.
- Rejected roles, empty messages, files, URLs, and media mismatches fail before `Runtime.send`.
- A new task starts event following at cursor `-1`, independent of the send receipt's lane sequence.
- Streams stop at waiting, completed, failed, or canceled boundaries.
- Completion emits one final result artifact before its completed status update.
- Structured output and Program results become JSON artifacts; other completion results become text artifacts.
- Input for an existing task resolves only its first open wait; a task not waiting for input is rejected.
- Approval input approves the pending request; other waits receive the decoded prompt as a `ToolResult`.
- Cancel requests call `Runtime.cancel` with reason `A2A cancel request` and succeed only when Runtime reports `cancelled`.
- Resubscribing emits a full task first and follows only events after the snapshot cursor.

## Related

- Example: `examples/a2a`
- Source: `packages/generalist/src/unstable/a2a/...`
- Site: `/docs/reference/a2a`
