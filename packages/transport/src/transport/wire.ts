import { Effect, Schema, SchemaTransformation } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentEvent, ModelTelemetry, ToolExecutor, TurnPolicy } from "@batonfx/core"
import { WireEncodeFailed } from "./errors.js"

/** @experimental Canonical transport frame sequence and replay cursor schema. */
export const Sequence = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)
/** @experimental */
export type Sequence = typeof Sequence.Type
/** @experimental String representation of the canonical transport sequence. */
export const SequenceFromString = Schema.String.check(Schema.isPattern(/^\d+$/)).pipe(
  Schema.decodeTo(Sequence, SchemaTransformation.numberFromString),
)
export const SnapshotSequence = Schema.Union([Schema.Literals([-1]), Sequence])
export const Metadata = Schema.Record(Schema.String, Schema.Unknown)
export const OptionalMetadata = Schema.optionalKey(Metadata)

/** @experimental */
export type RunFailure =
  | ModelTelemetry.DeliveryFailed
  | AgentEvent.AgentError
  | AgentEvent.ResumeMismatch
  | TurnPolicy.TurnPolicyError
  | AgentEvent.TurnPolicyStopped
  | AgentEvent.TurnLimitExceeded
  | AgentEvent.MiddlewareViolation
  | ToolExecutor.FrameworkFailure
/** @experimental */
export const RunFailure: Schema.Schema<RunFailure> = Schema.Union([
  ModelTelemetry.DeliveryFailed,
  AgentEvent.AgentError,
  AgentEvent.ResumeMismatch,
  TurnPolicy.TurnPolicyError,
  AgentEvent.TurnPolicyStopped,
  AgentEvent.TurnLimitExceeded,
  AgentEvent.MiddlewareViolation,
  ToolExecutor.FrameworkFailure,
])

/** @experimental */
export type SessionStatus =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Running"; readonly turn: number }
  | { readonly _tag: "Suspended"; readonly suspension: AgentEvent.AgentSuspended }
  | { readonly _tag: "Failed"; readonly error: RunFailure }
/** @experimental */
export const SessionStatus: Schema.Schema<SessionStatus> = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Idle") }),
  Schema.Struct({ _tag: Schema.tag("Running"), turn: Schema.Finite }),
  Schema.Struct({ _tag: Schema.tag("Suspended"), suspension: AgentEvent.AgentSuspended }),
  Schema.Struct({ _tag: Schema.tag("Failed"), error: RunFailure }),
])
/** @experimental */
export const ClientApproval = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Approved") }),
  Schema.Struct({ _tag: Schema.tag("Denied"), reason: Schema.optionalKey(Schema.String) }),
])
/** @experimental */
export type ClientApproval = typeof ClientApproval.Type
/** @experimental */
export const ClientFrame = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Attach"), sessionId: Schema.String, afterSeq: Schema.optionalKey(Sequence) }),
  Schema.Struct({ _tag: Schema.tag("SendMessage"), sessionId: Schema.String, prompt: Schema.String }),
  Schema.Struct({
    _tag: Schema.tag("ResolveApproval"),
    sessionId: Schema.String,
    token: Schema.String,
    decision: ClientApproval,
  }),
  Schema.Struct({ _tag: Schema.tag("Cancel"), sessionId: Schema.String }),
])
/** @experimental */
export type ClientFrameType = typeof ClientFrame.Type

type WireToolCall = {
  readonly type: "tool-call"
  readonly id: string
  readonly name: string
  readonly params: unknown
  readonly providerExecuted?: boolean
  readonly metadata?: Readonly<Record<string, unknown>>
}
type WireToolResult = {
  readonly type: "tool-result"
  readonly id: string
  readonly name: string
  readonly result: unknown
  readonly encodedResult?: unknown
  readonly isFailure: boolean
  readonly providerExecuted?: boolean
  readonly preliminary?: boolean
  readonly metadata?: Readonly<Record<string, unknown>>
}
type WireResponsePart = Response.StreamPart<Record<string, Tool.Any>> | WireToolCall | WireToolResult
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null
const isWireToolCall = (value: unknown): value is WireToolCall =>
  isRecord(value) &&
  value.type === "tool-call" &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  "params" in value
