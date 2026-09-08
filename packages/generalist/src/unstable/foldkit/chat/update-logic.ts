import { Effect, Equivalence, Option, Schema, Stream } from "effect"
import { dual } from "effect/Function"
import { make } from "foldkit/subscription"
import {
  Connection,
  ConnectionFailed,
  ConnectionLost,
  ConnectionOpened,
  HostDelivery,
  PreviewDelivery,
  SessionSnapshot,
} from "./connection.js"
import {
  Action,
  type ChatCommand,
  type Model,
  Model as ModelSchema,
  MaxPreviewStateCharacters,
  type Output,
  CancelRun,
  Failed,
  Idle,
  ReceivedConnection,
  ResolveApproval,
  RunFailed,
  Running,
  SendUserMessage,
} from "./service.js"
import { chatUpdateRuntime } from "./update.js"

const { applyHostEvent, applySnapshot } = chatUpdateRuntime

type UpdateResult = readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<Output>]

const changeModel = (model: Model, changes: Partial<Model>): Model =>
  ModelSchema.make({
    sessionId: changes.sessionId ?? model.sessionId,
    connection: changes.connection ?? model.connection,
    lastSeq: changes.lastSeq ?? model.lastSeq,
    connectionEpoch: changes.connectionEpoch ?? model.connectionEpoch,
    run: changes.run ?? model.run,
    entries: changes.entries ?? model.entries,
    conversation: changes.conversation ?? model.conversation,
    preview: changes.preview === undefined ? model.preview : changes.preview,
    previewAuthority: changes.previewAuthority === undefined ? model.previewAuthority : changes.previewAuthority,
    draft: changes.draft ?? model.draft,
  })

const previewPosition = (
  authority: NonNullable<Model["previewAuthority"]>,
  event: Extract<(typeof PreviewDelivery.Type)["delivery"]["event"], { readonly _tag: "ModelPreview" }>,
): number => {
  if (event.attemptFence !== authority.attemptFence) return event.attemptFence - authority.attemptFence
  if (event.generation !== authority.generation) return event.generation - authority.generation
  if (event.turn !== authority.turn) return event.turn - authority.turn
  return event.attempt - authority.attempt
}

const tombstonePreview = (model: Model): Model =>
  changeModel(model, {
    preview: null,
    previewAuthority: model.previewAuthority === null ? null : { ...model.previewAuthority, tombstoned: true },
  })

// oxlint-disable-next-line complexity -- Every provisional ordering and authority rejection stays explicit at this boundary.
const applyPreview = (model: Model, delivery: typeof PreviewDelivery.Type): Model => {
  if (delivery.epoch !== model.connectionEpoch || delivery.delivery.sessionId !== model.sessionId) return model
  if (model.run._tag !== "Running") return model
  const { authorityAttemptFence, event, runId } = delivery.delivery
  if (event.runId !== runId || event.attemptFence !== authorityAttemptFence) return model
  const authority = model.previewAuthority
  if (authority === null || authority.runId !== runId) return model
  if (event._tag === "ModelPreviewCleared") {
    if (
      event.attemptFence < authority.attemptFence ||
      (event.attemptFence === authority.attemptFence && event.generation < authority.generation)
    ) {
      return model
    }
    return changeModel(model, {
      preview: null,
      previewAuthority:
        event.attemptFence === authority.attemptFence && event.generation === authority.generation
          ? { ...authority, tombstoned: true }
          : {
              runId,
              attemptFence: event.attemptFence,
              generation: event.generation,
              turn: -1,
              attempt: -1,
              modelCallId: null,
              modelAttemptId: null,
              sequence: -1,
              tombstoned: true,
            },
    })
  }

  const position = previewPosition(authority, event)
  if (position < 0) return model
  if (position > 0) {
    if (event.sequence !== 0) return tombstonePreview(model)
  } else {
    if (authority.tombstoned) return model
    if (event.modelCallId !== authority.modelCallId || event.modelAttemptId !== authority.modelAttemptId) {
      return tombstonePreview(model)
    }
    if (event.sequence <= authority.sequence) return model
    if (event.sequence !== authority.sequence + 1) return tombstonePreview(model)
  }

  let text = position === 0 ? (model.preview?.text ?? "") : ""
  let reasoning = position === 0 ? (model.preview?.reasoning ?? "") : ""
  for (const change of event.changes) {
    const value = change.channel === "text" ? text : reasoning
    if (change.offset !== value.length || value.length + change.delta.length > MaxPreviewStateCharacters) {
      return tombstonePreview(model)
    }
    if (change.channel === "text") text += change.delta
    else reasoning += change.delta
  }
  return changeModel(model, {
    preview: {
      runId,
      attemptFence: authorityAttemptFence,
      turn: event.turn,
      modelCallId: event.modelCallId,
      modelAttemptId: event.modelAttemptId,
      attempt: event.attempt,
      sequence: event.sequence,
      text,
      reasoning,
    },
    previewAuthority: {
      runId,
      attemptFence: authorityAttemptFence,
      generation: event.generation,
      turn: event.turn,
      attempt: event.attempt,
      modelCallId: event.modelCallId,
      modelAttemptId: event.modelAttemptId,
      sequence: event.sequence,
      tombstoned: false,
    },
  })
}

