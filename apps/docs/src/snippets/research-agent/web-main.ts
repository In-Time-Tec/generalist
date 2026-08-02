import { Chat, Connection } from "@batonfx/foldkit"
import { Cause, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpBody, HttpClient } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import type { Command } from "foldkit/command"
import { define, mapMessages } from "foldkit/command"
import type { Document, Html } from "foldkit/html"
import { html } from "foldkit/html"
import { m } from "foldkit/message"
import type { ApplicationInit } from "foldkit/runtime"
import { makeApplication, run } from "foldkit/runtime"
import { ts } from "foldkit/schema"
import type { Subscriptions } from "foldkit/subscription"
import { lift } from "foldkit/subscription"
const SERVER_HTTP_URL = "http://localhost:4000"

const SessionOpening = ts("SessionOpening")
const SessionReady = ts("SessionReady")
const SessionFailed = ts("SessionFailed", { message: Schema.String })

type SessionState = typeof SessionOpening.Type | typeof SessionReady.Type | typeof SessionFailed.Type

const SessionState: Schema.Schema<SessionState> = Schema.Union([SessionOpening, SessionReady, SessionFailed])

const Model = Schema.Struct({
  chat: Chat.Model,
  session: SessionState,
})

type Model = typeof Model.Type

const GotChatAction = m("GotChatAction", { action: Chat.Action })
const OpenedSession = m("OpenedSession", { sessionId: Schema.String })
const FailedOpenSession = m("FailedOpenSession", { reason: Schema.String })

const Message = Schema.Union([GotChatAction, OpenedSession, FailedOpenSession])

type Message = typeof Message.Type

const OpenSession = define(
  "OpenSession",
  OpenedSession,
  FailedOpenSession,
)(
  Effect.gen(function* () {
    const response = yield* HttpClient.post(`${SERVER_HTTP_URL}/sessions`, { body: HttpBody.jsonUnsafe({}) })
    const body = (yield* response.json) as { readonly sessionId: string }
    return OpenedSession({ sessionId: body.sessionId })
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.catchCause((cause) => Effect.succeed(FailedOpenSession({ reason: Cause.pretty(cause) }))),
  ),
)

const init: ApplicationInit<Model, Message, void, Connection.AgentConnection> = () => [
  { chat: Chat.initialModel(null), session: SessionOpening() },
  [OpenSession()],
]

type ProgramCommand = Command<Message, never, Connection.AgentConnection>

const asProgramCommands = (
  commands: ReadonlyArray<Command<Message, unknown, Connection.AgentConnection>>,
): ReadonlyArray<ProgramCommand> => commands as ReadonlyArray<ProgramCommand>

const update = (model: Model, message: Message): readonly [Model, ReadonlyArray<ProgramCommand>] => {
  switch (message._tag) {
    case "OpenedSession":
      return [{ ...model, chat: { ...model.chat, sessionId: message.sessionId }, session: SessionReady() }, []]
    case "FailedOpenSession":
      return [{ ...model, session: SessionFailed({ message: message.reason }) }, []]
    case "GotChatAction": {
      const [chat, chatCommands] = Chat.update(model.chat, message.action)
      return [
        { ...model, chat },
        asProgramCommands(mapMessages(chatCommands, (chatAction) => GotChatAction({ action: chatAction }))),
      ]
    }
  }
}

const subscriptions: Subscriptions<Model, Message, Connection.AgentConnection> = lift(Chat.subscriptions)({
  toChildModel: (model: Model) => model.chat,
  toParentMessage: (chatAction) => GotChatAction({ action: chatAction }),
})

const entryView = (entry: Chat.ChatEntry): Html => {
  const h = html<Message>()
  switch (entry._tag) {
    case "UserEntry":
      return h.div([h.Class("self-end rounded-xl bg-blue-600 px-4 py-2 text-white")], [entry.text])
    case "AssistantEntry":
      return h.div([h.Class("self-start whitespace-pre-wrap rounded-xl bg-gray-100 px-4 py-2")], [entry.text])
    case "ToolEntry":
      return h.div(
        [h.Class("self-start rounded-xl border border-dashed px-4 py-2 text-sm text-gray-600")],
        [
          h.div([h.Class("font-mono font-semibold")], [`${entry.name} (${entry.phase})`]),
          h.pre([h.Class("mt-1 overflow-auto text-xs")], [JSON.stringify(entry.params)]),
          ...(entry.outcome._tag === "Completed"
            ? [h.pre([h.Class("mt-1 max-h-40 overflow-auto text-xs")], [JSON.stringify(entry.outcome.result)])]
            : []),
        ],
      )
  }
}

const approvalView = (awaitingApproval: Extract<Chat.RunState, { _tag: "AwaitingApproval" }>): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class("rounded-xl border border-amber-400 bg-amber-50 p-4")],
    [
      h.p([h.Class("font-semibold")], [`The agent wants to run ${awaitingApproval.toolName}`]),
      h.pre([h.Class("mt-1 overflow-auto text-xs")], [JSON.stringify(awaitingApproval.params)]),
      h.div(
        [h.Class("mt-3 flex gap-2")],
        [
          h.button(
            [
              h.OnClick(GotChatAction({ action: Chat.ClickedApprove() })),
              h.Class("rounded bg-emerald-600 px-3 py-1 text-white"),
            ],
            ["Approve"],
          ),
          h.button(
            [
              h.OnClick(GotChatAction({ action: Chat.ClickedDeny({ reason: null }) })),
              h.Class("rounded bg-red-600 px-3 py-1 text-white"),
            ],
            ["Deny"],
          ),
        ],
      ),
    ],
  )
}

