# AG-UI

`generalist/ag-ui` admits or resumes an authoritative Runtime Run, then projects
its canonical `RunEvent` stream into schema-validated AG-UI events.

## Usage

```ts
import type { RunAgentInput } from "@ag-ui/core"
import { Effect, Layer, Stream } from "effect"
import { AGUI } from "generalist/ag-ui"
import { Address, Runtime } from "generalist/runtime"

declare const runtimeLayer: Layer.Layer<Runtime.Runtime>

const input: RunAgentInput = {
  threadId: "thread-1",
  runId: "run-1",
  state: {},
  messages: [{ id: "message-1", role: "user", content: "hello" }],
  tools: [],
  context: [],
  forwardedProps: {},
}

const program = Effect.gen(function* () {
  const agui = yield* AGUI.AGUI
  yield* agui.run(input).pipe(Stream.runForEach((event) => Effect.log(event)))
}).pipe(Effect.provide(AGUI.layer({ address: Address.make("agent:assistant") })), Effect.provide(runtimeLayer))
```

## What runs

```text
agui.run({ runId: "run-1", threadId: "thread-1", ... })
├── validate RunAgentInput and reject client authority
├── Runtime.send({
│     runId: "run-1", sessionId: "thread-1",
│     messageId: "message-1", prompt: "hello"
│   })
└── Runtime.events({ runId: "run-1", cursor: -1 })
    ├── RunAccepted       → RUN_STARTED
    ├── TurnStarted       → STEP_STARTED "turn:0"
    ├── ModelResponseCommitted
    │   └── resolveModelResponse() → TEXT_MESSAGE_* / TOOL_CALL_*
    ├── TurnCompleted     → STEP_FINISHED "turn:0"
    └── RunCompleted      → RUN_FINISHED { type: "success" }
```

## Data flow

One committed semantic text part becomes a complete AG-UI message lifecycle;
the adapter does not expose Runtime transport fragments.

```text
ModelResponseCommitted eventId "run-1:1"
+ resolved part { type: "text", text: "hello" }
        │ projectModelResponse()
        ▼
TEXT_MESSAGE_START   messageId "run-1:1:text:0"
TEXT_MESSAGE_CONTENT delta "hello"
TEXT_MESSAGE_END     messageId "run-1:1:text:0"
```

## Invariants

- Runtime remains the source of truth; the adapter stores no parallel Run state.
- `runId` is preserved, and `threadId` becomes Runtime `sessionId`.
- Only the final user message is admitted; its ID is both `messageId` and idempotency key.
- System and developer messages, client tools, non-user final messages, and non-string user content are rejected.
- Resume entries must uniquely match every referenced open wait and have status `resolved`.
- Approval payload `false` denies; every other JSON payload approves. Non-approval waits receive a `ToolResult` resolution.
- Model responses are resolved from authoritative session content before projection.
- Text, reasoning, tool-call arguments, and tool results have deterministic, complete AG-UI lifecycles.
- Interrupted normalized model content is projected before the later `RUN_ERROR`.
- `RunWaiting` projects to `RUN_FINISHED` with an `interrupt` outcome; it is not a success.
- `RunFailed`, `RunCancelled`, and `OperationUnknown` project to `RUN_ERROR` with distinct codes.
- Tool progress projects as a `CUSTOM` event named `generalist.tool.progress`.
- Every projected event is validated by the AG-UI event schema.
- Subscriber lag or an expired cursor emits `STATE_SNAPSHOT`, then resumes after the snapshot cursor.
- `snapshot(runId)` returns the authoritative Runtime snapshot inside one `STATE_SNAPSHOT` event.

## Related

- Source: `packages/generalist/src/interoperability/ag-ui/...`
- Site: `/docs/reference/ag-ui`
