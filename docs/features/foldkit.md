# FoldKit

`generalist/unstable/foldkit` turns transport connections and semantic `RunEvent`s into FoldKit subscriptions, commands, and a headless chat model. The adapter owns browser projection, not styled views or run execution.

## Usage

Embed `Chat.Model`, route its actions and commands through the parent, then provide the WebSocket connection Layer:

```ts
import { Chat, Connection } from "generalist/unstable/foldkit"
import { Layer } from "effect"
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

const resources = Connection.layerWebSocket({ url: "/ws" }).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal))
```

`OpenSession` obtains a Runtime run ID and emits
`Chat.OpenedSession({ sessionId })`; the parent view emits actions such as
`Chat.ChangedDraft`, `Chat.SubmittedMessage`, and `Chat.ClickedCancel`.

## What runs

```text
OpenedSession({ sessionId: "run-1" })
└── Chat.update()
    └── model: connecting, lastSeq: -1, entries: []
        └── Chat.subscriptions
            └── Connection.session({ sessionId: "run-1" })
                ├── RunClient.connect({ runId: "run-1" })
                └── frames
                    └── ReceivedConnection({ event })

SubmittedMessage() with draft " hello "
└── Chat.update()
    ├── append UserEntry({ text: "hello" })
    └── SendUserMessage({ sessionId: "run-1", text: "hello" })
        └── Connection.send({ _tag: "SendMessage", ... })
```

## Data flow

```text
ResolvedRunEvent: ModelResponseCommitted, sequence: 7
content: text("Hello "), tool-call("search"), text("world")
    │ applyRunEvent()
    ▼
Chat.Model
lastSeq: 7
entries: ToolEntry("search"), AssistantEntry("Hello world")
    │ Chat.conversationItems()
    ▼
ToolConversationItem + AssistantConversationItem
```

## Invariants

- One scoped `Connection.session` acquisition owns one transport connection and one command route for its session ID.
- Each overlapping acquisition keeps its own scoped route; the global route points to the latest owner, and releasing an older owner cannot remove its successor.
- A subscription reconnects from `lastSeq` as an exclusive cursor and stays alive while only that cursor changes.
- Events whose `sequence` is at or below `lastSeq` are ignored; unknown future observer events advance `lastSeq` without changing chat entries.
- Committed and interrupted normalized model responses become semantic assistant and tool entries; transport preview fragments do not.
- Connection statuses project to `open`, `reconnecting`, or `disconnected`; a connect failure also produces `RunFailed` output.
- Submitting trims a non-empty draft, appends the user entry optimistically, clears the draft, and emits a command only when a session exists.
- Approval, completion, failure, and cancellation state comes from Runtime `RunEvent`s; the adapter does not synthesize run lifecycle facts.
- The canonical WebSocket transport accepts only `Cancel`; `SendMessage` and `ResolveApproval` require a Runtime host command adapter.
- Expected transport and command failures become structured FoldKit actions; defects and interruption remain Effect causes.
- `conversationItems` derives render-ready alignment, keys, tool status, waiting, approval, and failure rows, but FoldKit owns no styled view.
- The adapter does not own durable sessions or execution semantics.

## Related

- Source: `packages/generalist/src/foldkit/`
- Site: `/docs/guides/foldkit-chat`
- Site: `/docs/reference/foldkit`
