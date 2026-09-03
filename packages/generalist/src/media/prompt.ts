import { Effect, Encoding, Option, Result, Schema } from "effect"
import { Model, Prompt, Response, type Tool } from "effect/unstable/ai"
import { BlobStore, BlobStoreError, type Service as BlobStoreService } from "../blob-store/index.js"
import { bundled as bundledModels, ModelCatalog } from "../ai/model-catalog.js"
import { Ref, type Ref as RefValue } from "./ref.js"

const markerPrefix = "generalist:blob-ref:"
const metadataKey = "generalist/blob-ref"
const EncodedRef = Schema.fromJsonString(Ref)

const encodedRef = (ref: RefValue): string => Schema.encodeSync(EncodedRef)(ref)
const marker = (ref: RefValue): string => `${markerPrefix}${Encoding.encodeBase64Url(encodedRef(ref))}`

/** Create a durable prompt file part that contains a reference, never blob bytes. */
export const part = (ref: RefValue): Prompt.FilePart =>
  Prompt.makePart("file", {
    mediaType: ref.mediaType,
    data: marker(ref),
    ...(ref.filename === undefined ? undefined : { fileName: ref.filename }),
  })

export const refFromPart = (value: Prompt.FilePart): Option.Option<RefValue> => {
  const data = Schema.decodeUnknownOption(Schema.String)(value.data)
  if (Option.isNone(data) || !data.value.startsWith(markerPrefix)) return Option.none()
  return Result.match(Encoding.decodeBase64UrlString(data.value.slice(markerPrefix.length)), {
    onFailure: () => Option.none(),
    onSuccess: (json) => Schema.decodeOption(EncodedRef)(json),
  })
}

const refFromResponsePart = (value: Response.FilePart): Option.Option<RefValue> =>
  Schema.decodeUnknownOption(Ref)(value.metadata[metadataKey])

const modality = (mediaType: string): "image" | "audio" | "video" | "pdf" | undefined => {
  if (mediaType.startsWith("image/")) return "image"
  if (mediaType.startsWith("audio/")) return "audio"
  if (mediaType.startsWith("video/")) return "video"
  return mediaType === "application/pdf" ? "pdf" : undefined
}

const preferredTransport = Effect.fn("Media.preferredTransport")(function* (mediaType: string) {
  const provider = yield* Effect.serviceOption(Model.ProviderName)
  const model = yield* Effect.serviceOption(Model.ModelName)
  const catalog = yield* Effect.serviceOption(ModelCatalog)
  if (Option.isNone(provider) || Option.isNone(model)) return "bytes" as const
  const metadata = Option.isSome(catalog)
    ? yield* catalog.value.find({ provider: provider.value, model: model.value })
    : bundledModels.find((entry) => entry.provider === provider.value && entry.model === model.value)
  const input = modality(mediaType)
  if (input === undefined || metadata === undefined || metadata.media === undefined) return "bytes" as const
  return metadata.media.input.includes(input) ? metadata.media.preferredInput : "bytes"
})

const resolveWithStore = Effect.fn("Media.resolveWithStore")(function* (
  store: BlobStoreService,
  ref: RefValue,
  preference?: "bytes" | "url",
) {
  const resolved = yield* store.resolve(ref, { prefer: preference ?? (yield* preferredTransport(ref.mediaType)) })
  return Prompt.makePart("file", {
    mediaType: resolved.ref.mediaType,
    data: resolved.data,
    ...(resolved.ref.filename === undefined ? undefined : { fileName: resolved.ref.filename }),
  })
})

/** Resolve one content reference to the Effect AI FilePart expected by the active provider. */
export const resolve = Effect.fn("Media.resolve")(function* (ref: RefValue, preference?: "bytes" | "url") {
  return yield* resolveWithStore(yield* BlobStore, ref, preference)
})

const resolveMessage = Effect.fn("Media.resolveMessage")(function* (store: BlobStoreService, message: Prompt.Message) {
  if (message.role !== "user" && message.role !== "assistant") return message
  if (message.role === "user") {
    const content = yield* Effect.forEach(message.content, (messagePart) => {
      if (messagePart.type !== "file") return Effect.succeed<Prompt.UserMessagePart>(messagePart)
      const ref = refFromPart(messagePart)
      return Option.isNone(ref)
        ? Effect.succeed<Prompt.UserMessagePart>(messagePart)
        : resolveWithStore(store, ref.value)
    })
    return Prompt.makeMessage("user", { content, options: message.options })
  }
  const content = yield* Effect.forEach(message.content, (messagePart) => {
    if (messagePart.type !== "file") return Effect.succeed<Prompt.AssistantMessagePart>(messagePart)
    const ref = refFromPart(messagePart)
    return Option.isNone(ref)
      ? Effect.succeed<Prompt.AssistantMessagePart>(messagePart)
      : resolveWithStore(store, ref.value)
  })
  return Prompt.makeMessage("assistant", { content, options: message.options })
})

