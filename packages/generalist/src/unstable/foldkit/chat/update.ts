import { Cause, Effect, Option, Result, Schema } from "effect"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { AgentCommandError, type CommandOperation, type Connection, SendFailed } from "./connection.js"
import type { ClientEvent, ClientSessionSnapshot } from "../../../server/projection/index.js"
import {
  ApprovalRequired,
  AwaitingApproval,
  Failed,
  FailedAgentCommand,
  Idle,
  RunCompleted,
  RunFailed,
  Running,
  ToolEntry,
  type ChatEntry,
  type Model,
  Model as ModelSchema,
  type Output,
  type ToolPendingPhase,
} from "./service.js"
import { conversationEntries, conversationToolKey } from "./conversation.js"
import { applyConversationUpdate } from "../../../runtime/session/conversation.js"

const CompletedFields = { isFailure: Schema.Boolean, result: Schema.Unknown }

const Pending: CallableTaggedStruct<"Pending", Record<never, never>> = m("Pending")
const Completed: CallableTaggedStruct<"Completed", typeof CompletedFields> = m("Completed", CompletedFields)

type FailedAgentCommandMessage = typeof FailedAgentCommand.Type

const changeModel = (model: Model, changes: Partial<Model>): Model =>
  ModelSchema.make({
    sessionId: changes.sessionId ?? model.sessionId,
    connection: changes.connection ?? model.connection,
    lastSeq: changes.lastSeq === undefined ? model.lastSeq : changes.lastSeq,
    connectionEpoch: changes.connectionEpoch ?? model.connectionEpoch,
    run: changes.run ?? model.run,
    entries: changes.entries ?? model.entries,
    conversation: changes.conversation ?? model.conversation,
    preview: changes.preview === undefined ? model.preview : changes.preview,
    previewAuthority: changes.previewAuthority === undefined ? model.previewAuthority : changes.previewAuthority,
    draft: changes.draft ?? model.draft,
  })

const unexpectedCause = <E>(cause: Cause.Cause<E>): Option.Option<Cause.Cause<never>> => {
  const reasons: Array<Cause.Reason<never>> = []
  for (const reason of cause.reasons) {
    if (Cause.isDieReason(reason) || Cause.isInterruptReason(reason)) reasons.push(reason)
  }
  return reasons.length === 0 ? Option.none() : Option.some(Cause.fromReasons(reasons))
}

const commandFailed = (operation: CommandOperation, error: AgentCommandError): FailedAgentCommandMessage =>
  FailedAgentCommand({
    operation,
    error,
    reason: Schema.is(SendFailed)(error) ? error.reason : error.message,
  })

const catchCommandFailure = <A>(operation: CommandOperation, effect: Effect.Effect<A, AgentCommandError, Connection>) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Option.match(unexpectedCause(cause), {
        onNone: () =>
          Result.match(Cause.findError(cause), {
            onFailure: Effect.failCause,
            onSuccess: (error) => Effect.succeed(commandFailed(operation, error)),
          }),
        onSome: Effect.failCause,
      }),
    ),
  )

interface ToolCallLike {
  readonly id: string
  readonly name: string
  readonly params: unknown
}

const upsertToolCall = (
  entries: ReadonlyArray<ChatEntry>,
  call: Pick<ToolCallLike, "id" | "name" | "params">,
  phase: ToolPendingPhase = "called",
): ReadonlyArray<ChatEntry> => {
  const index = entries.findIndex((entry) => entry._tag === "ToolEntry" && entry.callId === call.id)
  const previous = index >= 0 ? entries[index] : undefined
  const previousToolEntry = previous?._tag === "ToolEntry" ? previous : undefined
  const nextPhase = previousToolEntry?.phase === "executing" || phase === "executing" ? "executing" : "called"
  const next = ToolEntry({
    callId: call.id,
    name: call.name,
    params: call.params === undefined ? previousToolEntry?.params : call.params,
    phase: nextPhase,
    outcome: previousToolEntry?.outcome ?? Pending(),
    progress: previousToolEntry?.progress ?? [],
  })
  if (index < 0) return [...entries, next]
  return entries.map((entry, entryIndex) => (entryIndex === index ? next : entry))
}

const addProgress = (entries: ReadonlyArray<ChatEntry>, callId: string, message: string): ReadonlyArray<ChatEntry> =>
  entries.map((entry) =>
    entry._tag === "ToolEntry" && entry.callId === callId
      ? ToolEntry({
          callId: entry.callId,
          name: entry.name,
          params: entry.params,
          phase: entry.phase,
          outcome: entry.outcome,
          progress: entry.progress.concat(message),
        })
      : entry,
  )

type ProjectedEvent<Tag extends ClientEvent["_tag"]> = Extract<ClientEvent, { readonly _tag: Tag }>
type HostEventResult = readonly [Model, Option.Option<Output>]