export const LooseToolCallPart: Schema.Schema<WireToolCall> = Schema.declare(isWireToolCall)
type WireTelemetry = typeof ModelTelemetry.Event.Type
const StructuralTelemetry: Schema.Schema<WireTelemetry> = Schema.declare(
  (value): value is WireTelemetry =>
    (isRecord(value) && typeof value._tag === "string" && value._tag.startsWith("Model")) ||
    (isRecord(value) && typeof value._tag === "string" && value._tag.startsWith("Compaction")),
)
const StructuralPart: Schema.Schema<WireResponsePart> = Schema.declare(
  (value): value is WireResponsePart => isRecord(value) && typeof value.type === "string",
)
const isWireToolResult = (value: unknown): value is WireToolResult =>
  isRecord(value) &&
  value.type === "tool-result" &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  "result" in value &&
  typeof value.isFailure === "boolean"
export const LooseToolResultPart: Schema.Schema<WireToolResult> = Schema.declare(isWireToolResult)

const StructuralEvent = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("TurnStarted"), turn: Schema.Finite, metadata: OptionalMetadata }),
  Schema.Struct({
    _tag: Schema.tag("ModelPart"),
    turn: Schema.Finite,
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    part: StructuralPart,
    metadata: OptionalMetadata,
  }),
  StructuralTelemetry,
  Schema.Struct({
    _tag: Schema.tag("ToolExecutionStarted"),
    turn: Schema.Finite,
    call: LooseToolCallPart,
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("ToolProgress"),
    turn: Schema.Finite,
    toolCallId: Schema.String,
    message: Schema.optionalKey(Schema.String),
    data: Schema.optionalKey(Metadata),
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("ToolExecutionCompleted"),
    turn: Schema.Finite,
    call: LooseToolCallPart,
    result: LooseToolResultPart,
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("ApprovalRequested"),
    turn: Schema.Finite,
    call: LooseToolCallPart,
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("SteeringDrained"),
    turn: Schema.Finite,
    queue: Schema.Literals(["steering", "followUp"]),
    count: Schema.Finite,
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("TurnCompleted"),
    turn: Schema.Finite,
    transcript: Schema.optionalKey(Prompt.Prompt),
    usage: Schema.optionalKey(Response.Usage),
    finishReason: Schema.optionalKey(Response.FinishReason),
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("StructuredOutput"),
    turn: Schema.Finite,
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    value: Schema.Unknown,
    content: Schema.Array(Schema.Unknown),
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("Completed"),
    turns: Schema.Finite,
    text: Schema.String,
    transcript: Schema.optionalKey(Prompt.Prompt),
    usage: Schema.optionalKey(Response.Usage),
    metadata: OptionalMetadata,
  }),
])

const StructuralSuspension = Schema.Struct({
  _tag: Schema.tag("@batonfx/core/AgentSuspended"),
  token: Schema.String,
  reason: Schema.Literals(["tool-wait", "approval"]),
  tool_call_index: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  tool_call_id: Schema.String,
  tool_name: Schema.String,
  tool_params: Schema.Unknown,
  tool_call_batch: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("tool-call"),
      id: Schema.String,
      name: Schema.String,
      params: Schema.Unknown,
      providerExecuted: Schema.Boolean,
      metadata: Response.ProviderMetadata,
    }),
  ),
  active_tools: Schema.optional(Schema.Array(Schema.String)),
  activated_skills: Schema.optional(Schema.Array(Schema.String)),
})
const StructuralFrameSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Event"), seq: Sequence, event: StructuralEvent }),
  Schema.Struct({ _tag: Schema.tag("Failed"), seq: Sequence, error: RunFailure }),
  Schema.Struct({ _tag: Schema.tag("Suspended"), seq: Sequence, suspension: StructuralSuspension }),
  Schema.Struct({ _tag: Schema.tag("Ended"), seq: Sequence }),
  Schema.Struct({ _tag: Schema.tag("Snapshot"), seq: SnapshotSequence, transcript: Prompt.Prompt }),
  Schema.Struct({ _tag: Schema.tag("SessionStatus"), seq: Sequence, status: SessionStatus }),
])

