import { Schema } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
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
  readonly part: Response.StreamPart<Record<string, Tool.Any>>
  readonly metadata?: Metadata
}

/** @experimental A tool call is about to execute via the ToolExecutor service. */
export interface ToolExecutionStarted {
  readonly _tag: "ToolExecutionStarted"
  readonly turn: number
  readonly call: Response.ToolCallPart<string, unknown>
  readonly metadata?: Metadata
}

/** @experimental An in-flight progress update from a running tool. */
export interface ToolProgress {
  readonly _tag: "ToolProgress"
  readonly turn: number
  readonly toolCallId: string
  readonly message?: string
  readonly data?: Record<string, unknown>
  readonly metadata?: Metadata
}

/** @experimental A tool call finished; `result` is the part re-fed to the model. */
export interface ToolExecutionCompleted {
  readonly _tag: "ToolExecutionCompleted"
  readonly turn: number
  readonly call: Response.ToolCallPart<string, unknown>
  readonly result: Response.ToolResultPart<string, unknown, unknown>
  readonly metadata?: Metadata
}

/** @experimental Emitted before consulting Approvals for a needsApproval tool. */
export interface ApprovalRequested {
  readonly _tag: "ApprovalRequested"
  readonly turn: number
  readonly call: Response.ToolCallPart<string, unknown>
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
  readonly transcript: Prompt.Prompt
  readonly usage?: Response.Usage
  readonly finishReason?: Response.FinishReason
  readonly metadata?: Metadata
}

/** @experimental Terminal structured turn produced a schema-validated value. */
export interface StructuredOutput {
  readonly _tag: "StructuredOutput"
  readonly turn: number
  readonly value: unknown
  readonly content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>
  readonly metadata?: Metadata
}

/** @experimental Terminal event: the run finished without suspension. */
export interface Completed {
  readonly _tag: "Completed"
  readonly turns: number
  readonly text: string
  readonly transcript: Prompt.Prompt
  readonly usage?: Response.Usage
  readonly metadata?: Metadata
}

const addUsageField = (left: number | undefined, right: number | undefined): number | undefined =>
  left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0)

/** @experimental Fieldwise sum of upstream model usage values. */
export const addUsage = (left: Response.Usage, right: Response.Usage): Response.Usage =>
  new Response.Usage({
    inputTokens: {
      uncached: addUsageField(left.inputTokens.uncached, right.inputTokens.uncached),
      total: addUsageField(left.inputTokens.total, right.inputTokens.total),
      cacheRead: addUsageField(left.inputTokens.cacheRead, right.inputTokens.cacheRead),
      cacheWrite: addUsageField(left.inputTokens.cacheWrite, right.inputTokens.cacheWrite),
    },
    outputTokens: {
      total: addUsageField(left.outputTokens.total, right.outputTokens.total),
      text: addUsageField(left.outputTokens.text, right.outputTokens.text),
      reasoning: addUsageField(left.outputTokens.reasoning, right.outputTokens.reasoning),
    },
  })

/** @experimental Closed union of Baton loop events. */
export type Event =
  | TurnStarted
  | ModelPart
  | ToolExecutionStarted
  | ToolProgress
  | ToolExecutionCompleted
  | ApprovalRequested
  | TurnCompleted
  | StructuredOutput
  | Completed

/** @experimental The loop failed. `turn` is the 0-based turn that failed. */
export class AgentError extends Schema.TaggedErrorClass<AgentError>()("@batonfx/core/AgentError", {
  message: Schema.String,
  turn: Schema.Number,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental The turn policy declined another turn while tool results were still pending. */
export class TurnLimitExceeded extends Schema.TaggedErrorClass<TurnLimitExceeded>()("@batonfx/core/TurnLimitExceeded", {
  turn: Schema.Number,
  pending: Schema.Array(
    Schema.Struct({
      tool_call_id: Schema.String,
      tool_name: Schema.String,
    }),
  ),
}) {}

/** @experimental A ModelMiddleware hook violated the loop contract. */
export class MiddlewareViolation extends Schema.TaggedErrorClass<MiddlewareViolation>()(
  "@batonfx/core/MiddlewareViolation",
  {
    turn: Schema.Number,
    detail: Schema.String,
  },
) {}

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
