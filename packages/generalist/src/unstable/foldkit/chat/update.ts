import { Cause, Effect, Option, Result, Schema } from "effect"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { HostEvent } from "../../../host/event.js"
import type { RunEvent } from "../../../runtime/run/event.js"
import { AgentCommandError, type CommandOperation, type Connection, SendFailed } from "./connection.js"
import type { HostSessionSnapshot } from "../../../runtime/session/host.js"
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
import { isTerminal } from "../../../runtime/run.js"

const CompletedFields = { isFailure: Schema.Boolean, result: Schema.Unknown }

const Pending: CallableTaggedStruct<"Pending", Record<never, never>> = m("Pending")
const Completed: CallableTaggedStruct<"Completed", typeof CompletedFields> = m("Completed", CompletedFields)

type FailedAgentCommandMessage = typeof FailedAgentCommand.Type

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

type ToolCallLike = Extract<RunEvent, { readonly _tag: "ToolExecutionStarted" }>["call"]
type ToolResultLike = Extract<RunEvent, { readonly _tag: "ToolExecutionCompleted" }>["result"]

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

const resolveTool = (
  entries: ReadonlyArray<ChatEntry>,
  result: Pick<ToolResultLike, "id" | "name" | "result" | "isFailure">,
): ReadonlyArray<ChatEntry> => {
  const withCall = upsertToolCall(entries, { id: result.id, name: result.name, params: undefined })
  return withCall.map((entry) =>
    entry._tag === "ToolEntry" && entry.callId === result.id
      ? ToolEntry({
          callId: entry.callId,
          name: entry.name,
          params: entry.params,
          phase: entry.phase,
          outcome: Completed({ isFailure: result.isFailure, result: result.result }),
          progress: entry.progress,
        })
      : entry,
  )
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

const ignoredEventTags = new Set<string>([
  "SteeringDrained",
  "ModelResponseCommitted",
  "ModelResponseInterrupted",
  "ModelCallStarted",
  "ModelAttemptStarted",
  "ModelAttemptFirstOutput",
  "ModelAttemptCompleted",
  "ModelAttemptFailed",
  "ModelRetryScheduled",
  "ModelCallCompleted",
  "ModelCallFailed",
  "CompactionStarted",
  "CompactionApplied",
  "CompactionFailed",
  "TurnCompleted",
])

const applyEvent = (model: Model, event: RunEvent): readonly [Model, Option.Option<Output>] => {
  if (ignoredEventTags.has(event._tag)) return [model, Option.none()]
  switch (event._tag) {
    case "TurnStarted":
      return [changeModel(model, { run: Running({ turn: event.turn }) }), Option.none()]
    case "ToolExecutionStarted": {
      const key = conversationToolKey({ conversation: model.conversation, callId: event.call.id })
      return key === undefined
        ? [model, Option.none()]
        : [
            changeModel(model, { entries: upsertToolCall(model.entries, { ...event.call, id: key }, "executing") }),
            Option.none(),
          ]
    }
    case "ToolProgress": {
      const key = conversationToolKey({ conversation: model.conversation, callId: event.toolCallId })
      return event.message === undefined || key === undefined
        ? [model, Option.none()]
        : [changeModel(model, { entries: addProgress(model.entries, key, event.message) }), Option.none()]
    }
    case "ToolExecutionCompleted": {
      const key = conversationToolKey({ conversation: model.conversation, callId: event.call.id })
      if (key === undefined) return [model, Option.none()]
      return [
        changeModel(model, {
          entries: resolveTool(upsertToolCall(model.entries, { ...event.call, id: key }, "executing"), {
            ...event.result,
            id: key,
          }),
        }),
        Option.none(),
      ]
    }
    default:
      return [model, Option.none()]
  }
}

const applyHostEvent = (model: Model, hostEvent: HostEvent): readonly [Model, Option.Option<Output>] => {
  if (hostEvent.sessionId !== model.sessionId) return [model, Option.none()]
  if (hostEvent.cursor <= model.lastSeq) return [model, Option.none()]
  const withSequence = changeModel(model, { lastSeq: hostEvent.cursor })
  if (hostEvent._tag === "Conversation") {
    const next = applyConversationUpdate({ conversation: model.conversation, update: hostEvent.update })
    return Option.isNone(next)
      ? [model, Option.none()]
      : [
          changeModel(withSequence, { conversation: next.value, entries: conversationEntries(next.value) }),
          Option.none(),
        ]
  }
  if (hostEvent._tag === "TasksUpdated" || hostEvent._tag === "ArtifactUpdated") {
    return [withSequence, Option.none()]
  }
  const event = hostEvent.event
  if (event.parentRunId !== undefined) return [withSequence, Option.none()]
  switch (event._tag) {
    case "ApprovalRequested":
      return [
        changeModel(withSequence, {
          run: AwaitingApproval({
            token: event.request.approvalId,
            toolName: event.request.capability,
            params: event.request.input,
          }),
        }),
        Option.some(ApprovalRequired()),
      ]
    case "RunCompleted": {
      const text =
        "_tag" in event.result
          ? Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(event.result.value)
          : event.result.text
      return [
        changeModel(withSequence, {
          run: Idle(),
        }),
        Option.some(RunCompleted({ text })),
      ]
    }
    case "RunFailed": {
      const message = event.error.message
      return [changeModel(withSequence, { run: Failed({ message }) }), Option.some(RunFailed({ message }))]
    }
    case "RunCancelled":
      return [changeModel(withSequence, { run: Idle() }), Option.none()]
    default:
      return applyEvent(withSequence, event)
  }
}

const applySnapshot = (model: Model, snapshot: HostSessionSnapshot, epoch: number): Model => {
  if (snapshot.session.id !== model.sessionId || epoch <= model.connectionEpoch) return model
  const roots = snapshot.runs.filter((run) => run.parentRunId === undefined)
  const entries = conversationEntries(snapshot.conversation)
  const current = roots.find((item) => item.runId === snapshot.session.activeRunId)
  const settled = roots.findLast((item) => isTerminal(item.status))
  let run: Model["run"] = Idle()
  if (current === undefined && settled?.status === "failed")
    run = Failed({ message: "Run failed; inspect its committed outcome for details." })
  else if (current !== undefined && !isTerminal(current.status))
    run =
      current.approval === undefined
        ? Running({ turn: current.turn })
        : AwaitingApproval({
            token: current.approval.approvalId,
            toolName: current.approval.capability,
            params: current.approval.input,
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
      current === undefined || isTerminal(current.status)
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
