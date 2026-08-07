import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address } from "../address.js"
import { decodePinned, ExecutableManifest, ExecutableRef, PinnedExecutable } from "../executable-manifest.js"
import type { ExecutableManifestEncoded } from "../executable-manifest.js"
import { Message, Metadata } from "../message.js"
import type { RunEvent } from "../run-event.js"
import { RunEvent as RunEventSchema } from "../run-event.js"
import { RuntimeUnavailable } from "../errors.js"

export const encodeJson = <S extends Schema.Codec<any, any, never, never>>(
  schema: S,
  value: Schema.Schema.Type<S>,
): string => Schema.encodeSync(Schema.fromJsonString(schema))(value)

export const decodeJson = <S extends Schema.Codec<any, any, never, never>>(
  schema: S,
  text: string,
): Schema.Schema.Type<S> => Schema.decodeUnknownSync(Schema.fromJsonString(schema))(text)

export const encodeJsonValue = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

export const encodeJsonEffect = <S extends Schema.Codec<any, any, never, never>>(
  schema: S,
  value: Schema.Schema.Type<S>,
): Effect.Effect<string, RuntimeUnavailable> =>
  Schema.encodeEffect(Schema.fromJsonString(schema))(value).pipe(
    Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
  )

export const decodeJsonEffect = <S extends Schema.Codec<any, any, never, never>>(
  schema: S,
  text: string,
): Effect.Effect<Schema.Schema.Type<S>, RuntimeUnavailable> =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text).pipe(
    Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
  )

export const MessageCodec = Message
export const ExecutableRefCodec = ExecutableRef
export const ExecutableManifestCodec: Schema.Codec<ExecutableManifest, ExecutableManifestEncoded> = ExecutableManifest
export const MetadataCodec = Metadata
export const PromptCodec = Prompt.Prompt
export const StringArray = Schema.Array(Schema.String)
export const RunEventCodec = RunEventSchema

export const encodeMessage = (message: Message): string => encodeJson(MessageCodec, message)

export const decodeMessage = (text: string): Message => decodeJson(MessageCodec, text)

export const encodeExecutableRef = (ref: ExecutableRef): string => encodeJson(ExecutableRefCodec, ref)

export const decodeExecutableRef = (text: string): ExecutableRef => decodeJson(ExecutableRefCodec, text)

export const encodeExecutableManifest = (manifest: ExecutableManifest): string =>
  encodeJson(ExecutableManifestCodec, manifest)

export const decodeExecutableManifest = (text: string): ExecutableManifest => decodeJson(ExecutableManifestCodec, text)

export const decodePinnedExecutable = (refText: string, manifestText: string): PinnedExecutable =>
  decodePinned({ ref: decodeJson(Schema.Unknown, refText), manifest: decodeJson(Schema.Unknown, manifestText) })

export const decodePinnedEffect = (input: unknown) =>
  Effect.try({
    try: () => decodePinned(input),
    catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
  })

export const decodeStoredPinnedEffect = (refText: string, manifestText: string) =>
  Effect.try({
    try: () => decodePinnedExecutable(refText, manifestText),
    catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
  })

export const encodeQueue = (queue: ReadonlyArray<string>): string => encodeJson(StringArray, queue)

export const decodeQueue = (text: string): ReadonlyArray<string> => decodeJson(StringArray, text)

export const encodeEvent = (event: RunEvent): string => encodeJson(RunEventCodec, event)

export const decodeEvent = (text: string): RunEvent => decodeJson(RunEventCodec, text)

export const encodeAddress = (address: Address): string => address
