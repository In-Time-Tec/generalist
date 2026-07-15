import { Cause, Equivalence, Effect, Option, Result, Schema, Stream } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"
import { define, type Command } from "foldkit/command"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { make } from "foldkit/subscription"
import { Wire } from "@batonfx/transport"
import { AgentCommandError, AgentConnection, CommandOperation, Incoming, SendFailed } from "./connection.js"
const CompletedFields = { isFailure: Schema.Boolean, result: Schema.Unknown }
const UserEntryFields = { text: Schema.String }
const AssistantEntryFields = { text: Schema.String, reasoning: Schema.NullOr(Schema.String) }
const RunCompletedFields = { text: Schema.String }
const OpenedSessionFields = { sessionId: Schema.String }

/** @experimental */
export const ToolPendingPhase = Schema.Literals(["called", "executing"])

/** @experimental */
export type ToolPendingPhase = typeof ToolPendingPhase.Type

const ToolEntryFields = {
  callId: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  phase: ToolPendingPhase,
  outcome: Schema.suspend((): Schema.Schema<ToolOutcome> => ToolOutcome),
  progress: Schema.Array(Schema.String),
}
const RunningFields = { turn: Schema.Finite }
const AwaitingApprovalFields = {
  token: Schema.String,
  toolName: Schema.String,
  params: Schema.Unknown,
}
const ClickedDenyFields = { reason: Schema.NullOr(Schema.String) }
const ReceivedAgentFields = { incoming: Incoming }
const ModelStreaming = Schema.Struct({
  turn: Schema.Finite,
  text: Schema.String,
  reasoning: Schema.String,
})
const ModelConnection = Schema.Literals(["disconnected", "connecting", "open", "reconnecting"])

const Pending: CallableTaggedStruct<"Pending", {}> = m("Pending")
const Completed: CallableTaggedStruct<"Completed", typeof CompletedFields> = m("Completed", CompletedFields)

/** @experimental */
export type ToolOutcome = typeof Pending.Type | typeof Completed.Type

/** @experimental */
export const ToolOutcome: Schema.Schema<ToolOutcome> = Schema.Union([Pending, Completed])

/** @experimental */
export const UserEntry: CallableTaggedStruct<"UserEntry", typeof UserEntryFields> = m("UserEntry", UserEntryFields)

/** @experimental */
export const AssistantEntry: CallableTaggedStruct<"AssistantEntry", typeof AssistantEntryFields> = m(
  "AssistantEntry",
  AssistantEntryFields,
)

/** @experimental */
export const ToolEntry: CallableTaggedStruct<"ToolEntry", typeof ToolEntryFields> = m("ToolEntry", ToolEntryFields)

/** @experimental */
export type ChatEntry = typeof UserEntry.Type | typeof AssistantEntry.Type | typeof ToolEntry.Type

/** @experimental */
export const ChatEntry: Schema.Schema<ChatEntry> = Schema.Union([UserEntry, AssistantEntry, ToolEntry])

/** @experimental */
export const Idle: CallableTaggedStruct<"Idle", {}> = m("Idle")

/** @experimental */
export const Running: CallableTaggedStruct<"Running", typeof RunningFields> = m("Running", RunningFields)

/** @experimental */
export const AwaitingApproval: CallableTaggedStruct<"AwaitingApproval", typeof AwaitingApprovalFields> = m(
  "AwaitingApproval",
  AwaitingApprovalFields,
)

/** @experimental */
export const Failed: CallableTaggedStruct<"Failed", { message: typeof Schema.String }> = m("Failed", {
  message: Schema.String,
})

/** @experimental */
export type RunState = typeof Idle.Type | typeof Running.Type | typeof AwaitingApproval.Type | typeof Failed.Type

/** @experimental */
export const RunState: Schema.Schema<RunState> = Schema.Union([Idle, Running, AwaitingApproval, Failed])

/** @experimental */
export interface Model {
  readonly sessionId: string | null
  readonly connection: typeof ModelConnection.Type
  readonly lastSeq: number
  readonly run: RunState
  readonly entries: ReadonlyArray<ChatEntry>
  readonly streaming: typeof ModelStreaming.Type | null
  readonly draft: string
}

/** @experimental */
export const Model: Schema.Schema<Model> = Schema.Struct({
  sessionId: Schema.NullOr(Schema.String),
  connection: ModelConnection,
  lastSeq: Schema.Finite,
  run: RunState,
  entries: Schema.Array(ChatEntry),
  streaming: Schema.NullOr(ModelStreaming),
  draft: Schema.String,
})

