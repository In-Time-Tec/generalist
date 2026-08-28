import { Cause, Effect, Option, Result, Schema } from "effect"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { ObserverRunEvent, type ResolvedRunEvent } from "../../transport/wire.js"
import {
  AgentCommandError,
  type AgentConnection,
  type CommandOperation,
  type Incoming,
  SendFailed,
} from "./connection.js"
import {
  ApprovalRequired,
  AssistantEntry,
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

const CompletedFields = { isFailure: Schema.Boolean, result: Schema.Unknown }

const Pending: CallableTaggedStruct<"Pending", Record<never, never>> = m("Pending")
const Completed: CallableTaggedStruct<"Completed", typeof CompletedFields> = m("Completed", CompletedFields)

type FailedAgentCommandMessage = typeof FailedAgentCommand.Type

const changeModel = (model: Model, changes: Partial<Model>): Model =>
  ModelSchema.make({
    sessionId: changes.sessionId ?? model.sessionId,
    connection: changes.connection ?? model.connection,
    lastSeq: changes.lastSeq ?? model.lastSeq,
    run: changes.run ?? model.run,
    entries: changes.entries ?? model.entries,
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

const catchCommandFailure = <A>(
  operation: CommandOperation,
  effect: Effect.Effect<A, AgentCommandError, AgentConnection>,
) =>
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

type ModelResponseEvent = Extract<
  ResolvedRunEvent,
  { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }
>
type SemanticPart = ModelResponseEvent["response"]["content"][number]
type ToolCallLike = Extract<SemanticPart, { readonly type: "tool-call" }>
type ToolResultLike = Extract<SemanticPart, { readonly type: "tool-result" }>

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

const applyModelResponse = (model: Model, event: ModelResponseEvent): Model => {
  let entries = model.entries
  let text = ""
  let reasoning = ""
  for (const part of event.response.content) {
    switch (part.type) {
      case "text":
        text += part.text
        break
      case "reasoning":
        reasoning += part.text
        break
      case "tool-call":
        entries = upsertToolCall(entries, part)
        break
      case "tool-result":
        entries = resolveTool(entries, part)
        break
    }
  }
  if (text.length > 0 || reasoning.length > 0) {
    entries = [...entries, AssistantEntry({ text, reasoning: reasoning || null })]
  }
  return changeModel(model, { entries })
}

const ignoredEventTags = new Set<string>([
  "SteeringDrained",
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
  "StructuredOutput",
])

const applyEvent = (model: Model, event: ResolvedRunEvent): readonly [Model, Option.Option<Output>] => {
  if (ignoredEventTags.has(event._tag)) return [model, Option.none()]
  switch (event._tag) {
    case "TurnStarted":
      return [changeModel(model, { run: Running({ turn: event.turn }) }), Option.none()]
    case "ModelResponseCommitted":
    case "ModelResponseInterrupted":
      return [applyModelResponse(model, event), Option.none()]
    case "ToolExecutionStarted":
      return [changeModel(model, { entries: upsertToolCall(model.entries, event.call, "executing") }), Option.none()]
    case "ApprovalRequested":
      return [changeModel(model, { entries: upsertToolCall(model.entries, event.call) }), Option.none()]
    case "ToolProgress":
      return event.message === undefined
        ? [model, Option.none()]
        : [changeModel(model, { entries: addProgress(model.entries, event.toolCallId, event.message) }), Option.none()]
    case "ToolExecutionCompleted":
      return [
        changeModel(model, {
          entries: resolveTool(upsertToolCall(model.entries, event.call, "executing"), event.result),
        }),
        Option.none(),
      ]
    default:
      return [model, Option.none()]
  }
}

const applyRunEvent = (model: Model, event: ResolvedRunEvent): readonly [Model, Option.Option<Output>] => {
  if (event.sequence <= model.lastSeq) return [model, Option.none()]
  const withSequence = changeModel(model, { lastSeq: event.sequence })
  switch (event._tag) {
    case "RunWaiting":
      return event.wait.reason._tag === "Approval"
        ? [
            changeModel(withSequence, {
              run: AwaitingApproval({
                token: event.wait.reason.request.approvalId,
                toolName: event.wait.reason.request.capability,
                params: event.wait.reason.request.input,
              }),
            }),
            Option.some(ApprovalRequired()),
          ]
        : [withSequence, Option.none()]
    case "RunCompleted": {
      const text = "_tag" in event.result ? (JSON.stringify(event.result.value) ?? "null") : event.result.text
      return [changeModel(withSequence, { run: Idle() }), Option.some(RunCompleted({ text }))]
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

const isRunEvent = (incoming: Incoming): incoming is ResolvedRunEvent => Schema.is(ObserverRunEvent)(incoming)

export const chatUpdateRuntime = {
  Pending,
  Completed,
  catchCommandFailure,
  applyRunEvent,
  isRunEvent,
}
