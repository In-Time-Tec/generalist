import { Effect, Encoding, Layer, Result, Stream } from "effect"
import { AiError, LanguageModel, Prompt } from "effect/unstable/ai"
import { ModelMiddleware } from "@batonfx/core"

const imageMediaTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"])
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const dataUriPattern = /^data:([^;,]+);base64,(.*)$/s
const isImageMediaType = (mediaType: string) => mediaType.slice(0, 6).toLowerCase() === "image/"

const fail = (description: string) =>
  AiError.AiError.make({
    module: "BatonImageSource",
    method: "normalize",
    reason: AiError.InvalidRequestError.make({ description }),
  })

const decodeBase64 = (value: string) => {
  if (value.length === 0 || !base64Pattern.test(value)) return Effect.fail(fail("image data must be valid base64"))
  return Encoding.decodeBase64(value).pipe(
    Result.mapError(() => fail("image data must be valid base64")),
    Effect.fromResult,
    Effect.filterOrFail(
      (data) => Encoding.encodeBase64(data) === value,
      () => fail("image data must use canonical base64 encoding"),
    ),
  )
}

const normalizePart = (part: Prompt.FilePart) => {
  if (!imageMediaTypes.has(part.mediaType)) {
    return Effect.fail(fail(`unsupported image MIME type: ${part.mediaType}`))
  }
  if (part.data instanceof Uint8Array || part.data instanceof URL) return Effect.succeed(part)
  const dataUri = part.data.match(dataUriPattern)
  if (dataUri !== null && dataUri[1] !== part.mediaType) {
    return Effect.fail(fail(`image data URI MIME type '${dataUri[1]}' does not match '${part.mediaType}'`))
  }
  const value = dataUri?.[2] ?? part.data
  if (part.data.startsWith("data:") && dataUri === null) {
    return Effect.fail(fail("image data URI must use the canonical data:<MIME>;base64,<data> form"))
  }
  return Effect.map(decodeBase64(value), (data) => ({ ...part, data }))
}

const normalizePrompt = Effect.fnUntraced(function* (input: Prompt.RawInput) {
  const prompt = yield* Effect.try({
    try: () => Prompt.make(input),
    catch: () => fail("prompt contains invalid image data"),
  })
  const messages: Array<Prompt.Message> = []
  for (const message of prompt.content) {
    if (
      message.role === "assistant" &&
      message.content.some((part) => part.type === "file" && isImageMediaType(part.mediaType))
    ) {
      return yield* fail("image file parts are only supported in user messages")
    }
    if (message.role !== "user") {
      messages.push(message)
      continue
    }
    const content: Array<Prompt.UserMessagePart> = []
    for (const part of message.content) {
      content.push(part.type === "file" && isImageMediaType(part.mediaType) ? yield* normalizePart(part) : part)
    }
    messages.push({ ...message, content })
  }
  return messages
})

const normalizeOptions = <Options extends { readonly prompt: Prompt.RawInput }>(options: Options) =>
  Effect.map(normalizePrompt(options.prompt), (prompt) => ({ ...options, prompt }))

/** @experimental */
export const conformImageSourceModel = (model: LanguageModel.Service): LanguageModel.Service =>
  ModelMiddleware.adapt<AiError.AiError, AiError.AiError, AiError.AiError>(model, {
    generateText: (options, invoke) => Effect.flatMap(normalizeOptions(options), (normalized) => invoke(normalized)),
    generateObject: (options, invoke) => Effect.flatMap(normalizeOptions(options), (normalized) => invoke(normalized)),
    streamText: (options, invoke) =>
      Stream.unwrap(Effect.map(normalizeOptions(options), (normalized) => invoke(normalized))),
  })

/** @experimental */
export const layerImageSources = <E, R>(
  layer: Layer.Layer<LanguageModel.LanguageModel, E, R>,
): Layer.Layer<LanguageModel.LanguageModel, E, R> =>
  Layer.effect(LanguageModel.LanguageModel, Effect.map(LanguageModel.LanguageModel, conformImageSourceModel)).pipe(
    Layer.provide(layer),
  )