/** @experimental Event type for runtime-dynamic tool names and payloads. */
export type LooseEventType = Schema.Schema.Type<typeof StructuralEvent>
/** @experimental Wire event type for fixed-tool frames. */
export type EventType = LooseEventType & { readonly __batonFixedEvent?: never }
/** @experimental */
const telemetryTags = new Set([
  "ModelCallStarted",
  "ModelAttemptStarted",
  "ModelAttemptFirstOutput",
  "ModelAttemptCompleted",
  "ModelAttemptFailed",
  "ModelRetryScheduled",
  "ModelCallCompleted",
  "ModelCallFailed",
  "CompactionStarted",
  "CompactionCompleted",
  "CompactionFailed",
])
const isStructuralEvent = (value: unknown): value is Schema.Schema.Type<typeof StructuralEvent> => {
  if (!isRecord(value) || typeof value._tag !== "string") return false
  const finiteTurn = typeof value.turn === "number" && Number.isFinite(value.turn)
  switch (value._tag) {
    case "TurnStarted":
      return finiteTurn
    case "ModelPart":
      return finiteTurn && isRecord(value.part) && typeof value.part.type === "string"
    case "ToolExecutionStarted":
    case "ApprovalRequested":
      return finiteTurn && isWireToolCall(value.call)
    case "ToolExecutionCompleted":
      return finiteTurn && isWireToolCall(value.call) && isWireToolResult(value.result)
    case "ToolProgress":
      return finiteTurn && typeof value.toolCallId === "string"
    case "SteeringDrained":
      return finiteTurn && (value.queue === "steering" || value.queue === "followUp")
    case "TurnCompleted":
      return finiteTurn
    case "StructuredOutput":
      return finiteTurn && Array.isArray(value.content)
    case "Completed":
      return typeof value.turns === "number" && Number.isFinite(value.turns) && typeof value.text === "string"
    default:
      return telemetryTags.has(value._tag)
  }
}
const StructuralFrame: Schema.Codec<
  Schema.Schema.Type<typeof StructuralFrameSchema>,
  Schema.Schema.Type<typeof StructuralFrameSchema>,
  never,
  never
> = Schema.declare((value): value is Schema.Schema.Type<typeof StructuralFrameSchema> => {
  if (!isRecord(value) || typeof value._tag !== "string") return false
  const validSequence = typeof value.seq === "number" && Number.isSafeInteger(value.seq) && value.seq >= 0
  if (value._tag === "Snapshot") {
    return (validSequence || value.seq === -1) && isRecord(value.transcript) && Array.isArray(value.transcript.content)
  }
  if (!validSequence) return false
  if (value._tag === "Event") return isStructuralEvent(value.event)
  if (value._tag === "Ended") return true
  if (value._tag === "Failed" || value._tag === "Suspended" || value._tag === "SessionStatus") return true
  return false
})
/** @experimental */
export type LooseServerFrameType = Schema.Schema.Type<typeof StructuralFrame>
/** @experimental */
export type ServerFrameType = LooseServerFrameType & { readonly __batonFixedFrame?: never }

/** @experimental Structural event schema used for public wire introspection. */
export function EventSchema<T extends ToolkitInput>(toolkit: T) {
  return makeEventSchema(toolkit)
}
/** @experimental Structural event schema for dynamic tool payloads. */
export const LooseEventSchema = makeEventSchema(undefined)
/** @experimental Structural server frame schema. */
export function ServerFrame<T extends ToolkitInput>(toolkit: T) {
  return makeFrameSchema(toolkit)
}
/** @experimental Structural loose server frame schema. */
export const LooseServerFrame = makeFrameSchema(undefined)

