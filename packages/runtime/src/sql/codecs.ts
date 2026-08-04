import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address } from "../address.js"
import { decodePinned, ExecutableManifest, ExecutableRef, PinnedExecutable } from "../executable-manifest.js"
import type { ExecutableManifestEncoded } from "../executable-manifest.js"
import { Message, Metadata } from "../message.js"
import type { RunEvent } from "../run-event.js"
import { RunEvent as RunEventSchema } from "../run-event.js"
import { RuntimeUnavailable } from "../errors.js"

export const encodeJson = (value: unknown): string => JSON.stringify(value) ?? "null"

export const decodeJson = <A>(schema: Schema.Codec<A, unknown>, text: string): A =>
  Schema.decodeUnknownSync(schema)(JSON.parse(text) as unknown)

export const MessageCodec = Message
export const ExecutableRefCodec = ExecutableRef
export const ExecutableManifestCodec: Schema.Codec<ExecutableManifest, ExecutableManifestEncoded> = ExecutableManifest
export const MetadataCodec = Metadata
export const PromptCodec = Prompt.Prompt
export const StringArray = Schema.Array(Schema.String)
export const RunEventCodec = RunEventSchema

export const encodeMessage = (message: Message): string => encodeJson(Schema.encodeSync(MessageCodec)(message))

export const decodeMessage = (text: string): Message => decodeJson(MessageCodec, text)

export const encodeExecutableRef = (ref: ExecutableRef): string =>
  encodeJson(Schema.encodeSync(ExecutableRefCodec)(ref))

export const decodeExecutableRef = (text: string): ExecutableRef => decodeJson(ExecutableRefCodec, text)

export const encodeExecutableManifest = (manifest: ExecutableManifest): string =>
  encodeJson(Schema.encodeSync(ExecutableManifestCodec)(manifest))

export const decodeExecutableManifest = (text: string): ExecutableManifest => decodeJson(ExecutableManifestCodec, text)

export const decodePinnedExecutable = (refText: string, manifestText: string): PinnedExecutable =>
  decodePinned({ ref: JSON.parse(refText) as unknown, manifest: JSON.parse(manifestText) as unknown })

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

export const encodeQueue = (queue: ReadonlyArray<string>): string => encodeJson(queue)

export const decodeQueue = (text: string): ReadonlyArray<string> => decodeJson(StringArray, text)

export const encodeEvent = (event: RunEvent): string => encodeJson(Schema.encodeSync(RunEventCodec)(event))

export const decodeEvent = (text: string): RunEvent => {
  const parsed = JSON.parse(text) as Record<string, unknown>
  if (parsed._tag === "RunCompleted") {
    const result = parsed.result as Record<string, unknown>
    const transcript = result.transcript as { readonly content: ReadonlyArray<unknown> }
    parsed.result = { ...result, transcript: Prompt.make(transcript.content as never) }
  } else if (parsed._tag === "TurnCompleted") {
    const transcript = parsed.transcript as { readonly content: ReadonlyArray<unknown> }
    parsed.transcript = Prompt.make(transcript.content as never)
  }
  return Schema.decodeUnknownSync(RunEventCodec)(parsed)
}

export const encodeAddress = (address: Address): string => address
