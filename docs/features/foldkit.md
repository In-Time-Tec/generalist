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
                └── HostEvent frames
                    └── ReceivedConnection({ event })

ClickedCancel()
└── Connection tracks the latest HostEvent.runId
    └── connection.cancel(runId)
```

## Data flow

```text
HostEvent: ToolCall, cursor: 7
event: ToolExecutionStarted("search")
    │ applyHostEvent()
    ▼
Chat.Model
lastSeq: 7
entries: ToolEntry("search", executing)
```

Host intentionally filters model-response events from its product event stream. The current FoldKit projection therefore tracks connection, turns, tools, approvals, cancellation, and terminal results, but it does not reconstruct incremental or committed assistant-response entries from Server frames.

## Invariants

- One scoped `Connection.session` acquisition owns one Server connection and one command route for its Session ID.
- Each overlapping acquisition keeps its own scoped route; the global route points to the latest owner, and releasing an older owner cannot remove its successor.
- A subscription reconnects from `lastSeq` as an exclusive Host cursor and stays alive while only that cursor changes.
- Host events whose cursor is at or below `lastSeq` are ignored.
- Connection statuses project to `open`, `reconnecting`, or `disconnected`; a connect failure also produces `RunFailed` output.
- Approval, tool, and terminal state comes from Runtime events wrapped in HostEvent; the adapter does not synthesize lifecycle facts.
- Server WebSocket accepts only explicit cancellation. `SendMessage` and `ResolveApproval` require the parent application to call the corresponding Server client methods.
- Expected connection and command failures become structured FoldKit actions; defects and interruption remain Effect causes.
- `conversationItems` derives render-ready alignment, keys, tool status, waiting, approval, and failure rows, but FoldKit owns no styled view.
- The adapter does not own durable Sessions or execution semantics.

## Related

- Source: `packages/generalist/src/unstable/foldkit/`
- Server contract: [`server.md`](./server.md)
- Site: `/docs/guides/foldkit-chat`, `/docs/reference/foldkit`
