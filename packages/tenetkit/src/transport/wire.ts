import { Effect, Schema, SchemaTransformation } from "effect"
import { Cursor } from "../runtime/cursor.js"
import { CompletedModelResponse, RunEvent } from "../runtime/run/event.js"
import { ExecutableRef } from "../runtime/executable/manifest.js"
import { WireCodecFailed } from "./errors.js"

type ModelResponseEvent = Extract<RunEvent, { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }>

export type ResolvedRunEvent =
  | Exclude<RunEvent, ModelResponseEvent>
  | (ModelResponseEvent & { readonly response: CompletedModelResponse })

/** @experimental Observer envelope for a future event variant this version does not know. */
export interface UnknownObserverRunEvent {
  readonly _tag: string
  readonly specVersion: "1"
  readonly eventId: string
  readonly runId: string
  readonly sequence: number
  readonly executableRef: ExecutableRef
  readonly rootRunId: string
  readonly occurredAt: string
}

/** @experimental A strictly decoded known event or an explicitly broad future variant. */
export type ObserverRunEvent = ResolvedRunEvent | UnknownObserverRunEvent

/** @experimental String representation of an exclusive RunEvent replay cursor. */
export const CursorFromString = Schema.String.check(Schema.isPattern(/^-?\d+$/)).pipe(
  Schema.decodeTo(Cursor, SchemaTransformation.numberFromString),
)

const ObserverEnvelope = Schema.Struct({
  _tag: Schema.String,
  specVersion: Schema.Literal("1"),
  eventId: Schema.String,
  runId: Schema.String,
  sequence: Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  executableRef: ExecutableRef,
  rootRunId: Schema.String,
  occurredAt: Schema.String,
  response: Schema.optionalKey(Schema.Unknown),
})

const knownEventTags = new Set([
  "TurnStarted",
  "ModelResponseCommitted",
  "ModelResponseInterrupted",
  "ToolExecutionStarted",
  "ToolProgress",
  "ToolExecutionCompleted",
  "ToolExecutionWaiting",
  "HandoffRequested",
  "HandoffCompleted",
  "Rejected",
  "ApprovalRequested",
  "SteeringDrained",
  "TurnCompleted",
  "StructuredOutput",
  "ModelCallStarted",
  "ModelAttemptStarted",
  "ModelAttemptFirstOutput",
  "ModelAttemptCompleted",
  "ModelAttemptFailed",
  "ModelFallbackScheduled",
  "ModelRetryScheduled",
  "ModelCallCompleted",
  "ModelCallFailed",
  "CompactionStarted",
  "CompactionSkipped",
  "CompactionApplied",
  "CompactionFailed",
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

/** @experimental Whether an observer event is a known event with its model response resolved. */
export const isResolvedRunEvent = (event: ObserverRunEvent): event is ResolvedRunEvent => {
  if (!knownEventTags.has(event._tag) || !Schema.is(RunEvent)(event)) return false
  return event._tag !== "ModelResponseCommitted" && event._tag !== "ModelResponseInterrupted"
    ? true
    : "response" in event && Schema.is(CompletedModelResponse)(event.response)
}

/** @experimental Forward-compatible RunEvent schema for observers. */
export const ObserverRunEvent: Schema.Codec<ObserverRunEvent, ObserverRunEvent, never, never> = Schema.declare(
  (value): value is ObserverRunEvent => {
    if (!Schema.is(ObserverEnvelope)(value)) return false
    return !knownEventTags.has(value._tag) || isResolvedRunEvent(value)
  },
)

/** @experimental WebSocket commands are transport operations, not Run lifecycle facts. */
export const ClientCommand = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag("Attach"),
    runId: Schema.String,
    cursor: Schema.optionalKey(Cursor),
  }),
  Schema.Struct({
    _tag: Schema.tag("Cancel"),
    runId: Schema.String,
    reason: Schema.optionalKey(Schema.String),
  }),
])
/** @experimental */
export type ClientCommand = typeof ClientCommand.Type

/** @experimental */
export interface EventCodec<Decoded = RunEvent, Encoded = Decoded> {
  readonly encode: (event: Encoded) => Effect.Effect<string, WireCodecFailed>
  readonly decode: (data: string) => Effect.Effect<Decoded, WireCodecFailed>
}

const mapCodecError = (error: Schema.SchemaError): WireCodecFailed => WireCodecFailed.make({ message: error.message })

const makeCodec = <Type, Encoded>(schema: Schema.Codec<Type, Encoded, never, never>): EventCodec<Type, Type> => {
  const json = Schema.fromJsonString(schema)
  return {
    encode: (event) => Schema.encodeEffect(json)(event).pipe(Effect.mapError(mapCodecError)),
    decode: (data) => Schema.decodeEffect(json)(data).pipe(Effect.mapError(mapCodecError)),
  }
}

/** @experimental Strict codec for Runtime-owned RunEvent producers. */
export const producerCodec: EventCodec<RunEvent> = makeCodec(RunEvent)

/** @experimental Forward-compatible codec for RunEvent observers. */
export const observerCodec: EventCodec<ObserverRunEvent> = makeCodec(ObserverRunEvent)

const ClientCommandJson = Schema.fromJsonString(ClientCommand)

/** @experimental Encodes a WebSocket transport command. */
export const encodeCommand = (command: ClientCommand): Effect.Effect<string, WireCodecFailed> =>
  Schema.encodeEffect(ClientCommandJson)(command).pipe(Effect.mapError(mapCodecError))

/** @experimental Decodes a WebSocket transport command. */
export const decodeCommand = (data: string): Effect.Effect<ClientCommand, WireCodecFailed> =>
  Schema.decodeEffect(ClientCommandJson)(data).pipe(Effect.mapError(mapCodecError))
