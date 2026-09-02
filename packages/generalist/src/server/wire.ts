import { Effect, Schema, SchemaTransformation } from "effect"
import { HostEvent } from "../host/event.js"
import { Cursor } from "../runtime/cursor.js"
import { WireCodecFailed } from "./errors.js"

/** String representation of an exclusive Host Session cursor. */
export const CursorFromString = Schema.String.check(Schema.isPattern(/^-?\d+$/)).pipe(
  Schema.decodeTo(Cursor, SchemaTransformation.numberFromString),
)

/** WebSocket commands are transport operations, not Run lifecycle facts. */
export const ClientCommand = Schema.Struct({
  _tag: Schema.tag("Cancel"),
  runId: Schema.String,
  reason: Schema.optionalKey(Schema.String),
})
export type ClientCommand = typeof ClientCommand.Type

export interface EventCodec<Decoded, Encoded = Decoded> {
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

/** The one HostEvent codec shared by SSE and WebSocket. */
export const eventCodec: EventCodec<HostEvent> = makeCodec(HostEvent)

const ClientCommandJson = Schema.fromJsonString(ClientCommand)

export const encodeCommand = (command: ClientCommand): Effect.Effect<string, WireCodecFailed> =>
  Schema.encodeEffect(ClientCommandJson)(command).pipe(Effect.mapError(mapCodecError))

export const decodeCommand = (data: string): Effect.Effect<ClientCommand, WireCodecFailed> =>
  Schema.decodeEffect(ClientCommandJson)(data).pipe(Effect.mapError(mapCodecError))
