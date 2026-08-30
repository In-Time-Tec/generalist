import { Cause, Effect, Result, Schema } from "effect"
import { define, type Command } from "foldkit/command"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { AgentCommandError, AgentConnection, CommandOperation, Incoming, SendFailed } from "./connection.js"
import type { ClientApproval } from "./connection-command.js"

type EmptyFields = Record<never, never>

const Pending: CallableTaggedStruct<"Pending", EmptyFields> = m("Pending")
const CompletedFields = { isFailure: Schema.Boolean, result: Schema.Unknown }
const Completed: CallableTaggedStruct<"Completed", typeof CompletedFields> = m("Completed", CompletedFields)

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
const ModelConnection = Schema.Literals(["disconnected", "connecting", "open", "reconnecting"])

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
export const Idle: CallableTaggedStruct<"Idle", EmptyFields> = m("Idle")

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
  readonly draft: string
}

/** @experimental */
export const Model: Schema.Schema<Model> = Schema.Struct({
  sessionId: Schema.NullOr(Schema.String),
  connection: ModelConnection,
  lastSeq: Schema.Finite,
  run: RunState,
  entries: Schema.Array(ChatEntry),
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
export const SubmittedMessage: CallableTaggedStruct<"SubmittedMessage", EmptyFields> = m("SubmittedMessage")

/** @experimental */
export const ClickedCancel: CallableTaggedStruct<"ClickedCancel", EmptyFields> = m("ClickedCancel")

/** @experimental */
export const ClickedApprove: CallableTaggedStruct<"ClickedApprove", EmptyFields> = m("ClickedApprove")

/** @experimental */
export const ClickedDeny: CallableTaggedStruct<"ClickedDeny", typeof ClickedDenyFields> = m(
  "ClickedDeny",
  ClickedDenyFields,
)

/** @experimental */
export const SentUserMessage: CallableTaggedStruct<"SentUserMessage", EmptyFields> = m("SentUserMessage")

/** @experimental */
export const ResolvedApproval: CallableTaggedStruct<"ResolvedApproval", EmptyFields> = m("ResolvedApproval")

/** @experimental */
export const CancelledRun: CallableTaggedStruct<"CancelledRun", EmptyFields> = m("CancelledRun")

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
export type Action =
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
export const Action: Schema.Schema<Action> = Schema.Union([
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
export const ApprovalRequired: CallableTaggedStruct<"ApprovalRequired", EmptyFields> = m("ApprovalRequired")

/** @experimental */
export const RunFailed: CallableTaggedStruct<"RunFailed", { message: typeof Schema.String }> = m("RunFailed", {
  message: Schema.String,
})

/** @experimental */
export type Output = typeof RunCompleted.Type | typeof ApprovalRequired.Type | typeof RunFailed.Type

/** @experimental */
export const Output: Schema.Schema<Output> = Schema.Union([RunCompleted, ApprovalRequired, RunFailed])

/** @experimental */
export const MessageAlign = Schema.Literals(["start", "end"])

/** @experimental */
export type MessageAlign = typeof MessageAlign.Type

/** @experimental */
export const PromptInputStatus = Schema.Literals(["idle", "submitted", "streaming", "error"])

/** @experimental */
export type PromptInputStatus = typeof PromptInputStatus.Type

/** @experimental */
export const ToolStatus = Schema.Literals(["input-available", "output-available", "output-error"])

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
  | typeof WaitingConversationItem.Type
  | typeof ApprovalConversationItem.Type
  | typeof FailureConversationItem.Type

/** @experimental */
export const ConversationItem: Schema.Schema<ConversationItem> = Schema.Union([
  UserConversationItem,
  AssistantConversationItem,
  ToolConversationItem,
  WaitingConversationItem,
  ApprovalConversationItem,
  FailureConversationItem,
])

/** @experimental */
export type ChatCommand = Command<Action, AgentCommandError, AgentConnection>

/** @experimental */
export const initialModel = (sessionId: string | null = null): Model => ({
  sessionId,
  connection: "disconnected",
  lastSeq: -1,
  run: Idle(),
  entries: [],
  draft: "",
})

const catchCommandFailure = <A>(
  operation: CommandOperation,
  effect: Effect.Effect<A, AgentCommandError, AgentConnection>,
) =>
  effect.pipe(
    Effect.catchCause((cause) => {
      const unexpected: Array<Cause.Reason<never>> = []
      for (const reason of cause.reasons) {
        if (Cause.isDieReason(reason) || Cause.isInterruptReason(reason)) unexpected.push(reason)
      }
      if (unexpected.length > 0) return Effect.failCause(Cause.fromReasons(unexpected))
      return Result.match(Cause.findError(cause), {
        onFailure: Effect.failCause,
        onSuccess: (error) =>
          Effect.succeed(
            FailedAgentCommand({
              operation,
              error,
              reason: Schema.is(SendFailed)(error) ? error.reason : error.message,
            }),
          ),
      })
    }),
  )

/** @experimental */
export const SendUserMessage = define("SendUserMessage", {
  args: { sessionId: Schema.String, text: Schema.String },
  messages: [SentUserMessage, FailedAgentCommand],
  execute: ({ sessionId, text }) =>
    AgentConnection.use((connection) =>
      catchCommandFailure(
        "send",
        connection.send({ _tag: "SendMessage", sessionId, prompt: text }).pipe(Effect.as(SentUserMessage())),
      ),
    ),
})

/** @experimental */
export const ResolveApproval = define("ResolveApproval", {
  args: {
    sessionId: Schema.String,
    token: Schema.String,
    approved: Schema.Boolean,
    reason: Schema.NullOr(Schema.String),
  },
  messages: [ResolvedApproval, FailedAgentCommand],
  execute: ({ sessionId, token, approved, reason }) => {
    let decision: ClientApproval
    if (approved) decision = { _tag: "Approved" }
    else if (reason === null) decision = { _tag: "Denied" }
    else decision = { _tag: "Denied", reason }
    return AgentConnection.use((connection) =>
      catchCommandFailure(
        "resolveApproval",
        connection.send({ _tag: "ResolveApproval", sessionId, token, decision }).pipe(Effect.as(ResolvedApproval())),
      ),
    )
  },
})

/** @experimental */
export const CancelRun = define("CancelRun", {
  args: { sessionId: Schema.String },
  messages: [CancelledRun, FailedAgentCommand],
  execute: ({ sessionId }) =>
    AgentConnection.use((connection) =>
      catchCommandFailure("cancel", connection.send({ _tag: "Cancel", sessionId }).pipe(Effect.as(CancelledRun()))),
    ),
})

const jsonText = (value: typeof Schema.Unknown.Type): string => {
  const decoded = Schema.decodeUnknownSync(Schema.Unknown)(value)
  try {
    return JSON.stringify(decoded, null, 2) ?? "undefined"
  } catch {
    return String(decoded)
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
      return "input-available"
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
  const waiting =
    model.run._tag === "Running" ? [WaitingConversationItem({ key: "waiting-assistant", align: "start" })] : []
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
  return [...entries, ...waiting, ...approval, ...failure]
}