// oxlint-disable-next-line complexity -- The closed connection-event union is dispatched in one reducer boundary.
const updateReceived = (model: Model, action: typeof ReceivedConnection.Type): UpdateResult => {
  if (Schema.is(SessionSnapshot)(action.event)) {
    return [applySnapshot(model, action.event.snapshot, action.event.epoch), [], Option.none()]
  }
  if (Schema.is(PreviewDelivery)(action.event)) {
    return [applyPreview(model, action.event), [], Option.none()]
  }
  if (Schema.is(HostDelivery)(action.event)) {
    if (action.event.epoch !== model.connectionEpoch) return [model, [], Option.none()]
    const event = action.event.event
    if (event.sessionId !== model.sessionId || event.cursor <= model.lastSeq) return [model, [], Option.none()]
    const activeRunId = action.event.activeRunId
    const clearsPreview =
      event._tag !== "Conversation" &&
      model.previewAuthority?.runId === event.runId &&
      (event._tag === "Completed" || (event._tag === "Turn" && event.event._tag === "TurnCompleted"))
    let base = model
    const previousRunId =
      model.run._tag === "Idle" || model.run._tag === "Failed" ? null : (model.previewAuthority?.runId ?? null)
    if (previousRunId !== activeRunId) {
      base = changeModel(model, {
        run: activeRunId === null ? Idle() : Running({ turn: 0 }),
        preview: null,
        previewAuthority:
          activeRunId === null
            ? tombstonePreview(model).previewAuthority
            : {
                runId: activeRunId,
                attemptFence: -1,
                generation: -1,
                turn: -1,
                attempt: -1,
                modelCallId: null,
                modelAttemptId: null,
                sequence: -1,
                tombstoned: false,
              },
      })
    } else if (clearsPreview) {
      base = tombstonePreview(model)
    }
    const otherRoot = "event" in event && event.event.parentRunId === undefined && event.runId !== activeRunId
    if (otherRoot && event._tag !== "Completed")
      return [changeModel(base, { lastSeq: event.cursor }), [], Option.none()]
    const [next, output] = applyHostEvent(base, event)
    return [otherRoot && activeRunId !== null ? changeModel(next, { run: base.run }) : next, [], output]
  }
  if (action.event.sessionId !== model.sessionId || action.event.epoch < model.connectionEpoch)
    return [model, [], Option.none()]
  if (!Schema.is(ConnectionFailed)(action.event) && action.event.epoch !== model.connectionEpoch)
    return [model, [], Option.none()]
  if (Schema.is(ConnectionOpened)(action.event)) {
    return [changeModel(model, { connection: "open" }), [], Option.none()]
  }
  if (Schema.is(ConnectionLost)(action.event)) {
    return [
      changeModel(tombstonePreview(model), {
        connection: model.sessionId === null ? "disconnected" : "reconnecting",
      }),
      [],
      Option.none(),
    ]
  }
  if (Schema.is(ConnectionFailed)(action.event)) {
    return [
      changeModel(model, {
        connectionEpoch: action.event.epoch,
        connection: "disconnected",
        preview: null,
        previewAuthority: model.previewAuthority === null ? null : { ...model.previewAuthority, tombstoned: true },
        run: Failed({ message: action.event.reason }),
      }),
      [],
      Option.some(RunFailed({ message: action.event.reason })),
    ]
  }
  return [model, [], Option.none()]
}

const submitMessage = (model: Model): UpdateResult => {
  const text = model.draft.trim()
  if (model.sessionId === null || text.length === 0) return [model, [], Option.none()]
  return [changeModel(model, { draft: "" }), [SendUserMessage({ sessionId: model.sessionId, text })], Option.none()]
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
    : [
        model,
        [
          CancelRun({
            sessionId: model.sessionId,
            commandId: JSON.stringify(["cancel", model.sessionId, model.lastSeq]),
          }),
        ],
        Option.none(),
      ]

/** @experimental */
export const update: {
  (action: Action): (model: Model) => readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<Output>]
  (model: Model, action: Action): readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<Output>]
} = dual(2, (model: Model, action: Action) => {
  switch (action._tag) {
    case "ReceivedConnection":
      return updateReceived(model, action)
    case "OpenedSession":
      if (action.sessionId === model.sessionId) return [model, [], Option.none()]
      return [
        changeModel(model, {
          sessionId: action.sessionId,
          connection: "connecting",
          lastSeq: -1,
          connectionEpoch: -1,
          run: Idle(),
          entries: [],
          preview: null,
          previewAuthority: null,
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
    { sessionId: Schema.NullOr(Schema.String) },
    {
      modelToDependencies: (model) => ({ sessionId: model.sessionId }),
      keepAliveEquivalence: Equivalence.make((left, right) => left.sessionId === right.sessionId),
      dependenciesToStream: ({ sessionId }: { readonly sessionId: string | null }) => {
        if (sessionId === null) return Stream.empty
        return Stream.unwrap(
          Connection.use((connection) =>
            connection
              .session({ sessionId })
              .pipe(
                Effect.map((sessionConnection) =>
                  sessionConnection.frames.pipe(Stream.map((event) => ReceivedConnection({ event }))),
                ),
              ),
          ),
        )
      },
    },
  ),
}))