export type ToolkitInput = Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>
type ToolkitTools<T extends ToolkitInput> =
  T extends Toolkit.WithHandler<infer Tools> ? Tools : T extends Toolkit.Toolkit<infer Tools> ? Tools : never
type ToolFailureSchema<T extends Tool.Any> =
  T extends Tool.Tool<string, infer Config, infer _Requirements> ? Config["failure"] : Schema.Never
type ToolSchemaServices<T extends Tool.Any> =
  | Tool.ParametersSchema<T>["EncodingServices"]
  | Tool.ParametersSchema<T>["DecodingServices"]
  | Tool.SuccessSchema<T>["EncodingServices"]
  | Tool.SuccessSchema<T>["DecodingServices"]
  | ToolFailureSchema<T>["EncodingServices"]
  | ToolFailureSchema<T>["DecodingServices"]
type ToolkitServicesForTools<Tools extends Record<string, Tool.Any>> = [keyof Tools] extends [never]
  ? never
  : Tools[keyof Tools] extends infer ToolValue
    ? ToolValue extends Tool.Any
      ? ToolSchemaServices<ToolValue>
      : never
    : never
export type ToolkitServices<T extends ToolkitInput> =
  ToolkitTools<T> extends infer Tools
    ? Tools extends Record<string, Tool.Any>
      ? ToolkitServicesForTools<Tools>
      : never
    : never

/** @experimental Lazy wire codec. Encoding and decoding services are carried by the effect channels. */
export interface WireCodec<Frame = ServerFrameType, R = never> {
  readonly encodeServer: (frame: Frame) => Effect.Effect<string, WireEncodeFailed, R>
  readonly encodeClient: (frame: ClientFrameType) => Effect.Effect<string, WireEncodeFailed>
  readonly decodeServer: (data: string) => Effect.Effect<Frame, WireEncodeFailed, R>
  readonly decodeClient: (data: string) => Effect.Effect<ClientFrameType, WireEncodeFailed>
}

import { makeEventSchema, makeFixedCodec, makeDynamicCodec, makeFrameSchema, makeSchemaCodec } from "./wire-codec.js"

/** @experimental Fixed startup-toolkit or runtime-dynamic server-frame validation policy. */
export type Capability<T extends ToolkitInput = ToolkitInput> =
  | { readonly capability: "fixed"; readonly toolkit: T }
  | { readonly capability: "runtime-dynamic" }

/** @experimental Builds an effectful codec from a concrete schema, preserving its services. */
export function codecEffect<S extends Schema.Constraint>(
  schema: S,
): WireCodec<S["Type"], S["EncodingServices"] | S["DecodingServices"]>
/** @experimental Builds an effectful fixed codec from a toolkit. */
export function codecEffect<T extends ToolkitInput>(
  toolkit: T,
): WireCodec<ServerFrameType | LooseServerFrameType, ToolkitServices<T>>
export function codecEffect(input: Schema.Constraint | ToolkitInput) {
  return "ast" in input ? makeSchemaCodec(input) : makeFixedCodec(input)
}
/** @experimental Builds a fixed codec, exposing any tool schema services in its effect requirement. */
export function codec<T extends ToolkitInput>(
  toolkit: T,
): WireCodec<ServerFrameType | LooseServerFrameType, ToolkitServices<T>>
/** @experimental Builds a synchronous dynamic codec. */
export function codec(capability: { readonly capability: "runtime-dynamic" }): WireCodec<LooseServerFrameType, never>
/** @experimental Builds a codec from a capability. */
export function codec<T extends ToolkitInput>(
  capability: Capability<T>,
): WireCodec<ServerFrameType | LooseServerFrameType, ToolkitServices<T>>
export function codec(
  input:
    | ToolkitInput
    | { readonly capability: "fixed"; readonly toolkit: ToolkitInput }
    | { readonly capability: "runtime-dynamic" },
) {
  if ("tools" in input) return makeFixedCodec(input)
  return input.capability === "runtime-dynamic" ? makeDynamicCodec() : makeFixedCodec(input.toolkit)
}
