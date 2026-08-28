import { Effect, Schema, SchemaTransformation } from "effect"
import { Cursor } from "../runtime/cursor.js"
import { CompletedModelResponse, RunEvent } from "../runtime/run/event.js"
import { WireEncodeFailed } from "./errors.js"

type ModelResponseEvent = Extract<RunEvent, { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }>

export type ResolvedRunEvent =
  | Exclude<RunEvent, ModelResponseEvent>
  | (ModelResponseEvent & { readonly response: CompletedModelResponse })

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
  executableRef: Schema.Struct({}),
  rootRunId: Schema.String,
  occurredAt: Schema.String,
  response: Schema.optionalKey(Schema.Unknown),
})

/** @experimental Forward-compatible RunEvent schema for observers. */
export const ObserverRunEvent: Schema.Codec<ResolvedRunEvent, ResolvedRunEvent, never, never> = Schema.declare(
  (value): value is ResolvedRunEvent =>
    Schema.is(ObserverEnvelope)(value) &&
    (value._tag !== "ModelResponseCommitted" && value._tag !== "ModelResponseInterrupted"
      ? true
      : Schema.is(CompletedModelResponse)(value.response)),
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
  readonly encode: (event: Encoded) => Effect.Effect<string, WireEncodeFailed>
  readonly decode: (data: string) => Effect.Effect<Decoded, WireEncodeFailed>
}

const mapCodecError = (error: Schema.SchemaError): WireEncodeFailed => WireEncodeFailed.make({ message: error.message })

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
export const observerCodec: EventCodec<ResolvedRunEvent> = makeCodec(ObserverRunEvent)

const ClientCommandJson = Schema.fromJsonString(ClientCommand)

/** @experimental Encodes a WebSocket transport command. */
export const encodeCommand = (command: ClientCommand): Effect.Effect<string, WireEncodeFailed> =>
  Schema.encodeEffect(ClientCommandJson)(command).pipe(Effect.mapError(mapCodecError))

/** @experimental Decodes a WebSocket transport command. */
export const decodeCommand = (data: string): Effect.Effect<ClientCommand, WireEncodeFailed> =>
  Schema.decodeEffect(ClientCommandJson)(data).pipe(Effect.mapError(mapCodecError))
