import { Effect, Function, Schema, SchemaParser } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { ExecutableRef } from "./executable-manifest.js"
import type { DurableAgentLoopEvent } from "./agent-event.js"
import type { ExecutionResult } from "./execution-state.js"
import { ExecutionResult as ExecutionResultSchema, RunFailure as RunFailureSchema, RunId } from "./run.js"
import { RunWait, WaitResolution } from "./run-wait.js"
import { Address } from "./address.js"
import { AgentEvent, ModelTelemetry } from "@batonfx/core"
import { FanOutJoin, FanOutMemberOrigin, FanOutRemainder, type FanOutMemberOrigin as FanOutOrigin } from "./fan-out.js"
import { ChildReadiness } from "./child-readiness.js"

export type { DurableAgentLoopEvent, ExecutionResult }

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
  executableRef: ExecutableRef,
  attemptId: Schema.optionalKey(Schema.String),
  rootRunId: RunId,
  parentRunId: Schema.optionalKey(RunId),
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  causationId: Schema.optionalKey(Schema.String),
  correlationId: Schema.optionalKey(Schema.String),
  occurredAt: Schema.String,
})
export type RunEventBase = typeof RunEventBase.Type

export { ExecutionResultSchema }
export const RunFailure: Schema.Codec<RunFailure, unknown> = RunFailureSchema
export type RunFailure = import("./run.js").RunFailure

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
/** @experimental Exact durable steering admission fact. */
export type SteeringAccepted = RunEventBase & {
  readonly _tag: "SteeringAccepted"
  readonly entryId: string
  readonly steeringSequence: number
  readonly idempotencyKey: string
  readonly digest: string
  readonly prompt: Prompt.Prompt
}
/** @experimental Exact durable steering consumption fact. */
export type SteeringConsumed = RunEventBase & {
  readonly _tag: "SteeringConsumed"
  readonly entryIds: ReadonlyArray<string>
  readonly operationId: string
}
/** @experimental Terminal disposition category for accepted steering. */
export const SteeringDiscardReason = Schema.Literals(["completed", "failed", "cancelled"])
/** @experimental Terminal disposition category for accepted steering. */
export type SteeringDiscardReason = typeof SteeringDiscardReason.Type
/** @experimental Exact terminal disposition fact for unconsumed steering. */
export type SteeringDiscarded = RunEventBase & {
  readonly _tag: "SteeringDiscarded"
  readonly entryIds: ReadonlyArray<string>
  readonly reason: SteeringDiscardReason
}
export type OperationUnknown = RunEventBase & {
  readonly _tag: "OperationUnknown"
  readonly operationId: string
}
export type ChildLinked = RunEventBase & {
  readonly _tag: "ChildLinked"
  readonly childRunId: string
  readonly invocationId: string
  readonly selection: string
  readonly prompt: Prompt.Prompt
  readonly childDepth: number
  readonly readiness: ChildReadiness
  readonly key?: string
  readonly label?: string
  readonly origin?: FanOutOrigin
}
export type ChildReadinessChanged = RunEventBase & {
  readonly _tag: "ChildReadinessChanged"
  readonly childRunId: string
  readonly readiness: ChildReadiness
}
export type ChildSettled = RunEventBase & {
  readonly _tag: "ChildSettled"
  readonly childRunId: string
  readonly terminalEventId: string
}
export type FanOutAdmitted = RunEventBase & {
  readonly _tag: "FanOutAdmitted"
  readonly fanOutId: string
  readonly memberCount: number
  readonly concurrency: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}
export type FanOutJoined = RunEventBase & {
  readonly _tag: "FanOutJoined"
  readonly fanOutId: string
  readonly status: "succeeded" | "failed" | "cancelled"
  readonly succeeded: number
  readonly failed: number
  readonly cancelled: number
  readonly abandoned: number
  readonly remainder: ReadonlyArray<{
    readonly childRunId: string
    readonly action: "cancellation-requested" | "abandoned"
  }>
}
export type RunCompleted = RunEventBase & {
  readonly _tag: "RunCompleted"
  readonly result: ExecutionResult
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
export type ProgramLog = RunEventBase & {
  readonly _tag: "ProgramLog"
  readonly operation: string
  readonly level: "debug" | "info" | "warn" | "error"
  readonly message: string
  readonly data?: Readonly<Record<string, unknown>>
}

export type LifecycleEvent =
  | RunAccepted
  | RunAttemptStarted
  | RunWaiting
  | RunResumed
  | SteeringAccepted
  | SteeringConsumed
  | SteeringDiscarded
  | OperationUnknown
  | ChildLinked
  | ChildReadinessChanged
  | ChildSettled
  | FanOutAdmitted
  | FanOutJoined
  | RunCompleted
  | RunFailed
  | RunCancellationRequested
  | RunCancelled
  | ProgramLog

export type RunEvent = (RunEventBase & DurableAgentLoopEvent) | LifecycleEvent

export const LifecycleTag = Schema.Literals([
  "RunAccepted",
  "RunAttemptStarted",
  "RunWaiting",
  "RunResumed",
  "SteeringAccepted",
  "SteeringConsumed",
  "SteeringDiscarded",
  "OperationUnknown",
  "ChildLinked",
  "ChildReadinessChanged",
  "ChildSettled",
  "FanOutAdmitted",
  "FanOutJoined",
  "RunCompleted",
  "RunFailed",
  "RunCancellationRequested",
  "RunCancelled",
  "ProgramLog",
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
    uncached: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    total: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    cacheRead: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    cacheWrite: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
  }),
  outputTokens: Schema.Struct({
    total: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    text: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
    reasoning: Schema.optionalKey(Schema.UndefinedOr(Schema.Finite)),
  }),
})
const FinishPart = Schema.Struct({
  ...Response.FinishPart.fields,
  usage: Usage,
  response: Schema.optionalKey(Schema.UndefinedOr(Response.HttpResponseDetails)),
})
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
  ModelTelemetry.ModelFallbackScheduled,
  Schema.Struct({
    ...ModelTelemetry.ModelCallCompleted.fields,
    usage: Schema.optionalKey(Usage),
  }),
  ModelTelemetry.ModelCallFailed,
  ModelTelemetry.CompactionStarted,
  ModelTelemetry.CompactionSkipped,
  ModelTelemetry.CompactionApplied,
  ModelTelemetry.CompactionFailed,
])
export const CompletedModelResponse = Schema.Struct({
  content: Schema.Array(Part),
  usage: Schema.optionalKey(Usage),
  finishReason: Schema.optionalKey(Response.FinishReason),
})
export type CompletedModelResponse = typeof CompletedModelResponse.Type