/** @experimental */
export const ReceivedAgent: CallableTaggedStruct<"ReceivedAgent", typeof ReceivedAgentFields> = m(
  "ReceivedAgent",
  ReceivedAgentFields,
)

/** @experimental */
export const OpenedSession: CallableTaggedStruct<"OpenedSession", typeof OpenedSessionFields> = m(
  "OpenedSession",
  OpenedSessionFields,
)

/** @experimental */
export const ChangedDraft: CallableTaggedStruct<"ChangedDraft", typeof UserEntryFields> = m(
  "ChangedDraft",
  UserEntryFields,
)

/** @experimental */
export const SubmittedMessage: CallableTaggedStruct<"SubmittedMessage", {}> = m("SubmittedMessage")

/** @experimental */
export const ClickedCancel: CallableTaggedStruct<"ClickedCancel", {}> = m("ClickedCancel")

/** @experimental */
export const ClickedApprove: CallableTaggedStruct<"ClickedApprove", {}> = m("ClickedApprove")

/** @experimental */
export const ClickedDeny: CallableTaggedStruct<"ClickedDeny", typeof ClickedDenyFields> = m(
  "ClickedDeny",
  ClickedDenyFields,
)

/** @experimental */
export const SentUserMessage: CallableTaggedStruct<"SentUserMessage", {}> = m("SentUserMessage")

/** @experimental */
export const ResolvedApproval: CallableTaggedStruct<"ResolvedApproval", {}> = m("ResolvedApproval")

/** @experimental */
export const CancelledRun: CallableTaggedStruct<"CancelledRun", {}> = m("CancelledRun")

/** @experimental */
export const FailedAgentCommand: CallableTaggedStruct<
  "FailedAgentCommand",
  {
    operation: typeof CommandOperation
    error: typeof AgentCommandError
    reason: typeof Schema.String
  }
> = m("FailedAgentCommand", {
  operation: CommandOperation,
  error: AgentCommandError,
  reason: Schema.String,
})

/** @experimental */
export type Message =
  | typeof ReceivedAgent.Type
  | typeof OpenedSession.Type
  | typeof ChangedDraft.Type
  | typeof SubmittedMessage.Type
  | typeof ClickedCancel.Type
  | typeof ClickedApprove.Type
  | typeof ClickedDeny.Type
  | typeof SentUserMessage.Type
  | typeof ResolvedApproval.Type
  | typeof CancelledRun.Type
  | typeof FailedAgentCommand.Type

/** @experimental */
export const Message: Schema.Schema<Message> = Schema.Union([
  ReceivedAgent,
  OpenedSession,
  ChangedDraft,
  SubmittedMessage,
  ClickedCancel,
  ClickedApprove,
  ClickedDeny,
  SentUserMessage,
  ResolvedApproval,
  CancelledRun,
  FailedAgentCommand,
])

/** @experimental */
export const RunCompleted: CallableTaggedStruct<"RunCompleted", typeof RunCompletedFields> = m(
  "RunCompleted",
  RunCompletedFields,
)

/** @experimental */
export const ApprovalRequired: CallableTaggedStruct<"ApprovalRequired", {}> = m("ApprovalRequired")

/** @experimental */
export const RunFailed: CallableTaggedStruct<"RunFailed", { message: typeof Schema.String }> = m("RunFailed", {
  message: Schema.String,
})

/** @experimental */
export type OutMessage = typeof RunCompleted.Type | typeof ApprovalRequired.Type | typeof RunFailed.Type

/** @experimental */
export const OutMessage: Schema.Schema<OutMessage> = Schema.Union([RunCompleted, ApprovalRequired, RunFailed])

/** @experimental */
export const MessageAlign = Schema.Literals(["start", "end"])

/** @experimental */
export type MessageAlign = typeof MessageAlign.Type

/** @experimental */
export const PromptInputStatus = Schema.Literals(["idle", "submitted", "streaming", "error"])

/** @experimental */
export type PromptInputStatus = typeof PromptInputStatus.Type

/** @experimental */
export const ToolStatus = Schema.Literals(["input-streaming", "input-available", "output-available", "output-error"])

/** @experimental */
export type ToolStatus = typeof ToolStatus.Type

