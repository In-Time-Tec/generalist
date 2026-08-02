import { Effect, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { AgentEvent, ModelTelemetry } from "@batonfx/core"
import { WireEncodeFailed } from "./errors.js"
import {
  ClientFrame,
  RunFailure,
  SessionStatus,
  Sequence,
  SnapshotSequence,
  Metadata,
  OptionalMetadata,
  LooseToolCallPart,
  LooseToolResultPart,
  type ClientFrameType,
  type ToolkitInput,
  type ToolkitServices,
  type ServerFrameType,
  type LooseServerFrameType,
  type WireCodec,
} from "./wire.js"

const encodeError = (error: unknown): WireEncodeFailed =>
  WireEncodeFailed.make({ message: error instanceof Error ? error.message : String(error) })
const missingTool = (name: string): Effect.Effect<never, WireEncodeFailed> =>
  Effect.fail(WireEncodeFailed.make({ message: `Tool '${name}' is not declared by the fixed toolkit` }))
const jsonValue = Schema.fromJsonString(Schema.Unknown)
const encodeJson = (value: unknown): Effect.Effect<string, unknown> =>
  Effect.try({
    try: () => {
      const encoded = JSON.stringify(value)
      if (encoded === undefined) throw new TypeError("Value is not JSON encodable")
      return encoded
    },
    catch: (error) => error,
  })
const decodeJson = (value: string): Effect.Effect<unknown, Schema.SchemaError> =>
  Schema.decodeUnknownEffect(jsonValue)(value)

const eventSchema = (tag: string): Schema.Constraint | undefined => {
  switch (tag) {
    case "TurnStarted":
      return Schema.Struct({ _tag: Schema.tag("TurnStarted"), turn: Schema.Finite, metadata: OptionalMetadata })
    case "ModelPart":
      return Schema.Struct({
        _tag: Schema.tag("ModelPart"),
        turn: Schema.Finite,
        modelCallId: Schema.String,
        modelAttemptId: Schema.String,
        attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        part: Schema.Unknown,
        metadata: OptionalMetadata,
      })
    case "ToolExecutionStarted":
      return Schema.Struct({
        _tag: Schema.tag("ToolExecutionStarted"),
        turn: Schema.Finite,
        call: LooseToolCallPart,
        metadata: OptionalMetadata,
      })
    case "ToolProgress":
      return Schema.Struct({
        _tag: Schema.tag("ToolProgress"),
        turn: Schema.Finite,
        toolCallId: Schema.String,
        message: Schema.optionalKey(Schema.String),
        data: Schema.optionalKey(Metadata),
        metadata: OptionalMetadata,
      })
    case "ToolExecutionCompleted":
      return Schema.Struct({
        _tag: Schema.tag("ToolExecutionCompleted"),
        turn: Schema.Finite,
        call: LooseToolCallPart,
        result: LooseToolResultPart,
        metadata: OptionalMetadata,
      })
    case "ApprovalRequested":
      return Schema.Struct({
        _tag: Schema.tag("ApprovalRequested"),
        turn: Schema.Finite,
        call: LooseToolCallPart,
        metadata: OptionalMetadata,
      })
    case "SteeringDrained":
      return Schema.Struct({
        _tag: Schema.tag("SteeringDrained"),
        turn: Schema.Finite,
        queue: Schema.Literals(["steering", "followUp"]),
        count: Schema.Finite,
        metadata: OptionalMetadata,
      })
    case "TurnCompleted":
      return Schema.Struct({
        _tag: Schema.tag("TurnCompleted"),
        turn: Schema.Finite,
        transcript: Schema.optionalKey(Prompt.Prompt),
        usage: Schema.optionalKey(Response.Usage),
        finishReason: Schema.optionalKey(Response.FinishReason),
        metadata: OptionalMetadata,
      })
    case "StructuredOutput":
      return Schema.Struct({
        _tag: Schema.tag("StructuredOutput"),
        turn: Schema.Finite,
        modelCallId: Schema.String,
        modelAttemptId: Schema.String,
        attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        value: Schema.Unknown,
        content: Schema.Array(Schema.Unknown),
        metadata: OptionalMetadata,
      })
    case "Completed":
      return Schema.Struct({
        _tag: Schema.tag("Completed"),
        turns: Schema.Finite,
        text: Schema.String,
        transcript: Schema.optionalKey(Prompt.Prompt),
        usage: Schema.optionalKey(Response.Usage),
        metadata: OptionalMetadata,
      })
    case "ModelCallStarted":
      return ModelTelemetry.ModelCallStarted
    case "ModelAttemptStarted":
      return ModelTelemetry.ModelAttemptStarted
    case "ModelAttemptFirstOutput":
      return ModelTelemetry.ModelAttemptFirstOutput
    case "ModelAttemptCompleted":
      return ModelTelemetry.ModelAttemptCompleted
    case "ModelAttemptFailed":
      return ModelTelemetry.ModelAttemptFailed
    case "ModelRetryScheduled":
      return ModelTelemetry.ModelRetryScheduled
    case "ModelCallCompleted":
      return ModelTelemetry.ModelCallCompleted
    case "ModelCallFailed":
      return ModelTelemetry.ModelCallFailed
    case "CompactionStarted":
      return ModelTelemetry.CompactionStarted
    case "CompactionCompleted":
      return ModelTelemetry.CompactionCompleted
    case "CompactionFailed":
      return ModelTelemetry.CompactionFailed
    default:
      return undefined
  }
}

const partTag = (value: unknown): string | undefined =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
    ? value.type
    : undefined
const sourceTag = (value: unknown): string | undefined =>
  typeof value === "object" && value !== null && "sourceType" in value && typeof value.sourceType === "string"
    ? value.sourceType
    : undefined
const normalizeUsage = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("inputTokens" in value) || !("outputTokens" in value))
    return value
  const input = value.inputTokens
  const output = value.outputTokens
  if (typeof input !== "object" || input === null || typeof output !== "object" || output === null) return value
  return {
    ...value,
    inputTokens: {
      uncached: "uncached" in input ? input.uncached : undefined,
      total: "total" in input ? input.total : undefined,
      cacheRead: "cacheRead" in input ? input.cacheRead : undefined,
      cacheWrite: "cacheWrite" in input ? input.cacheWrite : undefined,
    },
    outputTokens: {
      total: "total" in output ? output.total : undefined,
      text: "text" in output ? output.text : undefined,
      reasoning: "reasoning" in output ? output.reasoning : undefined,
    },
  }
}
const normalizeEvent = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || !("usage" in value)) return value
  return { ...value, usage: normalizeUsage(value.usage) }
}
export const standardPartSchema = (part: unknown): Schema.Constraint | undefined => {
  switch (partTag(part)) {
    case "text":
      return Response.TextPart
    case "text-start":
      return Response.TextStartPart
    case "text-delta":
      return Response.TextDeltaPart
    case "text-end":
      return Response.TextEndPart
    case "reasoning":
      return Response.ReasoningPart
    case "reasoning-start":
      return Response.ReasoningStartPart
    case "reasoning-delta":
      return Response.ReasoningDeltaPart
    case "reasoning-end":
      return Response.ReasoningEndPart
    case "tool-params-start":
      return Response.ToolParamsStartPart
    case "tool-params-delta":
      return Response.ToolParamsDeltaPart
    case "tool-params-end":
      return Response.ToolParamsEndPart
    case "tool-approval-request":
      return Response.ToolApprovalRequestPart
    case "file":
      return Response.FilePart
    case "response-metadata":
      return Response.ResponseMetadataPart
    case "finish":
      return Response.FinishPart
    case "error":
      return Response.ErrorPart
    case "source":
      return sourceTag(part) === "document"
        ? Response.DocumentSourcePart
        : sourceTag(part) === "url"
          ? Response.UrlSourcePart
          : undefined
    default:
      return undefined
  }
}

