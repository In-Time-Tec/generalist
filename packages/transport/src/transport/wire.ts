import { Effect, Schema, SchemaTransformation } from "effect"
import { Cursor, RunEvent } from "@batonfx/runtime"
import { WireEncodeFailed } from "./errors.js"

/** @experimental String representation of an exclusive RunEvent replay cursor. */
export const CursorFromString = Schema.String.check(Schema.isPattern(/^-?\d+$/)).pipe(
  Schema.decodeTo(Cursor.Cursor, SchemaTransformation.numberFromString),
)

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null

/** @experimental Forward-compatible RunEvent schema for observers. */
export const ObserverRunEvent: Schema.Codec<RunEvent.RunEvent, RunEvent.RunEvent, never, never> = Schema.declare(
  (value): value is RunEvent.RunEvent =>
    isRecord(value) &&
    typeof value._tag === "string" &&
    value.specVersion === "1" &&
    typeof value.eventId === "string" &&
    typeof value.runId === "string" &&
    typeof value.sequence === "number" &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence >= 0 &&
    isRecord(value.executableRef) &&
    typeof value.rootRunId === "string" &&
    typeof value.occurredAt === "string",
)

/** @experimental WebSocket commands are transport operations, not Run lifecycle facts. */
export const ClientCommand = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag("Attach"),
    runId: Schema.String,
    cursor: Schema.optionalKey(Cursor.Cursor),
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
export interface EventCodec<Decoded = RunEvent.RunEvent> {
  readonly encode: (event: RunEvent.RunEvent) => Effect.Effect<string, WireEncodeFailed>
  readonly decode: (data: string) => Effect.Effect<Decoded, WireEncodeFailed>
}

const mapCodecError = (error: unknown): WireEncodeFailed => WireEncodeFailed.make({ message: String(error) })

const makeCodec = <S extends Schema.Codec<RunEvent.RunEvent, unknown, never, never>>(
  schema: S,
): EventCodec<S["Type"]> => {
  const json = Schema.fromJsonString(schema)
  return {
    encode: (event) => Schema.encodeEffect(json)(event).pipe(Effect.mapError(mapCodecError)),
    decode: (data) => Schema.decodeUnknownEffect(json)(data).pipe(Effect.mapError(mapCodecError)),
  }
}

/** @experimental Strict codec for Runtime-owned RunEvent producers. */
export const producerCodec: EventCodec = makeCodec(
  RunEvent.RunEvent as Schema.Codec<RunEvent.RunEvent, unknown, never, never>,
)

/** @experimental Forward-compatible codec for RunEvent observers. */
export const observerCodec: EventCodec = makeCodec(ObserverRunEvent)

const ClientCommandJson = Schema.fromJsonString(ClientCommand)

/** @experimental Encodes a WebSocket transport command. */
export const encodeCommand = (command: ClientCommand): Effect.Effect<string, WireEncodeFailed> =>
  Schema.encodeEffect(ClientCommandJson)(command).pipe(Effect.mapError(mapCodecError))

/** @experimental Decodes a WebSocket transport command. */
export const decodeCommand = (data: string): Effect.Effect<ClientCommand, WireEncodeFailed> =>
  Schema.decodeUnknownEffect(ClientCommandJson)(data).pipe(Effect.mapError(mapCodecError))