/** @experimental */
export const UserConversationItem: CallableTaggedStruct<
  "UserConversationItem",
  { key: typeof Schema.String; align: typeof MessageAlign; entry: typeof UserEntry }
> = m("UserConversationItem", { key: Schema.String, align: MessageAlign, entry: UserEntry })

/** @experimental */
export const AssistantConversationItem: CallableTaggedStruct<
  "AssistantConversationItem",
  { key: typeof Schema.String; align: typeof MessageAlign; entry: typeof AssistantEntry }
> = m("AssistantConversationItem", { key: Schema.String, align: MessageAlign, entry: AssistantEntry })

/** @experimental */
export const ToolConversationItem: CallableTaggedStruct<
  "ToolConversationItem",
  {
    key: typeof Schema.String
    align: typeof MessageAlign
    entry: typeof ToolEntry
    status: typeof ToolStatus
    input: typeof Schema.String
  }
> = m("ToolConversationItem", {
  key: Schema.String,
  align: MessageAlign,
  entry: ToolEntry,
  status: ToolStatus,
  input: Schema.String,
})

/** @experimental */
export const StreamingConversationItem: CallableTaggedStruct<
  "StreamingConversationItem",
  {
    key: typeof Schema.String
    align: typeof MessageAlign
    text: typeof Schema.String
    reasoning: typeof Schema.String
    isStreaming: typeof Schema.Boolean
  }
> = m("StreamingConversationItem", {
  key: Schema.String,
  align: MessageAlign,
  text: Schema.String,
  reasoning: Schema.String,
  isStreaming: Schema.Boolean,
})

/** @experimental */
export const WaitingConversationItem: CallableTaggedStruct<
  "WaitingConversationItem",
  { key: typeof Schema.String; align: typeof MessageAlign }
> = m("WaitingConversationItem", { key: Schema.String, align: MessageAlign })

/** @experimental */
export const ApprovalConversationItem: CallableTaggedStruct<
  "ApprovalConversationItem",
  {
    key: typeof Schema.String
    align: typeof MessageAlign
    token: typeof Schema.String
    toolName: typeof Schema.String
    params: typeof Schema.Unknown
  }
> = m("ApprovalConversationItem", {
  key: Schema.String,
  align: MessageAlign,
  token: Schema.String,
  toolName: Schema.String,
  params: Schema.Unknown,
})

/** @experimental */
export const FailureConversationItem: CallableTaggedStruct<
  "FailureConversationItem",
  { key: typeof Schema.String; align: typeof MessageAlign; message: typeof Schema.String }
> = m("FailureConversationItem", { key: Schema.String, align: MessageAlign, message: Schema.String })

/** @experimental */
export type ConversationItem =
  | typeof UserConversationItem.Type
  | typeof AssistantConversationItem.Type
  | typeof ToolConversationItem.Type
  | typeof StreamingConversationItem.Type
  | typeof WaitingConversationItem.Type
  | typeof ApprovalConversationItem.Type
  | typeof FailureConversationItem.Type

/** @experimental */
export const ConversationItem: Schema.Schema<ConversationItem> = Schema.Union([
  UserConversationItem,
  AssistantConversationItem,
  ToolConversationItem,
  StreamingConversationItem,
  WaitingConversationItem,
  ApprovalConversationItem,
  FailureConversationItem,
])

/** @experimental */
export type ChatCommand = Command<Message, AgentCommandError, AgentConnection>

/** @experimental */
export const initialModel = (sessionId: string | null = null): Model => ({
  sessionId,
  connection: "disconnected",
  lastSeq: -1,
  run: Idle(),
  entries: [],
  streaming: null,
  draft: "",
})

type FailedAgentCommandMessage = typeof FailedAgentCommand.Type

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

/** @experimental */
export const SendUserMessage = define(
  "SendUserMessage",
  { sessionId: Schema.String, text: Schema.String },
  SentUserMessage,
  FailedAgentCommand,
)(({ sessionId, text }) =>
  AgentConnection.use((connection) =>
    catchCommandFailure(
      "send",
      connection.send({ _tag: "SendMessage", sessionId, prompt: text }).pipe(Effect.as(SentUserMessage())),
    ),
  ),
)

