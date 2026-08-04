import { Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { AgentRef } from "./agent-ref.js"
import type { AgentLoopEvent, AgentResult } from "./agent-event.js"
import { RunId } from "./run.js"
import { RunWait, WaitResolution } from "./run-wait.js"
import { Address } from "./address.js"
import { ModelTelemetry } from "@batonfx/core"

export type { AgentLoopEvent, AgentResult }

export const SpecVersion = Schema.Literals(["1"])
export type SpecVersion = typeof SpecVersion.Type

export const Sequence = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)
export type Sequence = typeof Sequence.Type

export const RunEventBase = Schema.Struct({
  specVersion: SpecVersion,
  eventId: Schema.String,
  runId: RunId,
  sequence: Sequence,
  agent: AgentRef,
  attemptId: Schema.optionalKey(Schema.String),
  rootRunId: RunId,
  parentRunId: Schema.optionalKey(RunId),
  causationId: Schema.optionalKey(Schema.String),
  correlationId: Schema.optionalKey(Schema.String),
  occurredAt: Schema.String,
})
export type RunEventBase = typeof RunEventBase.Type

export const AgentResultSchema = Schema.Struct({
  text: Schema.String,
  turns: Schema.Finite,
  transcript: Prompt.Prompt,
})

export const RunFailure = Schema.Struct({
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
})
export type RunFailure = typeof RunFailure.Type

export type RunAccepted = RunEventBase & {
  readonly _tag: "RunAccepted"
  readonly messageId: string
  readonly address: Address
}
export type RunAttemptStarted = RunEventBase & {
  readonly _tag: "RunAttemptStarted"
  readonly attempt: number
}
export type RunWaiting = RunEventBase & {
  readonly _tag: "RunWaiting"
  readonly wait: RunWait
}
export type RunResumed = RunEventBase & {
  readonly _tag: "RunResumed"
  readonly waitId: string
  readonly resolution: WaitResolution
}
export type OperationUnknown = RunEventBase & {
  readonly _tag: "OperationUnknown"
  readonly operationId: string
}
export type ChildLinked = RunEventBase & {
  readonly _tag: "ChildLinked"
  readonly childRunId: string
  readonly invocationId: string
}
export type ChildSettled = RunEventBase & {
  readonly _tag: "ChildSettled"
  readonly childRunId: string
  readonly terminalEventId: string
}
export type RunCompleted = RunEventBase & {
  readonly _tag: "RunCompleted"
  readonly result: AgentResult
}
export type RunFailed = RunEventBase & {
  readonly _tag: "RunFailed"
  readonly error: RunFailure
}
export type RunCancellationRequested = RunEventBase & {
  readonly _tag: "RunCancellationRequested"
  readonly reason?: string
}
export type RunCancelled = RunEventBase & {
  readonly _tag: "RunCancelled"
  readonly reason?: string
}

export type LifecycleEvent =
  | RunAccepted
  | RunAttemptStarted
  | RunWaiting
  | RunResumed
  | OperationUnknown
  | ChildLinked
  | ChildSettled
  | RunCompleted
  | RunFailed
  | RunCancellationRequested
  | RunCancelled

export type RunEvent = (RunEventBase & AgentLoopEvent) | LifecycleEvent

export const LifecycleTag = Schema.Literals([
  "RunAccepted",
  "RunAttemptStarted",
  "RunWaiting",
  "RunResumed",
  "OperationUnknown",
  "ChildLinked",
  "ChildSettled",
  "RunCompleted",
  "RunFailed",
  "RunCancellationRequested",
  "RunCancelled",
])