const toolPart = <T extends ToolkitInput | undefined>(
  toolkit: T,
  part: unknown,
  direction: Direction,
): Effect.Effect<unknown, WireEncodeFailed, unknown> => {
  const tag = partTag(part)
  if (tag !== "tool-call" && tag !== "tool-result") {
    const schema = standardPartSchema(part)
    if (schema === undefined) return Effect.fail(encodeError(new Error("Unknown response part type")))
    return (direction === "encode" ? Schema.encodeUnknownEffect(schema) : Schema.decodeUnknownEffect(schema))(
      part,
    ).pipe(Effect.mapError(encodeError))
  }
  if (toolkit === undefined) {
    const schema = tag === "tool-call" ? LooseToolCallPart : LooseToolResultPart
    return (direction === "encode" ? Schema.encodeUnknownEffect(schema) : Schema.decodeUnknownEffect(schema))(
      part,
    ).pipe(Effect.mapError(encodeError))
  }
  if (typeof part !== "object" || part === null || !("name" in part) || typeof part.name !== "string") {
    return Effect.fail(encodeError(new Error("Tool part name is required")))
  }
  const tool = toolkit.tools[part.name]
  if (tool === undefined) return missingTool(part.name)
  const isFailure = tag === "tool-result" && "isFailure" in part && part.isFailure === true
  const schema =
    tag === "tool-call"
      ? Response.ToolCallPart(tool.name, tool.parametersSchema)
      : Response.ToolResultPart(
          tool.name,
          isFailure ? Schema.Never : tool.successSchema,
          isFailure ? tool.failureSchema : Schema.Never,
        )
  return (direction === "encode" ? Schema.encodeUnknownEffect(schema) : Schema.decodeUnknownEffect(schema))(part).pipe(
    Effect.mapError(encodeError),
  )
}
type Direction = "encode" | "decode"

