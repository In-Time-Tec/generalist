# FoldKit

`generalist/unstable/foldkit` turns stable Server connections and Session-scoped `HostEvent`s into FoldKit subscriptions, commands, and a headless chat model. The adapter owns browser projection, not styled views, Session creation, or Run execution.

## Usage

Embed `Chat.Model`, route its actions and commands through the parent, then provide the Server WebSocket connection Layer:

```ts
import { Chat, Connection } from "generalist/unstable/foldkit"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { mapMessages } from "foldkit/command"
import { lift } from "foldkit/subscription"

const init = () => [{ chat: Chat.initialModel(null) }, [OpenSession()]]

const update = (model: Model, message: Message) => {
  const [chat, commands] = Chat.update(model.chat, message.action)
  return [{ chat }, mapMessages(commands, (action) => GotChatAction({ action }))] as const
}

const subscriptions = lift(Chat.subscriptions)({
  toChildModel: (model: Model) => model.chat,
  toParentMessage: (action) => GotChatAction({ action }),
})

const resources = Connection.layerWebSocket({ baseUrl: "https://agents.example.com" }).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(FetchHttpClient.layer),
)
```

`OpenSession` creates a Host Session through `Server.client.sessions.create` and emits `Chat.OpenedSession({ sessionId })`. The parent view emits actions such as `Chat.ChangedDraft`, `Chat.SubmittedMessage`, and `Chat.ClickedCancel`.

## What runs

```text
OpenedSession({ sessionId: "session-1" })
└── Chat.update()
    └── model: connecting, lastSeq: -1, entries: []
        └── Chat.subscriptions
            └── Connection.session({ sessionId: "session-1" })
                ├── Server.client.events.connect({ sessionId: "session-1" })
                ├── SessionSnapshot: conversation, Runs, cursor, epoch
                └── HostEvent frames after the snapshot cursor
                    └── ReceivedConnection({ event })

ClickedCancel()
└── Connection tracks the latest root Run from the snapshot and lifecycle events
    └── connection.cancel(runId, commandId)
```

## Data flow

```text
Committed conversation already contains the search tool call
    │
HostEvent: ToolCall, cursor: 7
event: ToolExecutionStarted("search")
    │ applyHostEvent()
    ▼
Chat.Model
lastSeq: 7
entries: existing ToolEntry("search") advances to executing
```

`SessionSnapshot` restores the bounded committed active-path conversation before live delivery. FoldKit derives user text, assistant text/reasoning, and tool calls with their results from `snapshot.conversation`, preserving that canonical conversation separately from the rendered rows. Repeated tool-call IDs are disambiguated with the original Session entry ID. System messages and instruction, memory, and skill bodies are not conversation rows.

Live `Conversation` updates validate the previous leaf and retained visible prefix, then replace the suffix. A rewind or branch change replaces abandoned-path content instead of appending it. Missing anchors, stale leaves, or duplicate entry IDs cause the connection to fetch a new snapshot under a new delivery epoch; obsolete-epoch events are ignored. Snapshot bounds reject oversized Sessions without truncation, as specified in the [Server contract](./server.md#snapshot-limits).

Run lifecycle events still drive turns, tool progress, approvals, and terminal state. Host filters the raw model-response Run events, but committed assistant content arrives through Conversation updates. Provider fragments remain outside this durable display contract, and terminal Run summaries do not synthesize transcript entries.

## Invariants

- One scoped `Connection.session` acquisition owns one Server connection and one command route for its Session ID.
- Each overlapping acquisition keeps its own scoped route; the global route points to the latest owner, and releasing an older owner cannot remove its successor.
- A fresh connection, replacement WebSocket, or resynchronization starts from a committed snapshot and observes strictly after its cursor. Advancing `lastSeq` alone does not recreate the subscription.
- Host events whose cursor is at or below `lastSeq` are ignored.
- Conversation and Run-derived events share that cursor; snapshot restore replaces the model's conversation and establishes the current epoch.
- Connection statuses project to `open`, `reconnecting`, or `disconnected`; a connect failure also produces `RunFailed` output.
- Run-derived HostEvents drive approvals, live tool progress, and terminal state; conversation restore supplies committed tool calls/results. The adapter does not synthesize lifecycle facts.
- Server WebSocket accepts only explicit cancellation. `SendMessage` and `ResolveApproval` require the parent application to call the corresponding Server client methods.
- Expected connection and command failures become structured FoldKit actions; defects and interruption remain Effect causes.
- `conversationItems` derives render-ready alignment, keys, tool status, waiting, approval, and failure rows, but FoldKit owns no styled view.
- The adapter does not own durable Sessions or execution semantics.

## Related

- Source: `packages/generalist/src/unstable/foldkit/`
- Server contract: [`server.md`](./server.md)
- Conversation reducer tests: [`unstable/foldkit/chat/conversation.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/unstable/foldkit/chat/conversation.test.ts)
- Site: `/docs/guides/foldkit-chat`, `/docs/reference/foldkit`
