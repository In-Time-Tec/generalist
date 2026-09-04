---
title: "How to build a chat UI with FoldKit"
description: "Embed the headless Chat submodel in a FoldKit application, observe semantic RunEvents, and render committed entries, run state, and approvals."
---

`generalist/unstable/foldkit` adapts transport frames into FoldKit's Elm architecture. `Connection.Connection` is a long-lived resource that observes decoded durable RunEvent frames and connection facts; `Chat` is a headless submodel with a pure `update` that projects those frames into display state. It ships no styled components; rendering stays yours.

**Terminal**

```bash
bun add effect@4.0.0-rc.112 generalist foldkit@0.148.2
```

## 1. Open a session and embed the chat model

Embed `Chat.Model` in the application model and route every `Chat.Action` through one wrapper action. The host owns session creation: a command POSTs to the server from [the transport guide](/guides/serve-transport), then dispatches `Chat.OpenedSession`, which selects the session and lets the subscription attach. `Subscription.lift` keeps the frame stream alive across model changes and restarts it only when the session id changes.

**model.ts**

```typescript
import { Chat, Connection } from "generalist/unstable/foldkit"
import { Cause, Effect, Layer, Schema } from "effect"
import { dual } from "effect/Function"
import { FetchHttpClient, HttpBody, HttpClient, HttpClientResponse } from "effect/unstable/http"
import { type Command, define, mapMessages } from "foldkit/command"
import { m } from "foldkit/message"
import type { ApplicationInit } from "foldkit/runtime"
import type { CallableTaggedStruct } from "foldkit/schema"
import { type Subscriptions, lift } from "foldkit/subscription"
import { evo } from "foldkit/struct"
const SERVER_URL = "http://localhost:4000"

export interface Model {
  readonly chat: Chat.Model
}

export const Model: Schema.Schema<Model> = Schema.Struct({ chat: Chat.Model })

type GotChatActionFieldContract = { readonly action: typeof Chat.Action }
const GotChatActionFields: GotChatActionFieldContract = { action: Chat.Action }

export const GotChatAction: CallableTaggedStruct<"GotChatAction", typeof GotChatActionFields> = m(
  "GotChatAction",
  GotChatActionFields,
)

const FailedOpenSessionFields = { reason: Schema.String }

export const FailedOpenSession: CallableTaggedStruct<"FailedOpenSession", typeof FailedOpenSessionFields> = m(
  "FailedOpenSession",
  FailedOpenSessionFields,
)

export type Message = typeof GotChatAction.Type | typeof FailedOpenSession.Type

export const Message: Schema.Schema<Message> = Schema.Union([GotChatAction, FailedOpenSession])

const OpenSession = define("OpenSession", {
  messages: [GotChatAction, FailedOpenSession],
  execute: Effect.gen(function* () {
    const httpClient = yield* Layer.build(FetchHttpClient.layer)
    const response = yield* HttpClient.post(`${SERVER_URL}/sessions`, {
      body: HttpBody.jsonUnsafe({}),
    }).pipe(Effect.provideContext(httpClient))
    const body = yield* HttpClientResponse.schemaBodyJson(Schema.Struct({ sessionId: Schema.String }))(response)
    return GotChatAction({ action: Chat.OpenedSession({ sessionId: body.sessionId }) })
  }).pipe(
    Effect.scoped,
    Effect.catchCause((cause) => Effect.succeed(FailedOpenSession({ reason: Cause.pretty(cause) }))),
  ),
})

export const init: ApplicationInit<Model, Message, void, Connection.Connection> = () => [
  { chat: Chat.initialModel(null) },
  [OpenSession()],
]

type ProgramCommand = Command<Message, never, Connection.Connection>

const asProgramCommands = <Failure>(
  commands: ReadonlyArray<Command<Message, Failure, Connection.Connection>>,
): ReadonlyArray<ProgramCommand> =>
  commands.map((command) => ({
    ...command,
    effect: command.effect.pipe(Effect.catch(() => Effect.die("Chat command failed"))),
  }))

export const update: {
  (model: Model, message: Message): readonly [Model, ReadonlyArray<ProgramCommand>]
  (message: Message): (model: Model) => readonly [Model, ReadonlyArray<ProgramCommand>]
} = dual(2, (model: Model, message: Message): readonly [Model, ReadonlyArray<ProgramCommand>] => {
  switch (message._tag) {
    case "GotChatAction": {
      const [chat, chatCommands] = Chat.update(model.chat, message.action)
      return [
        { chat },
        asProgramCommands(mapMessages(chatCommands, (chatAction) => GotChatAction({ action: chatAction }))),
      ]
    }
    case "FailedOpenSession":
      return [{ chat: evo(model.chat, { run: () => Chat.Failed({ message: message.reason }) }) }, []]
  }
})

export const subscriptions: Subscriptions<Model, Message, Connection.Connection> = lift(Chat.subscriptions)({
  toChildModel: (model: Model) => model.chat,
  toParentMessage: (chatAction) => GotChatAction({ action: chatAction }),
})
```

<Note title="Replay is idempotent">
Chat.update drops any frame with `seq <= lastSeq` without changing state, so reconnect replays and duplicate deliveries are harmless by construction.
</Note>

## 2. Render semantic entries, run state, and the approval moment