/** @experimental */
export const ResolveApproval = define(
  "ResolveApproval",
  {
    sessionId: Schema.String,
    token: Schema.String,
    approved: Schema.Boolean,
    reason: Schema.NullOr(Schema.String),
  },
  ResolvedApproval,
  FailedAgentCommand,
)(({ sessionId, token, approved, reason }) => {
  const decision: Wire.ClientApproval = approved
    ? { _tag: "Approved" }
    : reason === null
      ? { _tag: "Denied" }
      : { _tag: "Denied", reason }
  return AgentConnection.use((connection) =>
    catchCommandFailure(
      "resolveApproval",
      connection.send({ _tag: "ResolveApproval", sessionId, token, decision }).pipe(Effect.as(ResolvedApproval())),
    ),
  )
})

/** @experimental */
export const CancelRun = define(
  "CancelRun",
  { sessionId: Schema.String },
  CancelledRun,
  FailedAgentCommand,
)(({ sessionId }) =>
  AgentConnection.use((connection) =>
    catchCommandFailure("cancel", connection.send({ _tag: "Cancel", sessionId }).pipe(Effect.as(CancelledRun()))),
  ),
)

interface StreamingState {
  readonly turn: number
  readonly text: string
  readonly reasoning: string
}

interface ToolCallLike {
  readonly type: "tool-call"
  readonly id: string
  readonly name: string
  readonly params: unknown
}

