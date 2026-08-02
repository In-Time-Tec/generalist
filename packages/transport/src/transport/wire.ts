import { Effect, Schema, SchemaTransformation } from "effect"
import { Response, Tool, Toolkit } from "effect/unstable/ai"
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
const SnapshotSequence = Schema.Union([Schema.Literals([-1]), Sequence])

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
  | { readonly _tag: "Suspended"; readonly suspension: any }
  | { readonly _tag: "Failed"; readonly error: any }
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

const Metadata = Schema.Record(Schema.String, Schema.Unknown)
const OptionalMetadata = Schema.optionalKey(Metadata)
const LooseToolCallPart = Schema.Struct({
  type: Schema.tag("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.optionalKey(Schema.Boolean),
  metadata: OptionalMetadata,
})
const LooseToolResultPart = Schema.Struct({
  type: Schema.tag("tool-result"),
  id: Schema.String,
  name: Schema.String,
  result: Schema.Unknown,
  encodedResult: Schema.optionalKey(Schema.Unknown),
  isFailure: Schema.Boolean,
  providerExecuted: Schema.optionalKey(Schema.Boolean),
  preliminary: Schema.optionalKey(Schema.Boolean),
  metadata: OptionalMetadata,
})

const StructuralPart = Schema.Unknown
const StructuralResponsePart = Schema.Unknown
const isTelemetryTag = (tag: unknown): boolean =>
  tag === "ModelCallStarted" ||
  tag === "ModelAttemptStarted" ||
  tag === "ModelAttemptFirstOutput" ||
  tag === "ModelAttemptCompleted" ||
  tag === "ModelAttemptFailed" ||
  tag === "ModelRetryScheduled" ||
  tag === "ModelCallCompleted" ||
  tag === "ModelCallFailed" ||
  tag === "CompactionStarted" ||
  tag === "CompactionCompleted" ||
  tag === "CompactionFailed"
const StructuralTelemetry = Schema.Record(Schema.String, Schema.Unknown).pipe(
  Schema.check(Schema.makeFilter((event) => isTelemetryTag(event._tag) || "Expected telemetry event")),
)
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
    transcript: Schema.optionalKey(Schema.Unknown),
    usage: Schema.optionalKey(Schema.Unknown),
    finishReason: Schema.optionalKey(Schema.Unknown),
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("StructuredOutput"),
    turn: Schema.Finite,
    modelCallId: Schema.String,
    modelAttemptId: Schema.String,
    attempt: Schema.Int,
    value: Schema.Unknown,
    content: Schema.Array(StructuralResponsePart),
    metadata: OptionalMetadata,
  }),
  Schema.Struct({
    _tag: Schema.tag("Completed"),
    turns: Schema.Finite,
    text: Schema.String,
    transcript: Schema.optionalKey(Schema.Unknown),
    usage: Schema.optionalKey(Schema.Unknown),
    metadata: OptionalMetadata,
  }),
])

/** @experimental Event type for runtime-dynamic tool names and payloads. */
export type LooseEventType = any
/** @experimental Wire event type. */
export type EventType = any
/** @experimental */
export type ServerFrameType =
  | { readonly _tag: "Event"; readonly seq: number; readonly event: EventType }
  | { readonly _tag: "Failed"; readonly seq: number; readonly error: any }
  | { readonly _tag: "Suspended"; readonly seq: number; readonly suspension: any }
  | { readonly _tag: "Ended"; readonly seq: number }
  | { readonly _tag: "Snapshot"; readonly seq: number; readonly transcript: any }
  | { readonly _tag: "SessionStatus"; readonly seq: number; readonly status: any }
/** @experimental */
export type LooseServerFrameType =
  | { readonly _tag: "Event"; readonly seq: number; readonly event: LooseEventType }
  | { readonly _tag: "Failed"; readonly seq: number; readonly error: any }
  | { readonly _tag: "Suspended"; readonly seq: number; readonly suspension: any }
  | { readonly _tag: "Ended"; readonly seq: number }
  | { readonly _tag: "Snapshot"; readonly seq: number; readonly transcript: any }
  | { readonly _tag: "SessionStatus"; readonly seq: number; readonly status: any }