const Metadata = Schema.Record(Schema.String, Schema.Unknown)
const ToolCall = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.Boolean,
  metadata: Response.ProviderMetadata,
})
const ToolResult = Schema.Struct({
  type: Schema.Literal("tool-result"),
  id: Schema.String,
  name: Schema.String,
  isFailure: Schema.Boolean,
  result: Schema.Unknown,
  encodedResult: Schema.Unknown,
  providerExecuted: Schema.Boolean,
  preliminary: Schema.Boolean,
  metadata: Response.ProviderMetadata,
})
const Usage = Schema.Struct({
  inputTokens: Schema.Struct({
    uncached: Schema.optionalKey(Schema.UndefinedOr(Schema.Number)),
    total: Schema.optionalKey(Schema.UndefinedOr(Schema.Number)),
    cacheRead: Schema.optionalKey(Schema.UndefinedOr(Schema.Number)),
    cacheWrite: Schema.optionalKey(Schema.UndefinedOr(Schema.Number)),
  }),
  outputTokens: Schema.Struct({
    total: Schema.optionalKey(Schema.UndefinedOr(Schema.Number)),
    text: Schema.optionalKey(Schema.UndefinedOr(Schema.Number)),
    reasoning: Schema.optionalKey(Schema.UndefinedOr(Schema.Number)),
  }),
})
const FinishPart = Schema.Struct({
  ...Response.FinishPart.fields,
  usage: Usage,
  response: Schema.optionalKey(Schema.UndefinedOr(Response.HttpResponseDetails)),
})
const StreamPart = Schema.Union([
  Response.TextStartPart,
  Response.TextDeltaPart,
  Response.TextEndPart,
  Response.ReasoningStartPart,
  Response.ReasoningDeltaPart,
  Response.ReasoningEndPart,
  Response.ToolParamsStartPart,
  Response.ToolParamsDeltaPart,
  Response.ToolParamsEndPart,
  Response.ToolApprovalRequestPart,
  Response.FilePart,
  Response.DocumentSourcePart,
  Response.UrlSourcePart,
  Response.ResponseMetadataPart,
  FinishPart,
  Response.ErrorPart,
  ToolCall,
  ToolResult,
])
const Part = Schema.Union([
  Response.TextPart,
  Response.ReasoningPart,
  Response.ToolApprovalRequestPart,
  Response.FilePart,
  Response.DocumentSourcePart,
  Response.UrlSourcePart,
  Response.ResponseMetadataPart,
  FinishPart,
  ToolCall,
  ToolResult,
])
const optionalMetadata = { metadata: Schema.optionalKey(Metadata) }
const ModelTelemetryEventSchema = Schema.Union([
  ModelTelemetry.ModelCallStarted,
  ModelTelemetry.ModelAttemptStarted,
  ModelTelemetry.ModelAttemptFirstOutput,
  Schema.Struct({ ...ModelTelemetry.ModelAttemptCompleted.fields, usage: Usage }),
  ModelTelemetry.ModelAttemptFailed,
  ModelTelemetry.ModelRetryScheduled,
  Schema.Struct({
    ...ModelTelemetry.ModelCallCompleted.fields,
    usage: Schema.optionalKey(Usage),
  }),
  ModelTelemetry.ModelCallFailed,
  ModelTelemetry.CompactionStarted,
  ModelTelemetry.CompactionCompleted,
  ModelTelemetry.CompactionFailed,
])
const AgentLoopEventSchema = Schema.Union([
  Schema.TaggedStruct("TurnStarted", { turn: Schema.Finite, ...optionalMetadata }),
  Schema.TaggedStruct("ModelPart", {
    turn: Schema.Finite,
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Finite,
    part: StreamPart,
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("ToolExecutionStarted", { turn: Schema.Finite, call: ToolCall, ...optionalMetadata }),
  Schema.TaggedStruct("ToolProgress", {
    turn: Schema.Finite,
    toolCallId: Schema.String,
    message: Schema.optionalKey(Schema.String),
    data: Schema.optionalKey(Metadata),
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("ToolExecutionCompleted", {
    turn: Schema.Finite,
    call: ToolCall,
    result: ToolResult,
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("HandoffRequested", {
    turn: Schema.Finite,
    handoffId: Schema.String,
    source: Schema.String,
    target: Schema.String,
    reason: Schema.optionalKey(Schema.String),
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("HandoffCompleted", {
    turn: Schema.Finite,
    handoffId: Schema.String,
    source: Schema.String,
    target: Schema.String,
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("HandoffRejected", {
    turn: Schema.Finite,
    handoffId: Schema.String,
    reason: Schema.String,
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("ApprovalRequested", { turn: Schema.Finite, call: ToolCall, ...optionalMetadata }),
  Schema.TaggedStruct("SteeringDrained", {
    turn: Schema.Finite,
    queue: Schema.Literals(["steering", "followUp"]),
    count: Schema.Finite,
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("TurnCompleted", {
    turn: Schema.Finite,
    transcript: Prompt.Prompt,
    usage: Schema.optionalKey(Usage),
    finishReason: Schema.optionalKey(Response.FinishReason),
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("StructuredOutput", {
    turn: Schema.Finite,
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Finite,
    value: Schema.Unknown,
    content: Schema.Array(Part),
    ...optionalMetadata,
  }),
  ModelTelemetryEventSchema,
])
const LifecycleEventSchema = Schema.Union([
  Schema.TaggedStruct("RunAccepted", { messageId: Schema.String, address: Address }),
  Schema.TaggedStruct("RunAttemptStarted", { attempt: Schema.Finite }),
  Schema.TaggedStruct("RunWaiting", { wait: RunWait }),
  Schema.TaggedStruct("RunResumed", { waitId: Schema.String, resolution: WaitResolution }),
  Schema.TaggedStruct("OperationUnknown", { operationId: Schema.String }),
  Schema.TaggedStruct("ChildLinked", { childRunId: RunId, invocationId: Schema.String }),
  Schema.TaggedStruct("ChildSettled", { childRunId: RunId, terminalEventId: Schema.String }),
  Schema.TaggedStruct("RunCompleted", { result: AgentResultSchema }),
  Schema.TaggedStruct("RunFailed", { error: RunFailure }),
  Schema.TaggedStruct("RunCancellationRequested", { reason: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("RunCancelled", { reason: Schema.optionalKey(Schema.String) }),
])
const EventPayload = Schema.Union([AgentLoopEventSchema, LifecycleEventSchema])
export const RunEvent: Schema.Codec<RunEvent, RunEvent, never, never> = Schema.declare(
  (value): value is RunEvent => Schema.is(RunEventBase)(value) && Schema.is(EventPayload)(value),
) as Schema.Codec<RunEvent, RunEvent, never, never>

export const eventIdFor = (runId: string, sequence: number): string => `${runId}:${sequence}`
