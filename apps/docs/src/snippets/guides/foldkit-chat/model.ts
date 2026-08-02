import { Chat, Connection } from "@batonfx/foldkit"
import { Cause, Effect, Schema } from "effect"
import { FetchHttpClient, HttpBody, HttpClient } from "effect/unstable/http"
import type { Command } from "foldkit/command"
import { define, mapMessages } from "foldkit/command"
import { m } from "foldkit/message"
import type { ApplicationInit } from "foldkit/runtime"
import type { CallableTaggedStruct } from "foldkit/schema"
import type { Subscriptions } from "foldkit/subscription"
import { lift } from "foldkit/subscription"
const SERVER_URL = "http://localhost:4000"

export interface Model {
  readonly chat: Chat.Model
}

export const Model: Schema.Schema<Model> = Schema.Struct({ chat: Chat.Model })

const GotChatActionFields: { readonly action: typeof Chat.Action } = { action: Chat.Action }

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

const OpenSession = define(
  "OpenSession",
  GotChatAction,
  FailedOpenSession,
)(
  Effect.gen(function* () {
    const response = yield* HttpClient.post(`${SERVER_URL}/sessions`, { body: HttpBody.jsonUnsafe({}) })
    const body = (yield* response.json) as { readonly sessionId: string }
    return GotChatAction({ action: Chat.OpenedSession({ sessionId: body.sessionId }) })
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.catchCause((cause) => Effect.succeed(FailedOpenSession({ reason: Cause.pretty(cause) }))),
  ),
)

export const init: ApplicationInit<Model, Message, void, Connection.AgentConnection> = () => [
  { chat: Chat.initialModel(null) },
  [OpenSession()],
]

type ProgramCommand = Command<Message, never, Connection.AgentConnection>

const asProgramCommands = (
  commands: ReadonlyArray<Command<Message, unknown, Connection.AgentConnection>>,
): ReadonlyArray<ProgramCommand> => commands as ReadonlyArray<ProgramCommand>

export const update = (model: Model, message: Message): readonly [Model, ReadonlyArray<ProgramCommand>] => {
  switch (message._tag) {
    case "GotChatAction": {
      const [chat, chatCommands] = Chat.update(model.chat, message.action)
      return [
        { chat },
        asProgramCommands(mapMessages(chatCommands, (chatAction) => GotChatAction({ action: chatAction }))),
      ]
    }
    case "FailedOpenSession":
      return [{ chat: { ...model.chat, run: Chat.Failed({ message: message.reason }) } }, []]
  }
}

export const subscriptions: Subscriptions<Model, Message, Connection.AgentConnection> = lift(Chat.subscriptions)({
  toChildModel: (model: Model) => model.chat,
  toParentMessage: (chatAction) => GotChatAction({ action: chatAction }),
})