const applyConversationChanged = (
  previous: Model,
  sequenced: Model,
  event: ProjectedEvent<"ConversationChanged">,
): HostEventResult => {
  const next = applyConversationUpdate({ conversation: previous.conversation, update: event.update })
  return Option.isNone(next)
    ? [previous, Option.none()]
    : [changeModel(sequenced, { conversation: next.value, entries: conversationEntries(next.value) }), Option.none()]
}

const applyApprovalRequested = (model: Model, event: ProjectedEvent<"ApprovalRequested">): HostEventResult => [
  changeModel(model, {
    run: AwaitingApproval({
      token: event.approval.id,
      toolName: event.approval.tool,
      params: { summary: event.approval.summary },
    }),
  }),
  Option.some(ApprovalRequired()),
]

const applyToolProgress = (model: Model, event: ProjectedEvent<"ToolProgress">): HostEventResult => {
  const key = conversationToolKey({ conversation: model.conversation, callId: event.toolCallId })
  if (key === undefined) return [model, Option.none()]
  let entries = upsertToolCall(
    model.entries,
    { id: key, name: event.tool, params: undefined },
    event.status === "started" || event.status === "waiting" ? "executing" : "called",
  )
  if (event.summary !== undefined) entries = addProgress(entries, key, event.summary)
  return [changeModel(model, { entries }), Option.none()]
}

const applyRunChanged = (model: Model, event: ProjectedEvent<"RunChanged">): HostEventResult => {
  if (event.run.parentRunId !== undefined) return [model, Option.none()]
  switch (event.run.status) {
    case "pending":
    case "running":
      return [changeModel(model, { run: Running({ turn: event.run.turn }) }), Option.none()]
    case "waiting":
      return event.run.approval === undefined
        ? [changeModel(model, { run: Running({ turn: event.run.turn }) }), Option.none()]
        : [
            changeModel(model, {
              run: AwaitingApproval({
                token: event.run.approval.id,
                toolName: event.run.approval.tool,
                params: { summary: event.run.approval.summary },
              }),
            }),
            Option.some(ApprovalRequired()),
          ]
    case "succeeded": {
      const assistant = model.entries.findLast((entry) => entry._tag === "AssistantEntry")
      return assistant?._tag === "AssistantEntry"
        ? [changeModel(model, { run: Idle() }), Option.some(RunCompleted({ text: assistant.text }))]
        : [changeModel(model, { run: Idle() }), Option.none()]
    }
    case "failed": {
      const message = "Run failed; inspect its committed outcome for details."
      return [changeModel(model, { run: Failed({ message }) }), Option.some(RunFailed({ message }))]
    }
    case "cancelled":
      return [changeModel(model, { run: Idle() }), Option.none()]
  }
}

const applyHostEvent = (model: Model, event: ClientEvent): HostEventResult => {
  if (event.sessionId !== model.sessionId || event.cursor === model.lastSeq) return [model, Option.none()]
  const sequenced = changeModel(model, { lastSeq: event.cursor })
  switch (event._tag) {
    case "ConversationChanged":
      return applyConversationChanged(model, sequenced, event)
    case "ApprovalRequested":
      return applyApprovalRequested(sequenced, event)
    case "ToolProgress":
      return applyToolProgress(sequenced, event)
    case "RunChanged":
      return applyRunChanged(sequenced, event)
    default:
      return [sequenced, Option.none()]
  }
}

const applySnapshot = (model: Model, snapshot: ClientSessionSnapshot, epoch: number): Model => {
  if (snapshot.session.id !== model.sessionId || epoch <= model.connectionEpoch) return model
  const roots = snapshot.runs.filter((run) => run.parentRunId === undefined)
  const entries = conversationEntries(snapshot.conversation)
  const current = roots.find((item) => item.runId === snapshot.session.activeRunId)
  const settled = roots.findLast(
    (item) => item.status === "succeeded" || item.status === "failed" || item.status === "cancelled",
  )
  let run: Model["run"] = Idle()
  if (current === undefined && settled?.status === "failed")
    run = Failed({ message: "Run failed; inspect its committed outcome for details." })
  else if (
    current !== undefined &&
    current.status !== "succeeded" &&
    current.status !== "failed" &&
    current.status !== "cancelled"
  )
    run =
      current.approval === undefined
        ? Running({ turn: current.turn })
        : AwaitingApproval({
            token: current.approval.id,
            toolName: current.approval.tool,
            params: { summary: current.approval.summary },
          })
  return changeModel(model, {
    connectionEpoch: epoch,
    lastSeq: snapshot.cursor,
    connection: "connecting",
    run,
    entries,
    conversation: snapshot.conversation,
    preview: null,
    previewAuthority:
      current === undefined ||
      current.status === "succeeded" ||
      current.status === "failed" ||
      current.status === "cancelled"
        ? null
        : {
            runId: current.runId,
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
}

export const chatUpdateRuntime = {
  Pending,
  Completed,
  catchCommandFailure,
  applyHostEvent,
  applySnapshot,
}
