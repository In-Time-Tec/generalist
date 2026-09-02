import { Effect, Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address } from "../../address.js"
import { decodePinned } from "../../executable/manifest-internal.js"
import { ExecutableManifest, ExecutableRef, PinnedExecutable } from "../../executable/manifest.js"
import { Message, Metadata } from "../../messaging/message.js"
import { type RunEvent, RunEvent as RunEventSchema } from "../../run/event.js"
import { RuntimeUnavailable } from "../../errors.js"

const messageJsonStringCodec = Schema.fromJsonString(Schema.toCodecJson(Message))

export const encodeJson: {
  <T, E>(value: T): (schema: Schema.Codec<T, E, never, never>) => string
  <T, E>(schema: Schema.Codec<T, E, never, never>, value: T): string
} = Function.dual(2, <T, E>(schema: Schema.Codec<T, E, never, never>, value: T): string =>
  Schema.encodeSync(Schema.fromJsonString(schema))(value),
)

interface DecodeJson {
  <S extends Schema.Codec<Schema.Schema.Type<S>, S["Encoded"], never, never>>(
    text: string,
  ): (self: S) => Schema.Schema.Type<S>
  <S extends Schema.Codec<Schema.Schema.Type<S>, S["Encoded"], never, never>>(
    self: S,
    text: string,
  ): Schema.Schema.Type<S>
}

export const decodeJson: DecodeJson = Function.dual(
  2,
  <S extends Schema.Codec<Schema.Schema.Type<S>, S["Encoded"], never, never>>(
    self: S,
    text: string,
  ): Schema.Schema.Type<S> => Schema.decodeSync(Schema.fromJsonString(self))(text),
)

export const encodeJsonValue = <T>(value: T): string =>
  value === undefined ? "null" : Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value)

export const decodeJsonValue = (text: string): Schema.Json =>
  Schema.decodeSync(Schema.fromJsonString(Schema.Json))(text)

export const decodeSqlInteger = (value: number | string | bigint): number => {
  const decoded = Number(value)
  if (!Number.isSafeInteger(decoded)) throw new RangeError(`SQL integer is outside JavaScript's safe range: ${value}`)
  return decoded
}

export const encodeJsonEffect: {
  <T, E>(value: T): (schema: Schema.Codec<T, E, never, never>) => Effect.Effect<string, RuntimeUnavailable>
  <T, E>(schema: Schema.Codec<T, E, never, never>, value: T): Effect.Effect<string, RuntimeUnavailable>
} = Function.dual(
  2,
  <T, E>(schema: Schema.Codec<T, E, never, never>, value: T): Effect.Effect<string, RuntimeUnavailable> =>
    Schema.encodeEffect(Schema.fromJsonString(schema))(value).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    ),
)

export const decodeJsonEffect: {
  <T, E>(text: string): (schema: Schema.Codec<T, E, never, never>) => Effect.Effect<T, RuntimeUnavailable>
  <T, E>(schema: Schema.Codec<T, E, never, never>, text: string): Effect.Effect<T, RuntimeUnavailable>
} = Function.dual(
  2,
  <T, E>(schema: Schema.Codec<T, E, never, never>, text: string): Effect.Effect<T, RuntimeUnavailable> =>
    Schema.decodeEffect(Schema.fromJsonString(schema))(text).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    ),
)

export const MessageCodec = Message
export const ExecutableRefCodec = ExecutableRef
export const ExecutableManifestCodec: Schema.Codec<ExecutableManifest, typeof ExecutableManifest.Encoded> =
  ExecutableManifest
export const MetadataCodec = Metadata
export const PromptCodec = Prompt.Prompt
export const StringArray = Schema.Array(Schema.String)
export const RunEventCodec = RunEventSchema

export const encodeMessage = (message: Message): string => Schema.encodeSync(messageJsonStringCodec)(message)

export const decodeMessage = (text: string): Message => Schema.decodeSync(messageJsonStringCodec)(text)

export const encodeExecutableRef = (ref: ExecutableRef): string => encodeJson(ExecutableRefCodec, ref)

export const decodeExecutableRef = (text: string): ExecutableRef => decodeJson(ExecutableRefCodec, text)

export const encodeExecutableManifest = (manifest: ExecutableManifest): string =>
  encodeJson(ExecutableManifestCodec, manifest)

export const decodeExecutableManifest = (text: string): ExecutableManifest => decodeJson(ExecutableManifestCodec, text)

export const decodePinnedExecutable: {
  (manifestText: string): (refText: string) => PinnedExecutable
  (refText: string, manifestText: string): PinnedExecutable
} = Function.dual(
  2,
  (refText: string, manifestText: string): PinnedExecutable =>
    decodePinned({
      ref: decodeJson(ExecutableRef, refText),
      manifest: decodeJson(ExecutableManifest, manifestText),
    }),
)

export const decodePinnedEffect = (input: typeof PinnedExecutable.Encoded) =>
  Effect.try({
    try: () => decodePinned(input),
    catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
  })

export const decodeStoredPinnedEffect: {
  (manifestText: string): (refText: string) => Effect.Effect<PinnedExecutable, RuntimeUnavailable, never>
  (refText: string, manifestText: string): Effect.Effect<PinnedExecutable, RuntimeUnavailable, never>
} = Function.dual(2, (refText: string, manifestText: string) =>
  Effect.try({
    try: () => decodePinnedExecutable(refText, manifestText),
    catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
  }),
)

export const encodeQueue = (queue: ReadonlyArray<string>): string => encodeJson(StringArray, queue)

export const decodeQueue = (text: string): ReadonlyArray<string> => decodeJson(StringArray, text)

export const encodeEvent = (event: RunEvent): string => encodeJson(RunEventCodec, event)

export const decodeEvent = (text: string): RunEvent => decodeJson(RunEventCodec, text)

export const encodeAddress = (address: Address): string => address