const footerView = (model: Model): Html => {
  const h = html<Message>()
  const isReady = model.session._tag === "SessionReady"
  const isRunning = model.chat.run._tag === "Running" || model.chat.run._tag === "AwaitingApproval"
  return h.form(
    [h.OnSubmit(GotChatAction({ action: Chat.SubmittedMessage() })), h.Class("flex gap-2 border-t p-4")],
    [
      h.input([
        h.Value(model.chat.draft),
        h.OnInput((text) => GotChatAction({ action: Chat.ChangedDraft({ text }) })),
        h.Placeholder(isReady ? "Ask a research question…" : "Opening a session…"),
        h.Class("flex-1 rounded border px-3 py-2"),
      ]),
      isRunning
        ? h.button(
            [
              h.Type("button"),
              h.OnClick(GotChatAction({ action: Chat.ClickedCancel() })),
              h.Class("rounded bg-gray-200 px-4 py-2"),
            ],
            ["Cancel"],
          )
        : h.button([h.Type("submit"), h.Class("rounded bg-blue-600 px-4 py-2 text-white")], ["Send"]),
    ],
  )
}

const view = (model: Model): Document => {
  const h = html<Message>()
  const streaming =
    model.chat.streaming === null
      ? []
      : [
          h.div(
            [h.Class("self-start whitespace-pre-wrap rounded-xl bg-gray-100 px-4 py-2")],
            [model.chat.streaming.text],
          ),
        ]
  const approval = model.chat.run._tag === "AwaitingApproval" ? [approvalView(model.chat.run)] : []
  return {
    title: "Research Agent",
    body: h.div(
      [h.Class("mx-auto flex h-screen max-w-2xl flex-col")],
      [
        h.header(
          [h.Class("border-b px-4 py-3")],
          [h.h1([h.Class("font-semibold")], [`Research agent — ${model.chat.connection}`])],
        ),
        h.div(
          [h.Class("flex flex-1 flex-col gap-3 overflow-y-auto p-4")],
          [...model.chat.entries.map(entryView), ...streaming, ...approval],
        ),
        footerView(model),
      ],
    ),
  }
}

const resources = Connection.layerWebSocket({ url: "ws://localhost:4000/ws" }).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
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
