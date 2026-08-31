import { Chat, Connection } from "generalist/foldkit"
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
