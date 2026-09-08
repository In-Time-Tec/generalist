import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import { AgentSuspended } from "../../core/agent/event.js"
import { ProgramOperationName, ProgramSuspended } from "../../core/program/capabilities.js"
import { DriverCheckpoint } from "../../core/durable/driver.js"
import { UnknownAgent } from "../errors.js"
import { BudgetExhausted } from "../../core/durable/run-budget.js"
import { Suspended as NestedOperationSuspended } from "../../core/tools/nested-operation.js"

export const SessionCursor = Schema.Struct({
  sessionId: Schema.String,
  leafId: Schema.NullOr(Schema.String),
})
export type SessionCursor = typeof SessionCursor.Type

/** Terminal value produced by an Agent execution. */
export const AgentExecutionResult = Schema.Struct({
  text: Schema.String,
  output: Schema.Unknown,
  turns: Schema.Finite,
  session: SessionCursor,
})
export type AgentExecutionResult = typeof AgentExecutionResult.Type

/** Terminal value produced by an Agent Program execution. */
export const ProgramExecutionResult = Schema.TaggedStruct("Program", {
  value: Schema.Unknown,
})
export type ProgramExecutionResult = typeof ProgramExecutionResult.Type

export const ToolExecutionResult = Schema.TaggedStruct("Tool", {
  isFailure: Schema.Boolean,
  value: Schema.Unknown,
})
export type ToolExecutionResult = typeof ToolExecutionResult.Type

export const ToolCheckpoint = Schema.TaggedStruct("Tool", { version: Schema.Literal("1") })
export class ToolSuspended extends ActionableTaggedError<ToolSuspended>()("generalist/runtime/ToolSuspended", {
  token: Schema.String,
  hint: errorHint("Resolve the retained Tool wait before resuming this Run."),
}) {}

/** Executable-neutral terminal result. */
export const ExecutionResult = Schema.Union([AgentExecutionResult, ProgramExecutionResult, ToolExecutionResult])
export type ExecutionResult = typeof ExecutionResult.Type

/** Fresh-sandbox replay frontier for an Agent Program. */
export const ProgramCheckpoint = Schema.TaggedStruct("Program", {
  version: Schema.Literal("1"),
  branch: Schema.optionalKey(
    Schema.Struct({
      namespace: Schema.String,
      replay: Schema.Record(ProgramOperationName, ProgramOperationName).check(
        Schema.makeFilter((value) => Object.keys(value).length <= 4096),
      ),
    }),
  ),
})
export type ProgramCheckpoint = typeof ProgramCheckpoint.Type

/** Executable-neutral persisted continuation state. */
export const ExecutionCheckpoint = Schema.Union([DriverCheckpoint, ProgramCheckpoint, ToolCheckpoint])
export type ExecutionCheckpoint = typeof ExecutionCheckpoint.Type

/** Executable-neutral persisted suspension state. */
export type ExecutionSuspension =
  | AgentSuspended
  | ProgramSuspended
  | UnknownAgent
  | BudgetExhausted
  | NestedOperationSuspended
  | ToolSuspended
export const ExecutionSuspension: Schema.Codec<ExecutionSuspension, unknown> = Schema.Union([
  AgentSuspended,
  ProgramSuspended,
  UnknownAgent,
  BudgetExhausted,
  NestedOperationSuspended,
  ToolSuspended,
])
