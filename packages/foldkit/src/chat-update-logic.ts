import { Effect, Equivalence, Option, Schema, Stream } from "effect"
import { dual } from "effect/Function"
import { make } from "foldkit/subscription"
import { AgentConnection } from "./connection.js"
import {
  Action,
  type ChatCommand,
  type Model,
  type Output,
  CancelRun,
  Failed,
  Idle,
  ReceivedAgent,
  ResolveApproval,
  RunFailed,
  SendUserMessage,
  UserEntry,
} from "./chat.js"
import { chatUpdateRuntime } from "./chat-update.js"

const { applyFrame, isServerFrame } = chatUpdateRuntime

/** @experimental */
export const update: {
  (action: Action): (model: Model) => readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<Output>]
  (model: Model, action: Action): readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<Output>]
} = dual(2, (model: Model, action: Action) => {
  switch (action._tag) {
    case "ReceivedAgent":
      if (isServerFrame(action.incoming)) {
        const [next, output] = applyFrame(model, action.incoming)
        return [next, [], output]
      }
      switch (action.incoming._tag) {
        case "ConnectionOpened":
          return [{ ...model, connection: "open" }, [], Option.none()]
        case "ConnectionLost":
          return [
            { ...model, connection: model.sessionId === null ? "disconnected" : "reconnecting" },
            [],
            Option.none(),
          ]
        case "ConnectionFailed":
          return [
            { ...model, connection: "disconnected", run: Failed({ message: action.incoming.reason }) },
            [],
            Option.some(RunFailed({ message: action.incoming.reason })),
          ]
      }
    case "OpenedSession":
      return [
        {
          ...model,
          sessionId: action.sessionId,
          connection: "connecting",
          lastSeq: -1,
          run: Idle(),
          entries: [],
          streaming: null,
        },
        [],
        Option.none(),
      ]
    case "ChangedDraft":
      return [{ ...model, draft: action.text }, [], Option.none()]
    case "SubmittedMessage": {
      const text = model.draft.trim()
      if (model.sessionId === null || text.length === 0) return [model, [], Option.none()]
      return [
        { ...model, draft: "", entries: [...model.entries, UserEntry({ text })] },
        [SendUserMessage({ sessionId: model.sessionId, text })],
        Option.none(),
      ]
    }
    case "ClickedApprove":
      return model.sessionId !== null && model.run._tag === "AwaitingApproval"
        ? [
            model,
            [
              ResolveApproval({
                sessionId: model.sessionId,
                token: model.run.token,
                approved: true,
                reason: null,
              }),
            ],
            Option.none(),
          ]
        : [model, [], Option.none()]
    case "ClickedDeny":
      return model.sessionId !== null && model.run._tag === "AwaitingApproval"
        ? [
            model,
            [
              ResolveApproval({
                sessionId: model.sessionId,
                token: model.run.token,
                approved: false,
                reason: action.reason,
              }),
            ],
            Option.none(),
          ]
        : [model, [], Option.none()]
    case "ClickedCancel":
      return model.sessionId === null
        ? [model, [], Option.none()]
        : [model, [CancelRun({ sessionId: model.sessionId })], Option.none()]
    case "FailedAgentCommand":
      return [{ ...model, run: Failed({ message: action.reason }) }, [], Option.none()]
    case "SentUserMessage":
    case "ResolvedApproval":
    case "CancelledRun":
      return [model, [], Option.none()]
  }
})

/** @experimental */
export const subscriptions = make<Model, Action, AgentConnection>()((entry) => ({
  agentFrames: entry(
    { sessionId: Schema.NullOr(Schema.String), afterSeq: Schema.Finite },
    {
      modelToDependencies: (model) => ({ sessionId: model.sessionId, afterSeq: model.lastSeq }),
      keepAliveEquivalence: Equivalence.make((left, right) => left.sessionId === right.sessionId),
      dependenciesToStream: ({ sessionId }, readDependencies) => {
        if (sessionId === null) return Stream.empty
        return Stream.unwrap(
          AgentConnection.use((connection) => {
            const afterSeq = readDependencies().afterSeq
            return connection
              .session(afterSeq < 0 ? { sessionId } : { sessionId, afterSeq })
              .pipe(
                Effect.map((sessionConnection) =>
                  sessionConnection.frames.pipe(Stream.map((incoming) => ReceivedAgent({ incoming }))),
                ),
              )
          }),
        )
      },
    },
  ),
}))