/** Resolve every reference marker at the final provider boundary. */
export const resolvePrompt = (prompt: Prompt.Prompt) => {
  const hasRefs = prompt.content.some(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      message.content.some((messagePart) => messagePart.type === "file" && Option.isSome(refFromPart(messagePart))),
  )
  if (!hasRefs) return Effect.succeed(prompt)
  return Effect.gen(function* () {
    const store = yield* Effect.serviceOption(BlobStore)
    if (Option.isNone(store)) {
      return yield* BlobStoreError.make({
        operation: "resolve prompt media",
        reason: "BlobStore is not provided",
      })
    }
    return Prompt.fromMessages(yield* Effect.forEach(prompt.content, (message) => resolveMessage(store.value, message)))
  })
}

const JsonArray = Schema.Array(Schema.Json)
const JsonObject = Schema.Record(Schema.String, Schema.Json)

const refsIn = (value: Schema.Json): ReadonlyArray<RefValue> => {
  const found = new Map<string, RefValue>()
  const visit = (current: Schema.Json): void => {
    const decoded = Schema.decodeUnknownOption(Ref)(current)
    if (Option.isSome(decoded)) {
      found.set(decoded.value.sha256, decoded.value)
      return
    }
    const array = Schema.decodeUnknownOption(JsonArray)(current)
    if (Option.isSome(array)) {
      for (const item of array.value) visit(item)
      return
    }
    const object = Schema.decodeUnknownOption(JsonObject)(current)
    if (Option.isNone(object)) return
    for (const item of Object.values(object.value)) visit(item)
  }
  visit(value)
  return [...found.values()]
}

export const promptWithRefs = (options: { readonly encoded: Schema.Json; readonly json: string }): Prompt.RawInput => {
  const refs = refsIn(options.encoded)
  if (refs.length === 0) return options.json
  return Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: [Prompt.makePart("text", { text: options.json }), ...refs.map(part)],
    }),
  ])
}

const description = (ref: RefValue): string => `Media ref: ${encodedRef(ref)}`

/** Project model response parts without losing generated files (unsupported by Effect's current helper). */
export const promptFromResponseParts = (
  content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>,
): Prompt.Prompt => {
  const projected = Prompt.fromResponseParts(content)
  const files = content.flatMap((responsePart) => {
    if (responsePart.type !== "file") return []
    const ref = refFromResponsePart(responsePart)
    return Option.isNone(ref) ? [] : [part(ref.value), Prompt.makePart("text", { text: description(ref.value) })]
  })
  if (files.length === 0) return projected
  const assistant = projected.content.findIndex((message) => message.role === "assistant")
  if (assistant < 0)
    return Prompt.fromMessages([Prompt.makeMessage("assistant", { content: files }), ...projected.content])
  return Prompt.fromMessages(
    projected.content.map((message, index) =>
      index !== assistant || message.role !== "assistant"
        ? message
        : Prompt.makeMessage("assistant", { content: [...message.content, ...files], options: message.options }),
    ),
  )
}

/** Store generated provider bytes and replace them with a metadata reference for journaling. */
export const persistResponsePart = Effect.fn("Media.persistResponsePart")(function* <T extends Response.AnyPart>(
  responsePart: T,
) {
  if (responsePart.type !== "file" || Option.isSome(refFromResponsePart(responsePart))) return responsePart
  const store = yield* Effect.serviceOption(BlobStore)
  if (Option.isNone(store)) {
    return yield* BlobStoreError.make({
      operation: "persist generated media",
      reason: "BlobStore is not provided",
    })
  }
  const ref = yield* store.value.put({ data: responsePart.data, mediaType: responsePart.mediaType })
  return Response.makePart("file", {
    mediaType: ref.mediaType,
    data: new Uint8Array(),
    metadata: { ...responsePart.metadata, [metadataKey]: ref },
  })
})
