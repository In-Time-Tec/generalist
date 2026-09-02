import { Function, Schema } from "effect"
import { AiError, Prompt, Response, Tool } from "effect/unstable/ai"
import type { Event as ModelTelemetryEvent } from "../model/telemetry/events.js"
import type { CompletedModelResponse } from "../model/response/builder.js"
import { Diagnostics as SessionSyncDiagnostics } from "../context/session-sync.js"
import { StopReason } from "../turn/policy.js"
import { ActionableTaggedError, errorHint } from "../error-hint.js"
import { ToolBatchCheckpoint, ToolBatchWait } from "./tools/checkpoint.js"
import type { Result as CompletionGateResult } from "./gates/definition.js"
/** Escape-hatch metadata carried by loop events. */
export type Metadata = Readonly<Record<string, Schema.Json>>

/** A model turn has started. `turn` is 0-based. */
export interface TurnStarted {
  readonly _tag: "TurnStarted"
  readonly turn: number
  readonly metadata?: Metadata
}

/**
 * A raw model stream part, passed through unchanged.
 * `modelCallId`, `modelAttemptId`, and 0-based `attempt` join the part to its
 * model-call and attempt lifecycle events.
 */
export interface ModelPart {
  readonly _tag: "ModelPart"
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly part: Response.StreamPart<Record<string, Tool.Any>>
  readonly metadata?: Metadata
}

/** One normalized model response after its durable operation commit. */
interface ModelResponseCommitted {
  readonly _tag: "ModelResponseCommitted"
  readonly turn: number
  readonly operationKey: string
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly response: CompletedModelResponse<Record<string, Tool.Any>>
  readonly budgetCharge: number
  readonly digest: string
  readonly metadata?: Metadata
}

/** A tool call is about to execute via the ToolExecutor service. */
export interface ToolExecutionStarted {
  readonly _tag: "ToolExecutionStarted"
  readonly turn: number
  readonly call: Response.ToolCallPart<string, unknown>
  readonly metadata?: Metadata
}

/** An in-flight progress update from a running tool. */
export interface ToolProgress {
  readonly _tag: "ToolProgress"
  readonly turn: number
  readonly toolCallId: string
  readonly message?: string
  readonly data?: Record<string, Schema.Json>
  readonly metadata?: Metadata
}

/** A same-run handoff was requested. */
interface HandoffRequested {
  readonly _tag: "HandoffRequested"
  readonly turn: number
  readonly handoffId: string
  readonly source: string
  readonly target: string
  readonly reason?: string
  readonly metadata?: Metadata
}

/** A same-run handoff completed and switched the active agent. */
interface HandoffCompleted {
  readonly _tag: "HandoffCompleted"
  readonly turn: number
  readonly handoffId: string
  readonly source: string
  readonly target: string
  readonly metadata?: Metadata
}

/** A same-run handoff was rejected before switching agents. */
interface RejectedEvent {
  readonly _tag: "Rejected"
  readonly turn: number
  readonly handoffId: string
  readonly reason: string
  readonly metadata?: Metadata
}

/** A tool call finished; `result` is the part re-fed to the model. */
export interface ToolExecutionCompleted {
  readonly _tag: "ToolExecutionCompleted"
  readonly turn: number
  readonly call: Response.ToolCallPart<string, unknown>
  readonly result: Response.ToolResultPart<string, unknown, unknown>
  readonly metadata?: Metadata & {
    readonly toolProgress?: {
      readonly dropped: number
    }
  }
}

/** A tool reached a durable wait without disturbing admitted siblings. */
interface ToolExecutionWaiting {
  readonly _tag: "ToolExecutionWaiting"
  readonly turn: number
  readonly call: Response.ToolCallPart<string, unknown>
  readonly waitId: string
  readonly token: string
  readonly metadata?: Metadata
}

/** Stable identity for one authorization request. */
export const ApprovalId = Schema.String.check(Schema.isNonEmpty())
export type ApprovalId = typeof ApprovalId.Type

/** Canonical identity and payload for one authorization request. */
export const ApprovalRequest = Schema.Struct({
  approvalId: ApprovalId,
  operation: Schema.String.check(Schema.isNonEmpty()),
  capability: Schema.String.check(Schema.isNonEmpty()),
  input: Schema.Unknown,
})
export type ApprovalRequest = typeof ApprovalRequest.Type

/** Emitted before resolving a permission ask or needsApproval tool. */
export interface ApprovalRequested {
  readonly _tag: "ApprovalRequested"
  readonly turn: number
  readonly call: Response.ToolCallPart<string, unknown>
  readonly request: ApprovalRequest
  readonly metadata?: Metadata
}