/** @experimental Structural event schema; fixed codecs add concrete tool schemas in a second stage. */
export const EventSchema = StructuralEvent
/** @experimental Structural event schema for dynamic tool payloads. */
export const LooseEventSchema = StructuralEvent
const StructuralFrame = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Event"), seq: Sequence, event: StructuralEvent }),
  Schema.Struct({ _tag: Schema.tag("Failed"), seq: Sequence, error: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.tag("Suspended"), seq: Sequence, suspension: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.tag("Ended"), seq: Sequence }),
  Schema.Struct({ _tag: Schema.tag("Snapshot"), seq: SnapshotSequence, transcript: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.tag("SessionStatus"), seq: Sequence, status: Schema.Unknown }),
])
/** @experimental Structural server frame schema. */
export function ServerFrame<T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(_toolkit: T) {
  return StructuralFrame
}
/** @experimental Structural loose server frame schema. */
export const LooseServerFrame = StructuralFrame

/** @experimental Fixed startup-toolkit or runtime-dynamic server-frame validation policy. */
export type Capability<
  T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>> =
    | Toolkit.Any
    | Toolkit.WithHandler<Record<string, Tool.Any>>,
> = { readonly capability: "fixed"; readonly toolkit: T } | { readonly capability: "runtime-dynamic" }

/** @experimental Lazy wire codec. Encoding and decoding services are carried by the effect channels. */
export interface WireCodec<Frame = ServerFrameType, R = never> {
  readonly encodeServer: (frame: Frame) => Effect.Effect<string, WireEncodeFailed, R>
  readonly encodeClient: (frame: ClientFrameType) => Effect.Effect<string, WireEncodeFailed>
  readonly decodeServer: (data: string) => Effect.Effect<Frame, WireEncodeFailed, R>
  readonly decodeClient: (data: string) => Effect.Effect<ClientFrameType, WireEncodeFailed>
}

const encodeError = (error: unknown): WireEncodeFailed => WireEncodeFailed.make({ message: String(error) })
const missingTool = (name: string): Effect.Effect<never, WireEncodeFailed> =>
  Effect.fail(WireEncodeFailed.make({ message: `Tool '${name}' is not declared by the fixed toolkit` }))

type ToolkitInput = Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>
type ToolkitServices = unknown

type Direction = "encode" | "decode"
const toolPart = (toolkit: ToolkitInput, part: any, direction: Direction) => {
  if (part.type !== "tool-call" && part.type !== "tool-result") return Effect.succeed(part)
  const tools = Object.values(toolkit.tools)
  const tool = tools.find((candidate) => candidate.name === part.name)
  if (tool === undefined) return missingTool(part.name)
  const schema =
    part.type === "tool-call"
      ? Response.ToolCallPart(tool.name, tool.parametersSchema)
      : Response.ToolResultPart(
          tool.name,
          part.isFailure ? Schema.Never : tool.successSchema,
          part.isFailure ? tool.failureSchema : Schema.Never,
        )
  return direction === "encode"
    ? Schema.encodeUnknownEffect(schema)(part).pipe(Effect.mapError(encodeError))
    : Schema.decodeUnknownEffect(schema)(part).pipe(Effect.mapError(encodeError))
}

const mapEvent = (toolkit: ToolkitInput, event: any, direction: Direction) => {
  const mapPart = (part: any) => toolPart(toolkit, part, direction)
  switch (event._tag) {
    case "ModelPart":
      return mapPart(event.part).pipe(Effect.map((part) => ({ ...event, part })))
    case "ToolExecutionStarted":
    case "ApprovalRequested":
      return mapPart(event.call).pipe(Effect.map((call) => ({ ...event, call })))
    case "ToolExecutionCompleted":
      return Effect.all({ call: mapPart(event.call), result: mapPart(event.result) }).pipe(
        Effect.map(({ call, result }) => ({ ...event, call, result })),
      )
    case "StructuredOutput":
      return Effect.forEach(event.content, mapPart).pipe(Effect.map((content) => ({ ...event, content })))
    default:
      return Effect.succeed(event)
  }
}

