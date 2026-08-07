import { Schema } from "effect"
import { AgentEvent, DurableDriver, ProgramCapabilities } from "@batonfx/core"
import { Prompt } from "effect/unstable/ai"

/** @experimental Terminal value produced by an Agent execution. */
export const AgentExecutionResult = Schema.Struct({
  text: Schema.String,
  turns: Schema.Finite,
  transcript: Prompt.Prompt,
})
/** @experimental */
export type AgentExecutionResult = typeof AgentExecutionResult.Type

/** @experimental Terminal value produced by an Agent Program execution. */
export const ProgramExecutionResult = Schema.TaggedStruct("Program", {
  value: Schema.Unknown,
})
/** @experimental */
export type ProgramExecutionResult = typeof ProgramExecutionResult.Type

/** @experimental Executable-neutral terminal result. */
export const ExecutionResult = Schema.Union([AgentExecutionResult, ProgramExecutionResult])
/** @experimental */
export type ExecutionResult = typeof ExecutionResult.Type

/** @experimental Fresh-sandbox replay frontier for an Agent Program. */
export const ProgramCheckpoint = Schema.TaggedStruct("Program", {
  version: Schema.Literal("1"),
})
/** @experimental */
export type ProgramCheckpoint = typeof ProgramCheckpoint.Type

/** @experimental Executable-neutral persisted continuation state. */
export const ExecutionCheckpoint = Schema.Union([DurableDriver.DriverCheckpoint, ProgramCheckpoint])
/** @experimental */
export type ExecutionCheckpoint = typeof ExecutionCheckpoint.Type

/** @experimental Executable-neutral persisted suspension state. */
/** @experimental */
export type ExecutionSuspension =
  | typeof AgentEvent.AgentSuspended.Type
  | typeof ProgramCapabilities.ProgramSuspended.Type
/** @experimental */
export const ExecutionSuspension: Schema.Codec<ExecutionSuspension, unknown> = Schema.Union([
  AgentEvent.AgentSuspended,
  ProgramCapabilities.ProgramSuspended,
])