export const mapEvent = <T extends ToolkitInput | undefined>(
  toolkit: T,
  event: unknown,
  direction: Direction,
): Effect.Effect<unknown, WireEncodeFailed, unknown> => {
  if (typeof event !== "object" || event === null || !("_tag" in event) || typeof event._tag !== "string") {
    return Effect.fail(encodeError(new Error("Event tag is required")))
  }
  const schema = eventSchema(event._tag)
  if (schema === undefined) return Effect.fail(encodeError(new Error(`Unknown event '${event._tag}'`)))
  const validate = direction === "encode" ? Schema.encodeUnknownEffect(schema) : Schema.decodeUnknownEffect(schema)
  const mapped = (value: unknown): Effect.Effect<unknown, WireEncodeFailed, unknown> => {
    if (typeof value !== "object" || value === null)
      return Effect.fail(encodeError(new Error("Event must be an object")))
    if (!Schema.is(Metadata)(value)) return Effect.fail(encodeError(new Error("Event must be an object")))
    const record = value
    switch (event._tag) {
      case "ModelPart":
        return toolPart(toolkit, record.part, direction).pipe(Effect.map((part) => ({ ...record, part })))
      case "ToolExecutionStarted":
      case "ApprovalRequested":
        return toolPart(toolkit, record.call, direction).pipe(Effect.map((call) => ({ ...record, call })))
      case "ToolExecutionCompleted":
        return Effect.all({
          call: toolPart(toolkit, record.call, direction),
          result: toolPart(toolkit, record.result, direction),
        }).pipe(Effect.map(({ call, result }) => ({ ...record, call, result })))
      case "StructuredOutput":
        return Array.isArray(record.content)
          ? Effect.forEach(record.content, (part) => toolPart(toolkit, part, direction)).pipe(
              Effect.map((content) => ({ ...record, content })),
            )
          : Effect.fail(encodeError(new Error("Structured output content must be an array")))
      default:
        return Effect.succeed(value)
    }
  }
  const encodeEvent = (value: unknown): Effect.Effect<unknown, WireEncodeFailed, unknown> =>
    Schema.decodeUnknownEffect(schema)(value).pipe(Effect.as(value), Effect.mapError(encodeError))
  return direction === "decode"
    ? validate(normalizeEvent(event)).pipe(Effect.mapError(encodeError), Effect.flatMap(mapped))
    : mapped(event).pipe(Effect.flatMap(encodeEvent))
}