const AgentLoopEventSchema = Schema.Union([
  Schema.TaggedStruct("TurnStarted", { turn: Schema.Finite, ...optionalMetadata }),
  Schema.TaggedStruct("ModelResponseCommitted", {
    turn: Schema.Finite,
    operationKey: Schema.String,
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Finite,
    response: CompletedModelResponse,
    digest: Schema.String,
    ...optionalMetadata,
  }),
  Schema.TaggedStruct("ModelResponseInterrupted", {
    turn: Schema.Finite,
    operationKey: Schema.String,
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Finite,
    response: CompletedModelResponse,
    reason: Schema.Literals(["cancel", "failure"]),
    digest: Schema.String,
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
  Schema.TaggedStruct("ApprovalRequested", {
    turn: Schema.Finite,
    call: ToolCall,
    request: AgentEvent.ApprovalRequest,
    ...optionalMetadata,
  }),
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
  Schema.TaggedStruct("SteeringAccepted", {
    entryId: Schema.String,
    steeringSequence: Sequence,
    idempotencyKey: Schema.String,
    digest: Schema.String,
    prompt: Prompt.Prompt,
  }),
  Schema.TaggedStruct("SteeringConsumed", {
    entryIds: Schema.Array(Schema.String),
    operationId: Schema.String,
  }),
  Schema.TaggedStruct("SteeringDiscarded", {
    entryIds: Schema.Array(Schema.String),
    reason: SteeringDiscardReason,
  }),
  Schema.TaggedStruct("OperationUnknown", { operationId: Schema.String }),
  Schema.TaggedStruct("ChildLinked", {
    childRunId: RunId,
    invocationId: Schema.String,
    selection: Schema.String,
    prompt: Prompt.Prompt,
    childDepth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    readiness: ChildReadiness,
    key: Schema.optionalKey(Schema.String),
    label: Schema.optionalKey(Schema.String),
    origin: Schema.optionalKey(FanOutMemberOrigin),
  }),
  Schema.TaggedStruct("ChildReadinessChanged", { childRunId: RunId, readiness: ChildReadiness }),
  Schema.TaggedStruct("ChildSettled", { childRunId: RunId, terminalEventId: Schema.String }),
  Schema.TaggedStruct("FanOutAdmitted", {
    fanOutId: Schema.String,
    memberCount: Schema.Finite,
    concurrency: Schema.Finite,
    join: FanOutJoin,
    remainder: FanOutRemainder,
  }),
  Schema.TaggedStruct("FanOutJoined", {
    fanOutId: Schema.String,
    status: Schema.Literals(["succeeded", "failed", "cancelled"]),
    succeeded: Schema.Finite,
    failed: Schema.Finite,
    cancelled: Schema.Finite,
    abandoned: Schema.Finite,
    remainder: Schema.Array(
      Schema.Struct({
        childRunId: RunId,
        action: Schema.Literals(["cancellation-requested", "abandoned"]),
      }),
    ),
  }),
  Schema.TaggedStruct("RunCompleted", { result: ExecutionResultSchema }),
  Schema.TaggedStruct("RunFailed", { error: RunFailure }),
  Schema.TaggedStruct("RunCancellationRequested", { reason: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("RunCancelled", { reason: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("ProgramLog", {
    operation: Schema.String,
    level: Schema.Literals(["debug", "info", "warn", "error"]),
    message: Schema.String,
    data: Schema.optionalKey(Metadata),
  }),
])
const EventPayload = Schema.Union([AgentLoopEventSchema, LifecycleEventSchema])
type RunEventEncoded = typeof RunEventBase.Encoded & typeof EventPayload.Encoded
export const RunEvent: Schema.Codec<RunEvent, RunEventEncoded> = Schema.declareConstructor<RunEvent, RunEventEncoded>()(
  [RunEventBase, EventPayload],
  ([baseCodec, payloadCodec]) =>
    (input, _ast, options) =>
      Effect.zipWith(
        SchemaParser.decodeUnknownEffect(baseCodec)(input, options),
        SchemaParser.decodeUnknownEffect(payloadCodec)(input, options),
        (base, payload) => ({ ...base, ...payload }) as RunEvent,
      ),
)

export const eventIdFor: {
  (sequence: number): (runId: string) => string
  (runId: string, sequence: number): string
} = Function.dual(2, (runId: string, sequence: number): string => `${runId}:${sequence}`)