/** Steering queue whose inputs were consumed at a turn boundary. */
export type SteeringQueueName = "steering" | "followUp"

/** A steering or follow-up queue was drained into the next prompt. */
export interface SteeringDrained {
  readonly _tag: "SteeringDrained"
  readonly turn: number
  readonly queue: SteeringQueueName
  readonly count: number
  readonly metadata?: Metadata
}

/**
 * Emitted after each model turn completes (after tool executions
 * for that turn). `transcript` is the full chat history at this point — hosts
 * that persist conversation state read it
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

/** One ordered completion gate verdict for a proposed terminal output. */
export interface GateResult extends CompletionGateResult {
  readonly _tag: "GateResult"
  readonly turn: number
}

/** Terminal event: the run finished without suspension. */
export interface Completed<Output = unknown> {
  readonly _tag: "Completed"
  readonly turns: number
  readonly text: string
  readonly output: Output
  readonly transcript: Prompt.Prompt
  readonly usage?: Response.Usage
  readonly metadata?: Metadata
}

const addUsageField = (left: number | undefined, right: number | undefined): number | undefined =>
  left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0)

/** Fieldwise sum of upstream model usage values. */
export const addUsage: {
  (right: Response.Usage): (left: Response.Usage) => Response.Usage
  (left: Response.Usage, right: Response.Usage): Response.Usage
} = Function.dual(
  2,
  (left: Response.Usage, right: Response.Usage): Response.Usage =>
    Response.Usage.make({
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
    }),
)

/** Closed union of Generalist loop events. */
export type Event<Output = unknown> =
  | TurnStarted
  | ModelPart
  | ModelResponseCommitted
  | ToolExecutionStarted
  | ToolProgress
  | ToolExecutionCompleted
  | ToolExecutionWaiting
  | HandoffRequested
  | HandoffCompleted
  | RejectedEvent
  | ApprovalRequested
  | SteeringDrained
  | TurnCompleted
  | GateResult
  | Completed<Output>
  | ModelTelemetryEvent

const defaultAgentErrorHint =
  "Inspect the cause and diagnostics, correct the failing boundary, and run the Agent again."

const agentErrorHint = (cause: unknown): string => {
  if (!AiError.isAiError(cause)) return defaultAgentErrorHint
  if (cause.reason._tag === "AuthenticationError") {
    return "Check the selected provider's API key configuration name and provide the correct credential."
  }
  if (
    cause.reason._tag === "InvalidRequestError" &&
    (cause.reason.parameter === "model" || /\bmodel\b/i.test(cause.reason.description ?? ""))
  ) {
    return "Check the model ID against the selected provider's model catalog, then select a supported ID."
  }
  return defaultAgentErrorHint
}

/** The loop failed. `turn` is the 0-based turn that failed. */
export class AgentError extends ActionableTaggedError<AgentError>()("generalist/core/AgentError", {
  message: Schema.String,
  turn: Schema.Finite,
  cause: Schema.optionalKey(Schema.Defect()),
  diagnostics: Schema.optionalKey(SessionSyncDiagnostics),
  hint: errorHint(defaultAgentErrorHint),
}) {
  static override make(
    props: {
      readonly message: string
      readonly turn: number
      readonly cause?: unknown
      readonly diagnostics?: SessionSyncDiagnostics
      readonly hint?: string
    },
    options?: Schema.MakeOptions,
  ): AgentError {
    return super.make({ ...props, hint: props.hint ?? agentErrorHint(props.cause) }, options)
  }
}

/** The model's terminal value did not satisfy the Agent output Schema. */
export class InvalidOutput extends ActionableTaggedError<InvalidOutput>()("generalist/core/InvalidOutput", {
  issues: Schema.Array(Schema.String),
  hint: errorHint("Correct the model output or Agent output Schema so the terminal value decodes."),
}) {}

/** The turn policy declined another turn while tool results were still pending. */
export class TurnLimitExceeded extends ActionableTaggedError<TurnLimitExceeded>()("generalist/core/TurnLimitExceeded", {
  turn: Schema.Finite,
  limit: Schema.Finite,
  pending: Schema.Array(
    Schema.Struct({
      tool_call_id: Schema.String,
      tool_name: Schema.String,
    }),
  ),
  hint: errorHint("Increase the turn limit or change the policy so pending tool results can reach the model."),
}) {}