interface ToolResultLike {
  readonly type: "tool-result"
  readonly id: string
  readonly name: string
  readonly result: unknown
  readonly isFailure: boolean
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null

const isToolCall = (value: unknown): value is ToolCallLike =>
  isRecord(value) &&
  value.type === "tool-call" &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  "params" in value

const isToolResult = (value: unknown): value is ToolResultLike =>
  isRecord(value) &&
  value.type === "tool-result" &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  "result" in value &&
  typeof value.isFailure === "boolean"

const streamingFor = (model: Model, turn: number): StreamingState =>
  model.streaming ?? { turn, text: "", reasoning: "" }

const appendStreaming = (model: Model, turn: number, field: "text" | "reasoning", delta: string): Model => {
  const streaming = streamingFor(model, turn)
  return { ...model, streaming: { ...streaming, [field]: streaming[field] + delta } }
}

const flushStreaming = (model: Model): Model => {
  if (model.streaming === null) return model
  const { text, reasoning } = model.streaming
  const entry =
    text.length === 0 && reasoning.length === 0 ? [] : [AssistantEntry({ text, reasoning: reasoning || null })]
  return { ...model, entries: [...model.entries, ...entry], streaming: null }
}

const upsertToolCall = (
  entries: ReadonlyArray<ChatEntry>,
  call: ToolCallLike,
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

const resolveTool = (entries: ReadonlyArray<ChatEntry>, result: ToolResultLike): ReadonlyArray<ChatEntry> => {
  const withCall = upsertToolCall(entries, { type: "tool-call", id: result.id, name: result.name, params: undefined })
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

const failureMessage = (failure: Wire.RunFailure): string => {
  switch (failure._tag) {
    case "@batonfx/core/AgentError":
      return failure.message
    case "@batonfx/core/TurnPolicyError":
      return failure.message
    case "@batonfx/core/TurnPolicyStopped":
      return failure.reason._tag === "Policy" ? failure.reason.detail : failure.reason._tag
    case "@batonfx/core/MiddlewareViolation":
      return failure.detail
    case "@batonfx/core/TurnLimitExceeded":
      return `Turn limit exceeded at turn ${failure.turn}`
  }
}

const applyPart = (model: Model, turn: number, part: unknown): Model => {
  if (!isRecord(part) || typeof part.type !== "string") return model
  switch (part.type) {
    case "text-delta":
      return typeof part.delta === "string" ? appendStreaming(model, turn, "text", part.delta) : model
    case "reasoning-delta":
      return typeof part.delta === "string" ? appendStreaming(model, turn, "reasoning", part.delta) : model
    case "tool-call":
      return isToolCall(part) ? { ...model, entries: upsertToolCall(model.entries, part) } : model
    case "tool-result":
      return isToolResult(part) ? { ...model, entries: resolveTool(model.entries, part) } : model
    default:
      return model
  }
}

type Suspension = Extract<Wire.ServerFrameType, { readonly _tag: "Suspended" }>["suspension"]

const applySuspension = (model: Model, suspension: Suspension) => {
  if (suspension.reason === "approval") {
    return [
      {
        ...model,
        run: AwaitingApproval({
          token: suspension.token,
          toolName: suspension.tool_name,
          params: suspension.tool_params,
        }),
      },
      Option.some(ApprovalRequired()),
    ] as const
  }
  const message = `Tool wait suspension for ${suspension.tool_name} is not resolvable by the FoldKit adapter`
  return [{ ...model, run: Failed({ message }) }, Option.some(RunFailed({ message }))] as const
}

const applyStatus = (model: Model, status: Wire.SessionStatus): readonly [Model, Option.Option<OutMessage>] => {
  switch (status._tag) {
    case "Idle":
      return [{ ...model, run: Idle() }, Option.none()]
    case "Running":
      return [{ ...model, run: Running({ turn: status.turn }) }, Option.none()]
    case "Suspended":
      return applySuspension(model, status.suspension)
    case "Failed": {
      const message = failureMessage(status.error)
      return [{ ...model, run: Failed({ message }) }, Option.some(RunFailed({ message }))]
    }
  }
}

const applyEvent = (model: Model, event: Wire.EventType): readonly [Model, Option.Option<OutMessage>] => {
  switch (event._tag) {
    case "TurnStarted":
      return [
        { ...model, run: Running({ turn: event.turn }), streaming: { turn: event.turn, text: "", reasoning: "" } },
        Option.none(),
      ]
    case "ModelPart":
      return [applyPart(model, event.turn, event.part), Option.none()]
    case "ToolExecutionStarted":
      return [{ ...model, entries: upsertToolCall(model.entries, event.call, "executing") }, Option.none()]
    case "ApprovalRequested":
      return [{ ...model, entries: upsertToolCall(model.entries, event.call) }, Option.none()]
    case "ToolProgress":
      return event.message === undefined
        ? [model, Option.none()]
        : [{ ...model, entries: addProgress(model.entries, event.toolCallId, event.message) }, Option.none()]
    case "ToolExecutionCompleted":
      return [
        { ...model, entries: resolveTool(upsertToolCall(model.entries, event.call, "executing"), event.result) },
        Option.none(),
      ]
    case "SteeringDrained":
      return [model, Option.none()]
    case "TurnCompleted":
      return [flushStreaming(model), Option.none()]
    case "StructuredOutput":
      return [model, Option.none()]
    case "Completed": {
      const flushed = flushStreaming(model)
      return [{ ...flushed, run: Idle() }, Option.some(RunCompleted({ text: event.text }))]
    }
  }
}

const textFromContent = (content: ReadonlyArray<unknown>): string =>
  content
    .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => (part as { readonly text: string }).text)
    .join("")

const reasoningFromContent = (content: ReadonlyArray<unknown>): string | null => {
  const reasoning = content
    .filter((part) => isRecord(part) && part.type === "reasoning" && typeof part.text === "string")
    .map((part) => (part as { readonly text: string }).text)
    .join("")
  return reasoning.length === 0 ? null : reasoning
}

const projectPrompt = (prompt: Prompt.Prompt): ReadonlyArray<ChatEntry> => {
  let entries: ReadonlyArray<ChatEntry> = []
  for (const message of prompt.content) {
    if (message.role === "user") {
      const text = textFromContent(message.content)
      if (text.length > 0) entries = entries.concat(UserEntry({ text }))
    } else if (message.role === "assistant") {
      const text = textFromContent(message.content)
      const reasoning = reasoningFromContent(message.content)
      if (text.length > 0 || reasoning !== null) entries = entries.concat(AssistantEntry({ text, reasoning }))
      for (const part of message.content) {
        if (isToolCall(part)) entries = upsertToolCall(entries, part)
        if (isToolResult(part)) entries = resolveTool(entries, part)
      }
    } else if (message.role === "tool") {
      for (const part of message.content) {
        if (isToolResult(part)) entries = resolveTool(entries, part)
      }
    }
  }
  return entries
}

const applyFrame = (model: Model, frame: Wire.LooseServerFrameType): readonly [Model, Option.Option<OutMessage>] => {
  if (frame._tag === "Snapshot") {
    return [{ ...model, lastSeq: frame.seq, entries: projectPrompt(frame.transcript), streaming: null }, Option.none()]
  }
  if (frame.seq <= model.lastSeq) return [model, Option.none()]
  const withSeq = { ...model, lastSeq: frame.seq }
  switch (frame._tag) {
    case "Event":
      return applyEvent(withSeq, frame.event)
    case "Suspended":
      return applySuspension(withSeq, frame.suspension)
    case "Failed": {
      const message = failureMessage(frame.error)
      return [{ ...withSeq, run: Failed({ message }) }, Option.some(RunFailed({ message }))]
    }
    case "Ended":
      return [withSeq, Option.none()]
    case "SessionStatus":
      return applyStatus(withSeq, frame.status)
  }
}

const jsonText = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined"
  } catch {
    return String(value)
  }
}