The model gives the view its durable projection as data: `entries` holds user rows plus assistant and tool rows projected from normalized model-response and tool-execution events; `draft` holds the input, and `run` reports `Idle`, `Running`, `AwaitingApproval`, or `Failed`. There is no `Chat.Model.streaming` field: Chat never treats replayable events as provider-fragment authority. When `run` is `AwaitingApproval`, render approve and deny controls that dispatch `Chat.ClickedApprove` and `Chat.ClickedDeny`. The submodel already carries the token.

**view.ts**

```typescript
import { Chat } from "generalist/unstable/foldkit"
import type { Document, Html } from "foldkit/html"
import { html } from "../../../html"
import { GotChatAction, type Message, type Model } from "./model"

const entryView = (entry: Chat.ChatEntry): Html => {
  const h = html<Message>()
  switch (entry._tag) {
    case "UserEntry":
      return h.div([h.Class("entry entry-user")], [entry.text])
    case "AssistantEntry":
      return h.div([h.Class("entry entry-assistant")], [entry.text])
    case "ToolEntry":
      return h.div([h.Class("entry entry-tool")], [`${entry.name}: ${Chat.toolStatusOf(entry)}`])
  }
}

const runStateView = (run: Chat.RunState): Html => {
  const h = html<Message>()
  switch (run._tag) {
    case "Idle":
      return h.p([h.Class("run-state")], ["idle"])
    case "Running":
      return h.p([h.Class("run-state")], [`working on turn ${run.turn}`])
    case "AwaitingApproval":
      return h.p([h.Class("run-state")], ["waiting for approval"])
    case "Failed":
      return h.p([h.Class("run-state run-state-failed")], [run.message])
  }
}

const approvalView = (run: Chat.RunState): Html => {
  const h = html<Message>()
  if (run._tag !== "AwaitingApproval") return h.div([], [])
  return h.div(
    [h.Class("approval")],
    [
      h.p([], [`The agent wants to run ${run.toolName}.`]),
      h.button([h.Type("button"), h.OnClick(GotChatAction({ action: Chat.ClickedApprove() }))], ["Approve"]),
      h.button([h.Type("button"), h.OnClick(GotChatAction({ action: Chat.ClickedDeny({ reason: null }) }))], ["Deny"]),
    ],
  )
}

const promptView = (model: Model): Html => {
  const h = html<Message>()
  return h.form(
    [h.OnSubmit(GotChatAction({ action: Chat.SubmittedMessage() })), h.Class("prompt")],
    [
      h.input([
        h.Value(model.chat.draft),
        h.Placeholder("Ask something"),
        h.OnInput((value) => GotChatAction({ action: Chat.ChangedDraft({ text: value }) })),
      ]),
      h.button([h.Type("submit")], ["Send"]),
      h.button([h.Type("button"), h.OnClick(GotChatAction({ action: Chat.ClickedCancel() }))], ["Cancel"]),
    ],
  )
}

export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title: "Generalist chat",
    body: h.main(
      [h.Class("chat")],
      [
        h.p([h.Class("connection")], [`connection: ${model.chat.connection}`]),
        h.div([h.Class("entries")], model.chat.entries.map(entryView)),
        runStateView(model.chat.run),
        approvalView(model.chat.run),
        promptView(model),
      ],
    ),
  }
}
```

<Note title="Live previews are a separate observer">
`Runtime.previews` can expose bounded append frames for text and reasoning inside the Runtime process, but those frames are lossy, droppable, and absent from transport replay and Chat.Model. A host that chooses to bridge previews to a browser owns a separate route, model field, sequence-gap policy, and stale-preview cleanup policy.
</Note>

For richer rendering, `Chat.conversationItems`, `Chat.promptInputStatusOf`, and `Chat.toolStatusOf` map the model to foldcn-aligned view data; that is what [the deep-research web app](https://github.com/In-Time-Tec/generalist/blob/main/examples/deep-research-agent/web/src/main.ts) renders with styled components. A generic waiting item may indicate that the run is active, but it must not fabricate assistant text before a semantic response event arrives.

## 3. Wire the WebSocket resource and run

`Connection.layerWebSocket` composes the transport client and needs a WebSocket constructor; in the browser that is `Socket.layerWebSocketConstructorGlobal`. Provide it through the application's static `resources`.

**entry.ts**

```typescript
import { Connection } from "generalist/unstable/foldkit"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { makeApplication, run } from "foldkit/runtime"
import { Model, init, subscriptions, update } from "./model"
import { view } from "./view"

const resources = Connection.layerWebSocket({ baseUrl: "http://localhost:4000" }).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provide(FetchHttpClient.layer),
)

const application = makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  resources,
  container: document.getElementById("root"),
})

run(application)
```

## 4. Handle reconnection states

- The transport client reconnects with bounded exponential backoff and re-attaches with the last seen `seq`, so a dropped socket resumes where it left off.
- Connection facts fold into the same action stream: `model.connection` moves through `connecting`, `open`, `reconnecting`, and `disconnected`. Render it as a status badge.
- Send failures never vanish: every command converts them into `FailedAgentCommand`, which the update folds into a `Failed` run state.

The full model, action, output, and helper tables are in [the generalist/unstable/foldkit reference](/reference/foldkit). To build the server side of this page, start at [the research-agent tutorial](/start/research-agent).
