import { Schema } from "effect"
import * as Ai from "effect/unstable/ai"

/** @experimental Escape-hatch metadata carried by loop events. */
export type Metadata = Readonly<Record<string, unknown>>

/** @experimental A model turn has started. `turn` is 0-based. */
export interface TurnStarted {
  readonly _tag: "TurnStarted"
  readonly turn: number
  readonly metadata?: Metadata
}

/** @experimental A raw model stream part, passed through unchanged. */
export interface ModelPart {
  readonly _tag: "ModelPart"
  readonly turn: number
  readonly part: Ai.Response.StreamPart<Record<string, Ai.Tool.Any>>
  readonly metadata?: Metadata
}

/** @experimental A tool call is about to execute via the ToolExecutor service. */
export interface ToolExecutionStarted {
  readonly _tag: "ToolExecutionStarted"
  readonly turn: number
  readonly call: Ai.Response.ToolCallPart<string, unknown>
  readonly metadata?: Metadata
}

/** @experimental A tool call finished; `result` is the part re-fed to the model. */
export interface ToolExecutionCompleted {
  readonly _tag: "ToolExecutionCompleted"
  readonly turn: number
  readonly call: Ai.Response.ToolCallPart<string, unknown>
  readonly result: Ai.Response.ToolResultPart<string, unknown, unknown>
  readonly metadata?: Metadata
}

/** @experimental Emitted before consulting Approvals for a needsApproval tool. */
export interface ApprovalRequested {
  readonly _tag: "ApprovalRequested"
  readonly turn: number
  readonly call: Ai.Response.ToolCallPart<string, unknown>
  readonly metadata?: Metadata
}

/**
 * @experimental Emitted after each model turn completes (after tool executions
 * for that turn). `transcript` is the full chat history at this point — hosts
 * that persist conversation state (e.g. Relay's durable chat export) read it
 * from here.
 */
export interface TurnCompleted {
  readonly _tag: "TurnCompleted"
  readonly turn: number
  readonly transcript: Ai.Prompt.Prompt
  readonly metadata?: Metadata
}

/** @experimental Terminal event: the run finished without suspension. */
export interface Completed {
  readonly _tag: "Completed"
  readonly turns: number
  readonly text: string
  readonly transcript: Ai.Prompt.Prompt
  readonly metadata?: Metadata
}

/** @experimental Closed union of Baton loop events. */
export type Event =
  | TurnStarted
  | ModelPart
  | ToolExecutionStarted
  | ToolExecutionCompleted
  | ApprovalRequested
  | TurnCompleted
  | Completed

/** @experimental The loop failed. `turn` is the 0-based turn that failed. */
export class AgentError extends Schema.TaggedErrorClass<AgentError>()("@batonfx/core/AgentError", {
  message: Schema.String,
  turn: Schema.Number,
}) {}

/**
 * @experimental The run suspended: a tool outcome was `Suspend` or an approval
 * decision was `Pending`. The run did NOT finish; the host resolves `token`
 * out-of-band and re-enters via `RunOptions.resume` with the pending call.
 * Field shape deliberately mirrors a tool call so durable hosts can persist it.
 */
export class AgentSuspended extends Schema.TaggedErrorClass<AgentSuspended>()("@batonfx/core/AgentSuspended", {
  token: Schema.String,
  reason: Schema.Literals(["tool-wait", "approval"]),
  tool_call_id: Schema.String,
  tool_name: Schema.String,
  tool_params: Schema.Unknown,
}) {}