/** @experimental */
export const promptInputStatusOf = (run: RunState): PromptInputStatus => {
  switch (run._tag) {
    case "Idle":
      return "idle"
    case "Running":
      return "streaming"
    case "AwaitingApproval":
      return "submitted"
    case "Failed":
      return "error"
  }
}

/** @experimental */
export const toolStatusOf = (entry: typeof ToolEntry.Type): ToolStatus => {
  switch (entry.outcome._tag) {
    case "Pending":
      return entry.phase === "executing" ? "input-available" : "input-streaming"
    case "Completed":
      return entry.outcome.isFailure ? "output-error" : "output-available"
  }
}

const conversationItemFor = (entry: ChatEntry, index: number): ConversationItem => {
  switch (entry._tag) {
    case "UserEntry":
      return UserConversationItem({ key: `entry-${index}-user`, align: "end", entry })
    case "AssistantEntry":
      return AssistantConversationItem({ key: `entry-${index}-assistant`, align: "start", entry })
    case "ToolEntry":
      return ToolConversationItem({
        key: `tool-${entry.callId}`,
        align: "start",
        entry,
        status: toolStatusOf(entry),
        input: jsonText(entry.params),
      })
  }
}

/** @experimental */
export const conversationItems = (model: Model): ReadonlyArray<ConversationItem> => {
  const entries = model.entries.map(conversationItemFor)
  const streaming =
    model.streaming === null
      ? []
      : [
          StreamingConversationItem({
            key: "streaming-assistant",
            align: "start",
            text: model.streaming.text,
            reasoning: model.streaming.reasoning,
            isStreaming: true,
          }),
        ]
  const waiting =
    model.run._tag === "Running" && model.streaming === null
      ? [WaitingConversationItem({ key: "waiting-assistant", align: "start" })]
      : []
  const approval =
    model.run._tag === "AwaitingApproval"
      ? [
          ApprovalConversationItem({
            key: `approval-${model.run.token}`,
            align: "start",
            token: model.run.token,
            toolName: model.run.toolName,
            params: model.run.params,
          }),
        ]
      : []
  const failure =
    model.run._tag === "Failed"
      ? [FailureConversationItem({ key: "run-failure", align: "start", message: model.run.message })]
      : []
  return [...entries, ...streaming, ...waiting, ...approval, ...failure]
}

const isServerFrame = (incoming: Incoming): incoming is Wire.LooseServerFrameType =>
  incoming._tag === "Event" ||
  incoming._tag === "Suspended" ||
  incoming._tag === "Failed" ||
  incoming._tag === "Ended" ||
  incoming._tag === "Snapshot" ||
  incoming._tag === "SessionStatus"

/** @experimental */
export const update: {
  (message: Message): (model: Model) => readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<OutMessage>]
  (model: Model, message: Message): readonly [Model, ReadonlyArray<ChatCommand>, Option.Option<OutMessage>]
} = dual(2, (model: Model, message: Message) => {
  switch (message._tag) {
    case "ReceivedAgent":
      if (isServerFrame(message.incoming)) {
        const [next, out] = applyFrame(model, message.incoming)
        return [next, [], out]
      }
      switch (message.incoming._tag) {
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
            { ...model, connection: "disconnected", run: Failed({ message: message.incoming.reason }) },
            [],
            Option.some(RunFailed({ message: message.incoming.reason })),
          ]
      }
    case "OpenedSession":
      return [
        {
          ...model,
          sessionId: message.sessionId,
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
      return [{ ...model, draft: message.text }, [], Option.none()]
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
                reason: message.reason,
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
      return [{ ...model, run: Failed({ message: message.reason }) }, [], Option.none()]
    case "SentUserMessage":
    case "ResolvedApproval":
    case "CancelledRun":
      return [model, [], Option.none()]
  }
})

/** @experimental */
export const subscriptions = make<Model, Message, AgentConnection>()((entry) => ({
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
