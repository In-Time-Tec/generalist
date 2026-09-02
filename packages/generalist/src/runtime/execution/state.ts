import { Schema } from "effect"
import { AgentSuspended } from "../../core/agent/event.js"
import { ProgramSuspended } from "../../core/program/capabilities.js"
import { DriverCheckpoint } from "../../core/durable/driver.js"
import { UnknownAgent } from "../errors.js"

export const SessionCursor = Schema.Struct({
  sessionId: Schema.String,
  leafId: Schema.NullOr(Schema.String),
})
export type SessionCursor = typeof SessionCursor.Type

/** Terminal value produced by an Agent execution. */
export const AgentExecutionResult = Schema.Struct({
  text: Schema.String,
  // Results persisted before Agent-owned output schemas have text only; every new hosted Agent completion writes output.
  output: Schema.optionalKey(Schema.Unknown),
  turns: Schema.Finite,
  session: SessionCursor,
})
export type AgentExecutionResult = typeof AgentExecutionResult.Type

/** Terminal value produced by an Agent Program execution. */
export const ProgramExecutionResult = Schema.TaggedStruct("Program", {
  value: Schema.Unknown,
})
export type ProgramExecutionResult = typeof ProgramExecutionResult.Type

/** Executable-neutral terminal result. */
export const ExecutionResult = Schema.Union([AgentExecutionResult, ProgramExecutionResult])
export type ExecutionResult = typeof ExecutionResult.Type

/** Fresh-sandbox replay frontier for an Agent Program. */
export const ProgramCheckpoint = Schema.TaggedStruct("Program", {
  version: Schema.Literal("1"),
})
export type ProgramCheckpoint = typeof ProgramCheckpoint.Type

/** Executable-neutral persisted continuation state. */
export const ExecutionCheckpoint = Schema.Union([DriverCheckpoint, ProgramCheckpoint])
export type ExecutionCheckpoint = typeof ExecutionCheckpoint.Type

/** Executable-neutral persisted suspension state. */
export type ExecutionSuspension = AgentSuspended | ProgramSuspended | UnknownAgent
export const ExecutionSuspension: Schema.Codec<ExecutionSuspension, unknown> = Schema.Union([
  AgentSuspended,
  ProgramSuspended,
  UnknownAgent,
])