const frameSchema = (tag: string): Schema.Constraint | undefined => {
  switch (tag) {
    case "Event":
      return Schema.Struct({ _tag: Schema.tag("Event"), seq: Sequence, event: Schema.Unknown })
    case "Failed":
      return Schema.Struct({ _tag: Schema.tag("Failed"), seq: Sequence, error: RunFailure })
    case "Suspended":
      return Schema.Struct({ _tag: Schema.tag("Suspended"), seq: Sequence, suspension: AgentEvent.AgentSuspended })
    case "Ended":
      return Schema.Struct({ _tag: Schema.tag("Ended"), seq: Sequence })
    case "Snapshot":
      return Schema.Struct({ _tag: Schema.tag("Snapshot"), seq: SnapshotSequence, transcript: Prompt.Prompt })
    case "SessionStatus":
      return Schema.Struct({ _tag: Schema.tag("SessionStatus"), seq: Sequence, status: SessionStatus })
    default:
      return undefined
  }
}
export const decodeFrame = <T extends ToolkitInput | undefined>(
  toolkit: T,
  value: unknown,
): Effect.Effect<unknown, WireEncodeFailed, unknown> => {
  if (typeof value !== "object" || value === null || !("_tag" in value) || typeof value._tag !== "string") {
    return Effect.fail(encodeError(new Error("Frame tag is required")))
  }
  const schema = frameSchema(value._tag)
  return schema === undefined
    ? Effect.fail(encodeError(new Error(`Unknown frame '${value._tag}'`)))
    : Schema.decodeUnknownEffect(schema)(value).pipe(
        Effect.mapError(encodeError),
        Effect.flatMap((frame) => mapFrame(toolkit, frame, "decode")),
      )
}
export const mapFrame = <T extends ToolkitInput | undefined>(
  toolkit: T,
  frame: unknown,
  direction: Direction,
): Effect.Effect<unknown, WireEncodeFailed, unknown> => {
  if (typeof frame !== "object" || frame === null || !("_tag" in frame) || typeof frame._tag !== "string") {
    return Effect.fail(encodeError(new Error("Frame tag is required")))
  }
  if (!Schema.is(Metadata)(frame)) return Effect.fail(encodeError(new Error("Frame must be an object")))
  const record = frame
  const tag = record._tag
  if (typeof tag !== "string") return Effect.fail(encodeError(new Error("Frame tag is required")))
  if (tag === "Event") {
    return mapEvent(toolkit, record.event, direction).pipe(Effect.map((event) => ({ ...record, event })))
  }
  if (direction === "encode") {
    const schema = frameSchema(tag)
    return schema === undefined
      ? Effect.fail(encodeError(new Error(`Unknown frame '${tag}'`)))
      : Schema.decodeUnknownEffect(schema)(frame).pipe(Effect.as(frame), Effect.mapError(encodeError))
  }
  return Effect.succeed(frame)
}

type CodecRequirement<T extends ToolkitInput | undefined> = T extends ToolkitInput ? ToolkitServices<T> : never
const looseFrameValue = Schema.declare<LooseServerFrameType, unknown>(
  (value): value is LooseServerFrameType =>
    typeof value === "object" && value !== null && "_tag" in value && typeof value._tag === "string",
)
const asLooseFrame = (value: unknown): Effect.Effect<LooseServerFrameType, WireEncodeFailed> =>
  Schema.is(looseFrameValue)(value)
    ? Effect.succeed(value)
    : Effect.fail(encodeError(new Error("Decoded value is not a server frame")))

export function makeFixedCodec<T extends ToolkitInput>(
  toolkit: T,
): WireCodec<ServerFrameType | LooseServerFrameType, CodecRequirement<T>>
export function makeFixedCodec(toolkit: ToolkitInput): WireCodec<ServerFrameType | LooseServerFrameType, unknown> {
  return {
    encodeServer: (frame) =>
      mapFrame(toolkit, frame, "encode").pipe(
        Effect.flatMap((mapped) => encodeJson(mapped)),
        Effect.mapError(encodeError),
      ),
    encodeClient: (frame: ClientFrameType) =>
      Schema.encodeEffect(Schema.fromJsonString(ClientFrame))(frame).pipe(Effect.mapError(encodeError)),
    decodeServer: (data) =>
      decodeJson(data).pipe(
        Effect.flatMap((value) => decodeFrame(toolkit, value)),
        Effect.flatMap(asLooseFrame),
        Effect.mapError(encodeError),
      ),
    decodeClient: (data) =>
      Schema.decodeUnknownEffect(Schema.fromJsonString(ClientFrame))(data).pipe(Effect.mapError(encodeError)),
  }
}

export function makeDynamicCodec(): WireCodec<LooseServerFrameType, never>
export function makeDynamicCodec(): WireCodec<LooseServerFrameType, unknown> {
  return {
    encodeServer: (frame) =>
      mapFrame(undefined, frame, "encode").pipe(
        Effect.flatMap((mapped) => encodeJson(mapped)),
        Effect.mapError(encodeError),
      ),
    encodeClient: (frame) =>
      Schema.encodeEffect(Schema.fromJsonString(ClientFrame))(frame).pipe(Effect.mapError(encodeError)),
    decodeServer: (data) =>
      decodeJson(data).pipe(
        Effect.flatMap((value) => decodeFrame(undefined, value)),
        Effect.flatMap(asLooseFrame),
        Effect.mapError(encodeError),
      ),
    decodeClient: (data) =>
      Schema.decodeUnknownEffect(Schema.fromJsonString(ClientFrame))(data).pipe(Effect.mapError(encodeError)),
  }
}

export const makeSchemaCodec = <S extends Schema.Constraint>(
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
