import { Effect, Schema, SchemaTransformation } from "effect"
import { HostEvent } from "../host/event.js"
import { PreviewDelivery } from "../host/preview.js"
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
  commandId: Schema.String.check(Schema.isNonEmpty()),
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

/** Events carried by the Session WebSocket. Previews are memory-only and have no committed cursor. */
export const ServerEvent = Schema.Union([HostEvent, PreviewDelivery])
export type ServerEvent = typeof ServerEvent.Type

/** The Session WebSocket codec. SSE remains the committed HostEvent schema from the HTTP API. */
export const eventCodec: EventCodec<ServerEvent> = makeCodec(ServerEvent)

const ClientCommandJson = Schema.fromJsonString(ClientCommand)

export const encodeCommand = (command: ClientCommand): Effect.Effect<string, WireCodecFailed> =>
  Schema.encodeEffect(ClientCommandJson)(command).pipe(Effect.mapError(mapCodecError))

export const decodeCommand = (data: string): Effect.Effect<ClientCommand, WireCodecFailed> =>
  Schema.decodeEffect(ClientCommandJson)(data).pipe(Effect.mapError(mapCodecError))
