type AgentEventFacade = typeof import("../event.js")

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
} from "../event.js"
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
} satisfies AgentEventFacade
export namespace AgentEvent {
  export type addUsage = typeof import("../event.js").addUsage
  export type AgentError = import("../event.js").AgentError
  export type TurnLimitExceeded = import("../event.js").TurnLimitExceeded
  export type TurnPolicyStopped = import("../event.js").TurnPolicyStopped
  export type RunEndedWithoutOutput = import("../event.js").RunEndedWithoutOutput
  export type MiddlewareViolation = import("../event.js").MiddlewareViolation
  export type DuplicateToolCallId = import("../event.js").DuplicateToolCallId
  export type ProgressOverflow = import("../event.js").ProgressOverflow
  export type ToolOrigin = import("../event.js").ToolOrigin
  export type ToolNameCollision = import("../event.js").ToolNameCollision
  export type AgentSuspended = import("../event.js").AgentSuspended
  export type ResumeMismatch = import("../event.js").ResumeMismatch
  export type ApprovalId = import("../event.js").ApprovalId
  export type ApprovalRequest = import("../event.js").ApprovalRequest
  export type ApprovalRequested = import("../event.js").ApprovalRequested
  export type Completed = import("../event.js").Completed
  export type Event = import("../event.js").Event
  export type Metadata = import("../event.js").Metadata
  export type ModelPart = import("../event.js").ModelPart
  export type SteeringDrained = import("../event.js").SteeringDrained
  export type SteeringQueueName = import("../event.js").SteeringQueueName
  export type StructuredOutput = import("../event.js").StructuredOutput
  export type ToolExecutionCompleted = import("../event.js").ToolExecutionCompleted
  export type ToolExecutionStarted = import("../event.js").ToolExecutionStarted
  export type ToolProgress = import("../event.js").ToolProgress
  export type TurnCompleted = import("../event.js").TurnCompleted
  export type TurnStarted = import("../event.js").TurnStarted
}
