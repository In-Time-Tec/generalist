import { Effect, Equivalence, Option, Schema, Stream } from "effect"
import { dual } from "effect/Function"
import { make } from "foldkit/subscription"
import { Connection, ConnectionFailed, ConnectionLost, ConnectionOpened } from "./connection.js"
import {
  Action,
  type ChatCommand,
  type Model,
  Model as ModelSchema,
  type Output,
  CancelRun,
  Failed,
  Idle,
  ReceivedConnection,
  ResolveApproval,
  RunFailed,
  SendUserMessage,
  UserEntry,
} from "./service.js"
import { chatUpdateRuntime } from "./update.js"

const { applyHostEvent, isHostEvent } = chatUpdateRuntime

type UpdateResult = readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<Output>]

const changeModel = (model: Model, changes: Partial<Model>): Model =>
  ModelSchema.make({
    sessionId: changes.sessionId ?? model.sessionId,
    connection: changes.connection ?? model.connection,
    lastSeq: changes.lastSeq ?? model.lastSeq,
    run: changes.run ?? model.run,
    entries: changes.entries ?? model.entries,
    draft: changes.draft ?? model.draft,
  })

const updateReceived = (model: Model, action: typeof ReceivedConnection.Type): UpdateResult => {
  if (isHostEvent(action.event)) {
    const [next, output] = applyHostEvent(model, action.event)
    return [next, [], output]
  }
  if (Schema.is(ConnectionOpened)(action.event)) {
    return [changeModel(model, { connection: "open" }), [], Option.none()]
  }
  if (Schema.is(ConnectionLost)(action.event)) {
    return [
      changeModel(model, { connection: model.sessionId === null ? "disconnected" : "reconnecting" }),
      [],
      Option.none(),
    ]
  }
  if (Schema.is(ConnectionFailed)(action.event)) {
    return [
      changeModel(model, { connection: "disconnected", run: Failed({ message: action.event.reason }) }),
      [],
      Option.some(RunFailed({ message: action.event.reason })),
    ]
  }
  return [model, [], Option.none()]
}

const submitMessage = (model: Model): UpdateResult => {
  const text = model.draft.trim()
  if (model.sessionId === null || text.length === 0) return [model, [], Option.none()]
  return [
    changeModel(model, { draft: "", entries: [...model.entries, UserEntry({ text })] }),
    [SendUserMessage({ sessionId: model.sessionId, text })],
    Option.none(),
  ]
}

const resolveApproval = (model: Model, approved: boolean, reason: string | null): UpdateResult => {
  if (model.sessionId === null || model.run._tag !== "AwaitingApproval") return [model, [], Option.none()]
  return [
    model,
    [ResolveApproval({ sessionId: model.sessionId, token: model.run.token, approved, reason })],
    Option.none(),
  ]
}

const cancelRun = (model: Model): UpdateResult =>
  model.sessionId === null
    ? [model, [], Option.none()]
    : [model, [CancelRun({ sessionId: model.sessionId })], Option.none()]

/** @experimental */
export const update: {
  (action: Action): (model: Model) => readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<Output>]
  (model: Model, action: Action): readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<Output>]
} = dual(2, (model: Model, action: Action) => {
  switch (action._tag) {
    case "ReceivedConnection":
      return updateReceived(model, action)
    case "OpenedSession":
      return [
        changeModel(model, {
          sessionId: action.sessionId,
          connection: "connecting",
          lastSeq: -1,
          run: Idle(),
          entries: [],
        }),
        [],
        Option.none(),
      ]
    case "ChangedDraft":
      return [changeModel(model, { draft: action.text }), [], Option.none()]
    case "SubmittedMessage":
      return submitMessage(model)
    case "ClickedApprove":
      return resolveApproval(model, true, null)
    case "ClickedDeny":
      return resolveApproval(model, false, action.reason)
    case "ClickedCancel":
      return cancelRun(model)
    case "FailedAgentCommand":
      return [changeModel(model, { run: Failed({ message: action.reason }) }), [], Option.none()]
    case "SentUserMessage":
    case "ResolvedApproval":
    case "CancelledRun":
      return [model, [], Option.none()]
  }
})

/** @experimental */
export const subscriptions = make<Model, Action, Connection>()((entry) => ({
  agentFrames: entry(
    { sessionId: Schema.NullOr(Schema.String), afterSeq: Schema.Finite },
    {
      modelToDependencies: (model) => ({ sessionId: model.sessionId, afterSeq: model.lastSeq }),
      keepAliveEquivalence: Equivalence.make((left, right) => left.sessionId === right.sessionId),
      dependenciesToStream: ({ sessionId }, readDependencies) => {
        if (sessionId === null) return Stream.empty
        return Stream.unwrap(
          Connection.use((connection) => {
            const afterSeq = readDependencies().afterSeq
            return connection
              .session(afterSeq < 0 ? { sessionId } : { sessionId, afterSeq })
              .pipe(
                Effect.map((sessionConnection) =>
                  sessionConnection.frames.pipe(Stream.map((event) => ReceivedConnection({ event }))),
                ),
              )
          }),
        )
      },
    },
  ),
}))
