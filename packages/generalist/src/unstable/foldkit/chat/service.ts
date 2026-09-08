import { Cause, Effect, Result, Schema } from "effect"
import { define, type Command } from "foldkit/command"
import { m } from "foldkit/message"
import type { CallableTaggedStruct } from "foldkit/schema"
import { AgentCommandError, CommandOperation, Connection, Incoming, SendFailed } from "./connection.js"
import type { ClientApproval } from "./connection-command.js"
import { Conversation } from "../../../runtime/session/conversation.js"

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
const ReceivedConnectionFields = { event: Incoming }
const ModelConnection = Schema.Literals(["disconnected", "connecting", "open", "reconnecting"])

/** Maximum provisional text and reasoning retained by the client reducer. @experimental */
export const MaxPreviewStateCharacters = 65_536

/** One bounded provisional model response, kept separate from committed conversation entries. @experimental */
export const ModelPreview = Schema.Struct({
  runId: Schema.String,
  attemptFence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  text: Schema.String.check(Schema.isMaxLength(MaxPreviewStateCharacters)),
  reasoning: Schema.String.check(Schema.isMaxLength(MaxPreviewStateCharacters)),
})
export type ModelPreview = typeof ModelPreview.Type

/** Monotonic provisional authority retained even when visible preview text is cleared. @experimental */
export const PreviewAuthority = Schema.Struct({
  runId: Schema.String,
  attemptFence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  modelCallId: Schema.NullOr(Schema.String),
  modelAttemptId: Schema.NullOr(Schema.String),
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)),
  tombstoned: Schema.Boolean,
})
export type PreviewAuthority = typeof PreviewAuthority.Type

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
  readonly connectionEpoch: number
  readonly run: RunState
  readonly entries: ReadonlyArray<ChatEntry>
  readonly conversation: Conversation
  readonly preview: ModelPreview | null
  readonly previewAuthority: PreviewAuthority | null
  readonly draft: string
}

/** @experimental */
export const Model: Schema.Schema<Model> = Schema.Struct({
  sessionId: Schema.NullOr(Schema.String),
  connection: ModelConnection,
  lastSeq: Schema.Finite,
  connectionEpoch: Schema.Int,
  run: RunState,
  entries: Schema.Array(ChatEntry),
  conversation: Conversation,
  preview: Schema.NullOr(ModelPreview),
  previewAuthority: Schema.NullOr(PreviewAuthority),
  draft: Schema.String,
})

/** @experimental */
export const ReceivedConnection: CallableTaggedStruct<"ReceivedConnection", typeof ReceivedConnectionFields> = m(
  "ReceivedConnection",
  ReceivedConnectionFields,
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
  | typeof ReceivedConnection.Type
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
  ReceivedConnection,
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

/** A provisional assistant item that is never part of committed conversation history. @experimental */
export const PreviewConversationItem: CallableTaggedStruct<
  "PreviewConversationItem",
  {
    key: typeof Schema.String
    align: typeof MessageAlign
    entry: typeof AssistantEntry
    attemptFence: typeof Schema.Int
    sequence: typeof Schema.Int
  }
> = m("PreviewConversationItem", {
  key: Schema.String,
  align: MessageAlign,
  entry: AssistantEntry,
  attemptFence: Schema.Int,
  sequence: Schema.Int,
})

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
  | typeof PreviewConversationItem.Type
  | typeof ToolConversationItem.Type
  | typeof WaitingConversationItem.Type
  | typeof ApprovalConversationItem.Type
  | typeof FailureConversationItem.Type

/** @experimental */
export const ConversationItem: Schema.Schema<ConversationItem> = Schema.Union([
  UserConversationItem,
  AssistantConversationItem,
  PreviewConversationItem,
  ToolConversationItem,
  WaitingConversationItem,
  ApprovalConversationItem,
  FailureConversationItem,
])

/** @experimental */
export type ChatCommand = Command<Action, AgentCommandError, Connection>

/** @experimental */
export const initialModel = (sessionId: string | null = null): Model => ({
  sessionId,
  connection: "disconnected",
  lastSeq: -1,
  connectionEpoch: -1,
  run: Idle(),
  entries: [],
  conversation: { leafId: null, entries: [] },
  preview: null,
  previewAuthority: null,
  draft: "",
})

const catchCommandFailure = <A>(operation: CommandOperation, effect: Effect.Effect<A, AgentCommandError, Connection>) =>
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
    Connection.use((connection) =>
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
    return Connection.use((connection) =>
      catchCommandFailure(
        "resolveApproval",
        connection.send({ _tag: "ResolveApproval", sessionId, token, decision }).pipe(Effect.as(ResolvedApproval())),
      ),
    )
  },
})

/** @experimental */
export const CancelRun = define("CancelRun", {
  args: { sessionId: Schema.String, commandId: Schema.String },
  messages: [CancelledRun, FailedAgentCommand],
  execute: ({ sessionId, commandId }) =>
    Connection.use((connection) =>
      catchCommandFailure(
        "cancel",
        connection.send({ _tag: "Cancel", sessionId, commandId }).pipe(Effect.as(CancelledRun())),
      ),
    ),
})

export { conversationItems, promptInputStatusOf, toolStatusOf } from "./view.js"
