import {
  ToolPendingPhase as Chat_ToolPendingPhase,
  ToolOutcome as Chat_ToolOutcome,
  UserEntry as Chat_UserEntry,
  AssistantEntry as Chat_AssistantEntry,
  ToolEntry as Chat_ToolEntry,
  ChatEntry as Chat_ChatEntry,
  Idle as Chat_Idle,
  Running as Chat_Running,
  AwaitingApproval as Chat_AwaitingApproval,
  Failed as Chat_Failed,
  RunState as Chat_RunState,
  Model as Chat_Model,
  ReceivedAgent as Chat_ReceivedAgent,
  OpenedSession as Chat_OpenedSession,
  ChangedDraft as Chat_ChangedDraft,
  SubmittedMessage as Chat_SubmittedMessage,
  ClickedCancel as Chat_ClickedCancel,
  ClickedApprove as Chat_ClickedApprove,
  ClickedDeny as Chat_ClickedDeny,
  SentUserMessage as Chat_SentUserMessage,
  ResolvedApproval as Chat_ResolvedApproval,
  CancelledRun as Chat_CancelledRun,
  FailedAgentCommand as Chat_FailedAgentCommand,
  Action as Chat_Action,
  RunCompleted as Chat_RunCompleted,
  ApprovalRequired as Chat_ApprovalRequired,
  RunFailed as Chat_RunFailed,
  Output as Chat_Output,
  MessageAlign as Chat_MessageAlign,
  PromptInputStatus as Chat_PromptInputStatus,
  ToolStatus as Chat_ToolStatus,
  UserConversationItem as Chat_UserConversationItem,
  AssistantConversationItem as Chat_AssistantConversationItem,
  ToolConversationItem as Chat_ToolConversationItem,
  WaitingConversationItem as Chat_WaitingConversationItem,
  ApprovalConversationItem as Chat_ApprovalConversationItem,
  FailureConversationItem as Chat_FailureConversationItem,
  ConversationItem as Chat_ConversationItem,
  initialModel as Chat_initialModel,
  SendUserMessage as Chat_SendUserMessage,
  ResolveApproval as Chat_ResolveApproval,
  CancelRun as Chat_CancelRun,
  promptInputStatusOf as Chat_promptInputStatusOf,
  toolStatusOf as Chat_toolStatusOf,
  conversationItems as Chat_conversationItems,
} from "./chat/service.js"
import { subscriptions as Chat_subscriptions, update as Chat_update } from "./chat/update-logic.js"
export const Chat = {
  ToolPendingPhase: Chat_ToolPendingPhase,
  ToolOutcome: Chat_ToolOutcome,
  UserEntry: Chat_UserEntry,
  AssistantEntry: Chat_AssistantEntry,
  ToolEntry: Chat_ToolEntry,
  ChatEntry: Chat_ChatEntry,
  Idle: Chat_Idle,
  Running: Chat_Running,
  AwaitingApproval: Chat_AwaitingApproval,
  Failed: Chat_Failed,
  RunState: Chat_RunState,
  Model: Chat_Model,
  ReceivedAgent: Chat_ReceivedAgent,
  OpenedSession: Chat_OpenedSession,
  ChangedDraft: Chat_ChangedDraft,
  SubmittedMessage: Chat_SubmittedMessage,
  ClickedCancel: Chat_ClickedCancel,
  ClickedApprove: Chat_ClickedApprove,
  ClickedDeny: Chat_ClickedDeny,
  SentUserMessage: Chat_SentUserMessage,
  ResolvedApproval: Chat_ResolvedApproval,
  CancelledRun: Chat_CancelledRun,
  FailedAgentCommand: Chat_FailedAgentCommand,
  Action: Chat_Action,
  RunCompleted: Chat_RunCompleted,
  ApprovalRequired: Chat_ApprovalRequired,
  RunFailed: Chat_RunFailed,
  Output: Chat_Output,
  MessageAlign: Chat_MessageAlign,
  PromptInputStatus: Chat_PromptInputStatus,
  ToolStatus: Chat_ToolStatus,
  UserConversationItem: Chat_UserConversationItem,
  AssistantConversationItem: Chat_AssistantConversationItem,
  ToolConversationItem: Chat_ToolConversationItem,
  WaitingConversationItem: Chat_WaitingConversationItem,
  ApprovalConversationItem: Chat_ApprovalConversationItem,
  FailureConversationItem: Chat_FailureConversationItem,
  ConversationItem: Chat_ConversationItem,
  initialModel: Chat_initialModel,
  SendUserMessage: Chat_SendUserMessage,
  ResolveApproval: Chat_ResolveApproval,
  CancelRun: Chat_CancelRun,
  promptInputStatusOf: Chat_promptInputStatusOf,
  toolStatusOf: Chat_toolStatusOf,
  conversationItems: Chat_conversationItems,
  update: Chat_update,
  subscriptions: Chat_subscriptions,
}
export namespace Chat {
  export type ToolPendingPhase = import("./chat/service.js").ToolPendingPhase
  export type ToolOutcome = import("./chat/service.js").ToolOutcome
  export type UserEntry = typeof import("./chat/service.js").UserEntry
  export type AssistantEntry = typeof import("./chat/service.js").AssistantEntry
  export type ToolEntry = typeof import("./chat/service.js").ToolEntry
  export type ChatEntry = import("./chat/service.js").ChatEntry
  export type Idle = typeof import("./chat/service.js").Idle
  export type Running = typeof import("./chat/service.js").Running
  export type AwaitingApproval = typeof import("./chat/service.js").AwaitingApproval
  export type Failed = typeof import("./chat/service.js").Failed
  export type RunState = import("./chat/service.js").RunState
  export type Model = import("./chat/service.js").Model
  export type ReceivedAgent = typeof import("./chat/service.js").ReceivedAgent
  export type OpenedSession = typeof import("./chat/service.js").OpenedSession
  export type ChangedDraft = typeof import("./chat/service.js").ChangedDraft
  export type SubmittedMessage = typeof import("./chat/service.js").SubmittedMessage
  export type ClickedCancel = typeof import("./chat/service.js").ClickedCancel
  export type ClickedApprove = typeof import("./chat/service.js").ClickedApprove
  export type ClickedDeny = typeof import("./chat/service.js").ClickedDeny
  export type SentUserMessage = typeof import("./chat/service.js").SentUserMessage
  export type ResolvedApproval = typeof import("./chat/service.js").ResolvedApproval
  export type CancelledRun = typeof import("./chat/service.js").CancelledRun
  export type FailedAgentCommand = typeof import("./chat/service.js").FailedAgentCommand
  export type Action = import("./chat/service.js").Action
  export type RunCompleted = typeof import("./chat/service.js").RunCompleted
  export type ApprovalRequired = typeof import("./chat/service.js").ApprovalRequired
  export type RunFailed = typeof import("./chat/service.js").RunFailed
  export type Output = import("./chat/service.js").Output
  export type MessageAlign = import("./chat/service.js").MessageAlign
  export type PromptInputStatus = import("./chat/service.js").PromptInputStatus
  export type ToolStatus = import("./chat/service.js").ToolStatus
  export type UserConversationItem = typeof import("./chat/service.js").UserConversationItem
  export type AssistantConversationItem = typeof import("./chat/service.js").AssistantConversationItem
  export type ToolConversationItem = typeof import("./chat/service.js").ToolConversationItem
  export type WaitingConversationItem = typeof import("./chat/service.js").WaitingConversationItem
  export type ApprovalConversationItem = typeof import("./chat/service.js").ApprovalConversationItem
  export type FailureConversationItem = typeof import("./chat/service.js").FailureConversationItem
  export type ConversationItem = import("./chat/service.js").ConversationItem
  export type initialModel = typeof import("./chat/service.js").initialModel
  export type SendUserMessage = typeof import("./chat/service.js").SendUserMessage
  export type ResolveApproval = typeof import("./chat/service.js").ResolveApproval
  export type CancelRun = typeof import("./chat/service.js").CancelRun
  export type promptInputStatusOf = typeof import("./chat/service.js").promptInputStatusOf
  export type toolStatusOf = typeof import("./chat/service.js").toolStatusOf
  export type conversationItems = typeof import("./chat/service.js").conversationItems
  export type update = typeof import("./chat/update-logic.js").update
  export type subscriptions = typeof import("./chat/update-logic.js").subscriptions
  export type ChatCommand = import("./chat/service.js").ChatCommand
}
import {
  ConnectionOpened as Connection_ConnectionOpened,
  ConnectionLost as Connection_ConnectionLost,
  ConnectionFailed as Connection_ConnectionFailed,
  Incoming as Connection_Incoming,
  SendFailed as Connection_SendFailed,
  AgentCommandError as Connection_AgentCommandError,
  CommandOperation as Connection_CommandOperation,
  AgentConnection as Connection_AgentConnection,
  layerTest as Connection_layerTest,
  layerWebSocket as Connection_layerWebSocket,
} from "./chat/connection.js"
export const Connection = {
  ConnectionOpened: Connection_ConnectionOpened,
  ConnectionLost: Connection_ConnectionLost,
  ConnectionFailed: Connection_ConnectionFailed,
  Incoming: Connection_Incoming,
  SendFailed: Connection_SendFailed,
  AgentCommandError: Connection_AgentCommandError,
  CommandOperation: Connection_CommandOperation,
  AgentConnection: Connection_AgentConnection,
  layerTest: Connection_layerTest,
  layerWebSocket: Connection_layerWebSocket,
}
export namespace Connection {
  export type ConnectionOpened = typeof import("./chat/connection.js").ConnectionOpened
  export type ConnectionLost = typeof import("./chat/connection.js").ConnectionLost
  export type ConnectionFailed = typeof import("./chat/connection.js").ConnectionFailed
  export type Incoming = import("./chat/connection.js").Incoming
  export type SendFailed = import("./chat/connection.js").SendFailed
  export type AgentCommandError = import("./chat/connection.js").AgentCommandError
  export type CommandOperation = import("./chat/connection.js").CommandOperation
  export type AgentConnection = import("./chat/connection.js").AgentConnection
  export type layerTest = typeof import("./chat/connection.js").layerTest
  export type layerWebSocket = typeof import("./chat/connection.js").layerWebSocket
  export type Service = import("./chat/connection.js").Service
  export type SessionConnection = import("./chat/connection.js").SessionConnection
}
