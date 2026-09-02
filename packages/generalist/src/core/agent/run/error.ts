import { Schema } from "effect"
import { AiError } from "effect/unstable/ai"
import {
  AgentError,
  AgentSuspended,
  DuplicateToolCallId,
  InvalidOutput,
  MiddlewareViolation,
  PolicyStopped,
  ProgressOverflow,
  ResumeMismatch,
  RunEndedWithoutOutput,
  ToolNameCollision,
  TurnLimitExceeded,
} from "../event.js"
import { InvocationLifecycleFailed, SinkFailed } from "../../model/telemetry/events.js"
import { Exhausted } from "../../durable/run-budget.js"
import { DriverError, DriverStateInvalid } from "../../durable/service.js"
import { DriverUnknownReplay } from "../../durable/driver/interpreter.js"
import { Misconfigured } from "../../model/resilience.js"
import { InvalidToolCallParameters, ToolJsonSchemaCompilerMissing } from "../../model/tool-call-validation.js"
import { LanguageModelNotRegistered } from "../../model/registry.js"
import { FrameworkFailure } from "../../tools/tool-executor.js"
import { HandoffLimitExceeded, HandoffRequirementsMissing, TargetMissing } from "../handoff/state.js"
import { ProjectionInvalid } from "../../policy/handoff-projection.js"
import { Rejected } from "../../policy/handoff-rejected.js"
import { PolicyError } from "../../turn/policy.js"
import { PolicyInvalid } from "../../turn/steering.js"
import { HookFailed } from "../../../hooks/index.js"

/** The error channel and durable codec of `Agent.run` and `Agent.stream`. */
export const RunError = Schema.Union([
  SinkFailed,
  InvocationLifecycleFailed,
  HookFailed,
  AgentError,
  InvalidOutput,
  AgentSuspended,
  ResumeMismatch,
  PolicyError,
  PolicyStopped,
  TurnLimitExceeded,
  RunEndedWithoutOutput,
  MiddlewareViolation,
  Misconfigured,
  InvalidToolCallParameters,
  ToolJsonSchemaCompilerMissing,
  DuplicateToolCallId,
  ProgressOverflow,
  ToolNameCollision,
  AiError.AiError,
  LanguageModelNotRegistered,
  FrameworkFailure,
  DriverError,
  DriverStateInvalid,
  DriverUnknownReplay,
  Exhausted,
  TargetMissing,
  HandoffLimitExceeded,
  HandoffRequirementsMissing,
  ProjectionInvalid,
  Rejected,
  PolicyInvalid,
])
export type RunError = typeof RunError.Type