/** A turn policy successfully stopped for a reason other than a configured turn limit. */
export class PolicyStopped extends ActionableTaggedError<PolicyStopped>()("generalist/core/PolicyStopped", {
  turn: Schema.Finite,
  reason: StopReason,
  pending: Schema.Array(
    Schema.Struct({
      tool_call_id: Schema.String,
      tool_name: Schema.String,
    }),
  ),
  hint: errorHint("Change the policy stop condition or handle the listed pending tool results before stopping."),
}) {}

/**
 * The turn that would have ended the run left no assistant text,
 * so the run has no answer to report and never completes. `finishReason` is
 * what the provider reported for that turn: `"unknown"` means the provider
 * never said why it stopped, and an absent reason means no terminal event was
 * observed at all. `providerTextCharacters` and `reasoningCharacters` count
 * what the provider streamed across every attempt of that turn, before
 * middleware ran, so zero text with reasoning is a provider that stopped after
 * thinking and zero of both is a provider that produced nothing. Non-zero text
 * means text was streamed but never committed: a middleware chain removed it,
 * or the attempt that streamed it was discarded before release.
 */
export class RunEndedWithoutOutput extends ActionableTaggedError<RunEndedWithoutOutput>()(
  "generalist/core/RunEndedWithoutOutput",
  {
    turn: Schema.Finite,
    finishReason: Schema.optionalKey(Response.FinishReason),
    providerTextCharacters: Schema.Finite,
    reasoningCharacters: Schema.Finite,
    hint: errorHint("Make the provider return assistant text, or use a structured Agent output Schema."),
  },
) {}

/** A ModelMiddleware hook violated the loop contract. */
export class MiddlewareViolation extends ActionableTaggedError<MiddlewareViolation>()(
  "generalist/core/MiddlewareViolation",
  {
    turn: Schema.Finite,
    detail: Schema.String,
    hint: errorHint("Fix the middleware hook named by detail so it preserves the Agent loop contract."),
  },
) {}

/** A transformed model response reused a tool-call identifier. */
export class DuplicateToolCallId extends ActionableTaggedError<DuplicateToolCallId>()(
  "generalist/core/DuplicateToolCallId",
  {
    id: Schema.String,
    firstIndex: Schema.Finite,
    duplicateIndex: Schema.Finite,
    hint: errorHint("Make every post-middleware tool-call ID unique within the model response."),
  },
) {}

/** An explicitly failing tool progress queue reached capacity. */
export class ProgressOverflow extends ActionableTaggedError<ProgressOverflow>()("generalist/core/ProgressOverflow", {
  turn: Schema.Finite,
  toolCallId: Schema.String,
  capacity: Schema.Finite,
  hint: errorHint("Drain progress faster, increase capacity, or choose a dropping or sliding progress policy."),
}) {}

/** The origin of one tool declaration in an Agent run. */
export const ToolOrigin = Schema.Union([
  Schema.TaggedStruct("Static", { agent: Schema.String }),
  Schema.TaggedStruct("Builtin", { builtin: Schema.Literal("activate_skill") }),
  Schema.TaggedStruct("Skill", { skill: Schema.String }),
  Schema.TaggedStruct("Handoff", {
    specialist: Schema.String,
    mode: Schema.Literals(["same-run", "delegate"]),
  }),
])
export type ToolOrigin = typeof ToolOrigin.Type

/** The advertised tool set contains more than one declaration for a name. */
export class ToolNameCollision extends ActionableTaggedError<ToolNameCollision>()("generalist/core/ToolNameCollision", {
  name: Schema.String,
  origins: Schema.NonEmptyArray(ToolOrigin),
  hint: errorHint("Rename or remove one listed declaration so each advertised tool name is unique."),
}) {}

/**
 * The run suspended with one or more exact authored-order waits.
 * The run did NOT finish; the host resolves waits out-of-band and re-enters via
 * `RunOptions.resume` with this exact batch checkpoint.
 */
export class AgentSuspended extends ActionableTaggedError<AgentSuspended>()("generalist/core/AgentSuspended", {
  checkpoint: ToolBatchCheckpoint,
  waits: Schema.Array(ToolBatchWait),
  hint: errorHint("Resolve every listed wait and resume with this exact suspension checkpoint."),
}) {}

/** A resume identity did not match the current authoritative suspension checkpoint. */
export class ResumeMismatch extends ActionableTaggedError<ResumeMismatch>()("generalist/core/ResumeMismatch", {
  reason: Schema.Literals(["checkpoint-not-found", "identity-mismatch"]),
  expected: Schema.optional(AgentSuspended),
  received: AgentSuspended,
  hint: errorHint("Resume with the sole current suspension checkpoint and its exact wait identities."),
}) {}
