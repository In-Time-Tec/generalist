type AgentEventFacade = typeof import("./agent-event.js")

import {
  addUsage as AgentEvent_addUsage,
  ApprovalId as AgentEvent_ApprovalId,
  ApprovalRequest as AgentEvent_ApprovalRequest,
  AgentError as AgentEvent_AgentError,
  TurnLimitExceeded as AgentEvent_TurnLimitExceeded,
  TurnPolicyStopped as AgentEvent_TurnPolicyStopped,
  RunEndedWithoutOutput as AgentEvent_RunEndedWithoutOutput,
  MiddlewareViolation as AgentEvent_MiddlewareViolation,
  DuplicateToolCallId as AgentEvent_DuplicateToolCallId,
  ProgressOverflow as AgentEvent_ProgressOverflow,
  ToolOrigin as AgentEvent_ToolOrigin,
  ToolNameCollision as AgentEvent_ToolNameCollision,
  AgentSuspended as AgentEvent_AgentSuspended,
  ResumeMismatch as AgentEvent_ResumeMismatch,
} from "./agent-event.js"
export const AgentEvent = {
  addUsage: AgentEvent_addUsage,
  ApprovalId: AgentEvent_ApprovalId,
  ApprovalRequest: AgentEvent_ApprovalRequest,
  AgentError: AgentEvent_AgentError,
  TurnLimitExceeded: AgentEvent_TurnLimitExceeded,
  TurnPolicyStopped: AgentEvent_TurnPolicyStopped,
  RunEndedWithoutOutput: AgentEvent_RunEndedWithoutOutput,
  MiddlewareViolation: AgentEvent_MiddlewareViolation,
  DuplicateToolCallId: AgentEvent_DuplicateToolCallId,
  ProgressOverflow: AgentEvent_ProgressOverflow,
  ToolOrigin: AgentEvent_ToolOrigin,
  ToolNameCollision: AgentEvent_ToolNameCollision,
  AgentSuspended: AgentEvent_AgentSuspended,
  ResumeMismatch: AgentEvent_ResumeMismatch,
} as AgentEventFacade
export namespace AgentEvent {
  export type addUsage = typeof import("./agent-event.js").addUsage
  export type AgentError = import("./agent-event.js").AgentError
  export type TurnLimitExceeded = import("./agent-event.js").TurnLimitExceeded
  export type TurnPolicyStopped = import("./agent-event.js").TurnPolicyStopped
  export type RunEndedWithoutOutput = import("./agent-event.js").RunEndedWithoutOutput
  export type MiddlewareViolation = import("./agent-event.js").MiddlewareViolation
  export type DuplicateToolCallId = import("./agent-event.js").DuplicateToolCallId
  export type ProgressOverflow = import("./agent-event.js").ProgressOverflow
  export type ToolOrigin = import("./agent-event.js").ToolOrigin
  export type ToolNameCollision = import("./agent-event.js").ToolNameCollision
  export type AgentSuspended = import("./agent-event.js").AgentSuspended
  export type ResumeMismatch = import("./agent-event.js").ResumeMismatch
  export type ApprovalId = import("./agent-event.js").ApprovalId
  export type ApprovalRequest = import("./agent-event.js").ApprovalRequest
  export type ApprovalRequested = import("./agent-event.js").ApprovalRequested
  export type Completed = import("./agent-event.js").Completed
  export type Event = import("./agent-event.js").Event
  export type Metadata = import("./agent-event.js").Metadata
  export type ModelPart = import("./agent-event.js").ModelPart
  export type SteeringDrained = import("./agent-event.js").SteeringDrained
  export type SteeringQueueName = import("./agent-event.js").SteeringQueueName
  export type StructuredOutput = import("./agent-event.js").StructuredOutput
  export type ToolExecutionCompleted = import("./agent-event.js").ToolExecutionCompleted
  export type ToolExecutionStarted = import("./agent-event.js").ToolExecutionStarted
  export type ToolProgress = import("./agent-event.js").ToolProgress
  export type TurnCompleted = import("./agent-event.js").TurnCompleted
  export type TurnStarted = import("./agent-event.js").TurnStarted
}
