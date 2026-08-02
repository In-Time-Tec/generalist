import { Effect, Option, Schema, SchemaIssue, SchemaTransformation } from "effect"
import { type ToolkitInput, type ToolkitServices, type LooseEventType, type LooseServerFrameType } from "./wire.js"
import { mapEvent, decodeFrame, mapFrame } from "./wire-codec.js"

const schemaIssue = (value: unknown, error: unknown): SchemaIssue.Issue =>
  new SchemaIssue.InvalidValue(Option.some(value), { message: error instanceof Error ? error.message : String(error) })
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null
const isSchemaToolCall = (value: unknown): value is Readonly<Record<string, unknown>> & { readonly name: string } =>
  isRecord(value) &&
  value.type === "tool-call" &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  "params" in value
const isSchemaToolResult = (value: unknown): value is Readonly<Record<string, unknown>> & { readonly name: string } =>
  isRecord(value) &&
  value.type === "tool-result" &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  "result" in value &&
  typeof value.isFailure === "boolean"
const standardPartFields: Readonly<Record<string, ReadonlyArray<string>>> = {
  text: ["text"],
  "text-start": ["id"],
  "text-delta": ["id", "delta"],
  "text-end": ["id"],
  reasoning: ["text"],
  "reasoning-start": ["id"],
  "reasoning-delta": ["id", "delta"],
  "reasoning-end": ["id"],
  "tool-params-start": ["id", "name"],
  "tool-params-delta": ["id", "delta"],
  "tool-params-end": ["id"],
  "tool-approval-request": ["id", "name"],
  file: ["id", "mediaType", "data"],
  "response-metadata": ["id", "modelId", "timestamp", "request"],
  finish: ["reason", "usage", "response"],
  error: ["error"],
  source: ["sourceType"],
}
const isSchemaToolPart = (value: unknown, toolkit: ToolkitInput | undefined): boolean => {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (value.type === "tool-call")
    return isSchemaToolCall(value) && (toolkit === undefined || toolkit.tools[value.name] !== undefined)
  if (value.type === "tool-result")
    return isSchemaToolResult(value) && (toolkit === undefined || toolkit.tools[value.name] !== undefined)
  const fields = standardPartFields[value.type]
  return fields !== undefined && fields.every((field) => field in value)
}
const eventTags = new Set([
  "TurnStarted",
  "ModelPart",
  "ToolExecutionStarted",
  "ToolProgress",
  "ToolExecutionCompleted",
  "ApprovalRequested",
  "SteeringDrained",
  "TurnCompleted",
  "StructuredOutput",
  "Completed",
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
const isSchemaEvent = (value: unknown, toolkit: ToolkitInput | undefined): boolean => {
  if (!isRecord(value) || typeof value._tag !== "string" || !eventTags.has(value._tag)) return false
  if ((value._tag.startsWith("Model") && value._tag !== "ModelPart") || value._tag.startsWith("Compaction")) return true
  if (value._tag === "Completed") return typeof value.turns === "number" && typeof value.text === "string"
  if (!("turn" in value) || typeof value.turn !== "number" || !Number.isFinite(value.turn)) return false
  switch (value._tag) {
    case "ModelPart":
      return (
        isSchemaToolPart(value.part, toolkit) &&
        typeof value.modelCallId === "string" &&
        typeof value.modelAttemptId === "string"
      )
    case "ToolExecutionStarted":
    case "ApprovalRequested":
      return isSchemaToolCall(value.call)
    case "ToolExecutionCompleted":
      return isSchemaToolCall(value.call) && isSchemaToolResult(value.result)
    case "ToolProgress":
      return typeof value.toolCallId === "string"
    case "SteeringDrained":
      return value.queue === "steering" || value.queue === "followUp"
    case "StructuredOutput":
      return Array.isArray(value.content)
    default:
      return true
  }
}
const isSchemaFrame = (value: unknown, toolkit: ToolkitInput | undefined): boolean => {
  if (!isRecord(value) || typeof value._tag !== "string") return false
  if (value._tag === "Snapshot")
    return (
      (value.seq === -1 || (typeof value.seq === "number" && Number.isSafeInteger(value.seq) && value.seq >= 0)) &&
      isRecord(value.transcript)
    )
  if (typeof value.seq !== "number" || !Number.isSafeInteger(value.seq) || value.seq < 0) return false
  switch (value._tag) {
    case "Event":
      return isSchemaEvent(value.event, toolkit)
    case "Failed":
      return isRecord(value.error) && typeof value.error._tag === "string"
    case "Suspended":
      return isRecord(value.suspension)
    case "Ended":
      return true
    case "SessionStatus":
      return isRecord(value.status) && typeof value.status._tag === "string"
    default:
      return false
  }
}

export function makeEventSchema<T extends ToolkitInput>(
  toolkit: T,
): Schema.Codec<LooseEventType, unknown, ToolkitServices<T>, ToolkitServices<T>>
export function makeEventSchema(toolkit: undefined): Schema.Codec<LooseEventType, unknown, never, never>
export function makeEventSchema(
  toolkit: ToolkitInput | undefined,
): Schema.Codec<LooseEventType, unknown, unknown, unknown> {
  const eventValue = Schema.declare<LooseEventType>((value): value is LooseEventType => isSchemaEvent(value, toolkit))
  return eventValue.pipe(
    Schema.decodeTo(
      eventValue,
      SchemaTransformation.transformOrFail<LooseEventType, LooseEventType, unknown, unknown>({
        decode: (value) =>
          mapEvent(toolkit, value, "decode").pipe(
            Effect.flatMap((event) =>
              Schema.is(eventValue)(event) ? Effect.succeed(event) : Effect.fail(schemaIssue(value, "Invalid event")),
            ),
            Effect.mapError((error) => (error instanceof SchemaIssue.InvalidValue ? error : schemaIssue(value, error))),
          ),
        encode: (event) =>
          mapEvent(toolkit, event, "encode").pipe(
            Effect.flatMap((mapped) =>
              Schema.is(eventValue)(mapped) ? Effect.succeed(mapped) : Effect.fail(schemaIssue(event, "Invalid event")),
            ),
            Effect.mapError((error) => (error instanceof SchemaIssue.InvalidValue ? error : schemaIssue(event, error))),
          ),
      }),
    ),
  )
}

export function makeFrameSchema<T extends ToolkitInput>(
  toolkit: T,
): Schema.Codec<LooseServerFrameType, unknown, ToolkitServices<T>, ToolkitServices<T>>
export function makeFrameSchema(toolkit: undefined): Schema.Codec<LooseServerFrameType, unknown, never, never>
export function makeFrameSchema(
  toolkit: ToolkitInput | undefined,
): Schema.Codec<LooseServerFrameType, unknown, unknown, unknown> {
  const frameValue = Schema.declare<LooseServerFrameType>((value): value is LooseServerFrameType =>
    isSchemaFrame(value, toolkit),
  )
  return frameValue.pipe(
    Schema.decodeTo(
      frameValue,
      SchemaTransformation.transformOrFail<LooseServerFrameType, LooseServerFrameType, unknown, unknown>({
        decode: (value) =>
          decodeFrame(toolkit, value).pipe(
            Effect.flatMap((frame) =>
              Schema.is(frameValue)(frame) ? Effect.succeed(frame) : Effect.fail(schemaIssue(value, "Invalid frame")),
            ),
            Effect.mapError((error) => (error instanceof SchemaIssue.InvalidValue ? error : schemaIssue(value, error))),
          ),
        encode: (frame) =>
          mapFrame(toolkit, frame, "encode").pipe(
            Effect.flatMap((mapped) =>
              Schema.is(frameValue)(mapped) ? Effect.succeed(mapped) : Effect.fail(schemaIssue(frame, "Invalid frame")),
            ),
            Effect.mapError((error) => (error instanceof SchemaIssue.InvalidValue ? error : schemaIssue(frame, error))),
          ),
      }),
    ),
  )
}