const mapFrame = (toolkit: ToolkitInput, frame: any, direction: Direction) => {
  if (frame._tag === "Event") {
    return mapEvent(toolkit, frame.event, direction).pipe(Effect.map((event) => ({ ...frame, event })))
  }
  if (direction === "decode" && frame._tag === "Failed") {
    return Schema.decodeUnknownEffect(RunFailure)(frame.error).pipe(Effect.map((error) => ({ ...frame, error })))
  }
  if (direction === "decode" && frame._tag === "Suspended") {
    return Schema.decodeUnknownEffect(AgentEvent.AgentSuspended)(frame.suspension).pipe(
      Effect.map((suspension) => ({ ...frame, suspension })),
    )
  }
  if (direction === "decode" && frame._tag === "SessionStatus") {
    return Schema.decodeUnknownEffect(SessionStatus)(frame.status).pipe(Effect.map((status) => ({ ...frame, status })))
  }
  return Effect.succeed(frame)
}

const makeDynamicCodec = (): WireCodec<LooseServerFrameType, never> => ({
  encodeServer: (frame) =>
    Schema.encodeUnknownEffect(Schema.fromJsonString(StructuralFrame))(frame).pipe(Effect.mapError(encodeError)),
  encodeClient: (frame) =>
    Schema.encodeEffect(Schema.fromJsonString(ClientFrame))(frame).pipe(Effect.mapError(encodeError)),
  decodeServer: (data) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(StructuralFrame))(data).pipe(Effect.mapError(encodeError)),
  decodeClient: (data) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(ClientFrame))(data).pipe(Effect.mapError(encodeError)),
})

const makeCodec = (toolkit: ToolkitInput): WireCodec<ServerFrameType | LooseServerFrameType, ToolkitServices> => ({
  encodeServer: (frame) =>
    mapFrame(toolkit, frame, "encode").pipe(
      Effect.mapError(encodeError),
      Effect.flatMap((mapped) => Schema.encodeUnknownEffect(Schema.fromJsonString(StructuralFrame))(mapped)),
      Effect.mapError(encodeError),
    ),
  encodeClient: (frame) =>
    Schema.encodeEffect(Schema.fromJsonString(ClientFrame))(frame).pipe(Effect.mapError(encodeError)),
  decodeServer: (data) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(StructuralFrame))(data).pipe(
      Effect.flatMap((frame) => mapFrame(toolkit, frame, "decode").pipe(Effect.mapError(encodeError))),
      Effect.mapError(encodeError),
    ),
  decodeClient: (data) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(ClientFrame))(data).pipe(Effect.mapError(encodeError)),
})

const makeSchemaCodec = <S extends Schema.Constraint>(
  schema: S,
): WireCodec<S["Type"], S["EncodingServices"] | S["DecodingServices"]> => ({
  encodeServer: (frame) =>
    Schema.encodeUnknownEffect(Schema.fromJsonString(schema))(frame).pipe(Effect.mapError(encodeError)),
  encodeClient: (frame) =>
    Schema.encodeEffect(Schema.fromJsonString(ClientFrame))(frame).pipe(Effect.mapError(encodeError)),
  decodeServer: (data) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(data).pipe(Effect.mapError(encodeError)),
  decodeClient: (data) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(ClientFrame))(data).pipe(Effect.mapError(encodeError)),
})

/** @experimental Builds an effectful codec from a concrete schema, preserving its services. */
export function codecEffect<S extends Schema.Constraint>(
  schema: S,
): WireCodec<S["Type"], S["EncodingServices"] | S["DecodingServices"]>
/** @experimental Builds an effectful fixed codec from a toolkit. */
export function codecEffect(toolkit: ToolkitInput): WireCodec<ServerFrameType | LooseServerFrameType, unknown>
export function codecEffect(input: Schema.Constraint | ToolkitInput) {
  return "ast" in input ? makeSchemaCodec(input) : makeCodec(input)
}
/** @experimental Builds a synchronous fixed codec for service-free toolkits. */
export function codec(toolkit: ToolkitInput): WireCodec<ServerFrameType | LooseServerFrameType, never>
/** @experimental Builds a synchronous dynamic codec. */
export function codec(capability: { readonly capability: "runtime-dynamic" }): WireCodec<LooseServerFrameType, never>
/** @experimental Builds a synchronous codec from a capability. */
export function codec<T extends ToolkitInput>(
  capability: Capability<T>,
): WireCodec<ServerFrameType | LooseServerFrameType, never>
export function codec(
  input:
    | ToolkitInput
    | { readonly capability: "fixed"; readonly toolkit: ToolkitInput }
    | { readonly capability: "runtime-dynamic" },
) {
  if ("tools" in input) return makeCodec(input)
  return input.capability === "runtime-dynamic" ? makeDynamicCodec() : makeCodec(input.toolkit)
}
