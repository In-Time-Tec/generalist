import { Chat, Connection } from "@batonfx/foldkit"
import { Cause, Effect, Schema } from "effect"
import { FetchHttpClient, HttpBody, HttpClient } from "effect/unstable/http"
import * as Command from "foldkit/command"
import { m } from "foldkit/message"
import type { ApplicationInit } from "foldkit/runtime"
import type { CallableTaggedStruct } from "foldkit/schema"
import * as Subscription from "foldkit/subscription"

const SERVER_URL = "http://localhost:4000"

export interface Model {
  readonly chat: Chat.Model
}

export const Model: Schema.Schema<Model> = Schema.Struct({ chat: Chat.Model })

const GotChatMessageFields = { message: Chat.Message }

export const GotChatMessage: CallableTaggedStruct<"GotChatMessage", typeof GotChatMessageFields> = m(
  "GotChatMessage",
  GotChatMessageFields,
)

const FailedOpenSessionFields = { reason: Schema.String }

export const FailedOpenSession: CallableTaggedStruct<"FailedOpenSession", typeof FailedOpenSessionFields> = m(
  "FailedOpenSession",
  FailedOpenSessionFields,
)

export type Message = typeof GotChatMessage.Type | typeof FailedOpenSession.Type

export const Message: Schema.Schema<Message> = Schema.Union([GotChatMessage, FailedOpenSession])

const OpenSession = Command.define(
  "OpenSession",
  GotChatMessage,
  FailedOpenSession,
)(
  Effect.gen(function* () {
    const response = yield* HttpClient.post(`${SERVER_URL}/sessions`, { body: HttpBody.jsonUnsafe({}) })
    const body = (yield* response.json) as { readonly sessionId: string }
    return GotChatMessage({ message: Chat.OpenedSession({ sessionId: body.sessionId }) })
  }).pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.catchCause((cause) => Effect.succeed(FailedOpenSession({ reason: Cause.pretty(cause) }))),
  ),
)

export const init: ApplicationInit<Model, Message, void, Connection.AgentConnection> = () => [
  { chat: Chat.initialModel(null) },
  [OpenSession()],
]

type ProgramCommand = Command.Command<Message, never, Connection.AgentConnection>

const asProgramCommands = (
  commands: ReadonlyArray<Command.Command<Message, unknown, Connection.AgentConnection>>,
): ReadonlyArray<ProgramCommand> => commands as unknown as ReadonlyArray<ProgramCommand>

export const update = (model: Model, message: Message): readonly [Model, ReadonlyArray<ProgramCommand>] => {
  switch (message._tag) {
    case "GotChatMessage": {
      const [chat, chatCommands] = Chat.update(model.chat, message.message)
      return [
        { chat },
        asProgramCommands(Command.mapMessages(chatCommands, (chatMessage) => GotChatMessage({ message: chatMessage }))),
      ]
    }
    case "FailedOpenSession":
      return [{ chat: { ...model.chat, run: Chat.Failed({ message: message.reason }) } }, []]
  }
}

export const subscriptions: Subscription.Subscriptions<Model, Message, Connection.AgentConnection> = Subscription.lift(
  Chat.subscriptions,
)({
  toChildModel: (model: Model) => model.chat,
  toParentMessage: (chatMessage) => GotChatMessage({ message: chatMessage }),
})
