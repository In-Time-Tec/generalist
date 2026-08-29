import { Generated, OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { ContextOverflow } from "../../core/index.js"
import { ModelRegistry } from "../../core/model/public/registry.js"
import { Config, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { AiError, AnthropicStructuredOutput, LanguageModel, OpenAiStructuredOutput, Tool } from "effect/unstable/ai"
import { Sse } from "effect/unstable/encoding"
import { HttpClient, HttpClientError } from "effect/unstable/http"
import { layerImageSources } from "../model/image-source.js"
import { type FailureInput, isAvailabilityFailure, layerModelFailures } from "../model/failure.js"
import type { RegistrationOptions } from "../model/registration.js"

const {
  debug: _debug,
  messages: _messages,
  model: _model,
  response_format: _responseFormat,
  stream: _stream,
  stream_options: _streamOptions,
  tool_choice: _toolChoice,
  tools: _tools,
  ...openRouterConfigFields
} = Generated.ChatRequest.fields
const ConfigSchema = Schema.Struct({
  ...openRouterConfigFields,
  strictJsonSchema: Schema.optionalKey(Schema.Boolean),
})

/** @experimental */
export type Config = typeof ConfigSchema.Type

/** @experimental */
export interface OpenRouterInput extends RegistrationOptions {
  readonly model: string
  readonly config?: Config
}

/** @experimental Decodes persisted provider options into OpenRouter request configuration. */
const decodeConfigInput = Schema.decodeUnknownSync(Schema.NullOr(ConfigSchema), { onExcessProperty: "error" })
type ConfigInput = typeof Schema.Unknown.Type

export const decodeConfig = (options: ConfigInput): Config => decodeConfigInput(options ?? null) ?? {}

const ChatStreamChunk = Schema.Struct({
  ...Generated.ChatStreamChunk.fields,
  provider: Schema.optionalKey(Schema.String),
})
const decodeChatStreamChunk = Schema.decodeUnknownEffect(Schema.fromJsonString(ChatStreamChunk))
type OpenRouterStreamError = HttpClientError.HttpClientError | Schema.SchemaError | Sse.Retry | Sse.SseError
const openRouterStreamError = (error: OpenRouterStreamError): AiError.AiError => {
  if (HttpClientError.isHttpClientError(error)) {
    switch (error.reason._tag) {
      case "TransportError":
      case "EncodeError":
      case "InvalidUrlError":
        return AiError.make({
          module: "OpenRouterClient",
          method: "createChatCompletionStream",
          reason: AiError.NetworkError.fromRequestError(error.reason),
        })
    }
  }
  return AiError.make({
    module: "OpenRouterClient",
    method: "createChatCompletionStream",
    reason: AiError.InvalidOutputError.make({ description: "OpenRouter streaming response could not be decoded" }),
  })
}

const preserveServedProvider = (client: OpenRouterClient.Service): OpenRouterClient.Service =>
  OpenRouterClient.OpenRouterClient.of({
    ...client,
    createChatCompletionStream: (options) =>
      client.createChatCompletionStream(options).pipe(
        Effect.map(([response]) => [
          response,
          response.stream.pipe(
            Stream.decodeText(),
            Stream.pipeThroughChannel(Sse.decode()),
            Stream.takeWhile((event) => event.data !== "[DONE]"),
            Stream.mapEffect((event) => decodeChatStreamChunk(event.data)),
            Stream.mapError(openRouterStreamError),
          ),
        ]),
      ),
  })

/** @experimental */
export const layerConfig = (options?: Parameters<typeof OpenRouterClient.layerConfig>[0]) =>
  Layer.effect(
    OpenRouterClient.OpenRouterClient,
    OpenRouterClient.OpenRouterClient.pipe(Effect.map(preserveServedProvider)),
  ).pipe(Layer.provide(OpenRouterClient.layerConfig(options)))

const OpenRouterErrorPayload = Schema.Struct({
  code: Schema.optionalKey(Schema.Unknown),
  message: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.String),
})
const decodeOpenRouterError = Schema.decodeUnknownOption(OpenRouterErrorPayload)
const decodeErrorCodeString = Schema.decodeUnknownOption(Schema.String)
const decodeErrorCodeNumber = Schema.decodeUnknownOption(Schema.Finite)
const decodeCompilerError = Schema.decodeUnknownOption(Schema.instanceOf(Error))

const boundedDescription = (value: string | undefined, fallback: string): string =>
  value !== undefined && value.length > 0 ? value.slice(0, 2_048) : fallback

const boundedMetadata = (value: string | undefined): string | null => value?.slice(0, 256) ?? null

const openRouterRequestId = (metadata: FailureInput["metadata"]): string | null => {
  const decoded = Schema.decodeUnknownOption(Schema.Struct({ requestId: Schema.optionalKey(Schema.String) }))(
    metadata.openrouter,
  )
  return decoded._tag === "Some" ? boundedMetadata(decoded.value.requestId) : null
}

const parseStatus = (code: string | number | null): number => {
  const stringCode = decodeErrorCodeString(code)
  if (stringCode._tag === "Some") {
    return /^[1-5][0-9]{2}$/.test(stringCode.value) ? Number(stringCode.value) : Number.NaN
  }
  const numberCode = decodeErrorCodeNumber(code)
  return numberCode._tag === "Some" &&
    Number.isInteger(numberCode.value) &&
    numberCode.value >= 100 &&
    numberCode.value <= 599
    ? numberCode.value
    : Number.NaN
}

const openRouterReason = (
  status: number,
  message: string,
  metadata: {
    readonly openrouter: {
      readonly errorCode: string | number | null
      readonly errorType: string | null
      readonly requestId: string | null
    }
  },
): AiError.AiErrorReason => {
  if (status === 400 || status === 404 || status === 422)
    return AiError.InvalidRequestError.make({ description: message, metadata })
  if (status === 401) return AiError.AuthenticationError.make({ kind: "InvalidKey", metadata })
  if (status === 402) return AiError.QuotaExhaustedError.make({ metadata })
  if (status === 403) return AiError.ContentPolicyError.make({ description: message, metadata })
  if (status === 429) {
    return AiError.RateLimitError.make({
      metadata: {
        openrouter: { ...metadata.openrouter, limit: null, remaining: null, resetRequests: null, resetTokens: null },
      },
    })
  }
  if (status === 408 || status >= 500) return AiError.InternalProviderError.make({ description: message, metadata })
  return AiError.UnknownError.make({ description: message, metadata })
}

const resolveOpenRouterFailure = ({ error, metadata: partMetadata, method }: FailureInput): AiError.AiError => {
  if (AiError.isAiError(error)) return error
  const decoded = decodeOpenRouterError(error)
  const event = decoded._tag === "Some" ? decoded.value : {}
  const stringCode = decodeErrorCodeString(event.code)
  const numberCode = decodeErrorCodeNumber(event.code)
  let code: string | number | null = null
  if (stringCode._tag === "Some") code = stringCode.value.slice(0, 256)
  else if (numberCode._tag === "Some") code = numberCode.value
  const status = parseStatus(code)
  const message = boundedDescription(event?.message, "OpenRouter response failed")
  const metadata = {
    openrouter: {
      errorCode: code,
      errorType: boundedMetadata(event?.type),
      requestId: openRouterRequestId(partMetadata),
    },
  }
  const make = (reason: AiError.AiErrorReason) => AiError.make({ module: "OpenRouterLanguageModel", method, reason })
  return make(openRouterReason(status, message, metadata))
}

const openRouterLanguageModelLayer = (input: OpenRouterInput) =>
  Layer.suspend(() =>
    layerModelFailures(
      layerImageSources(
        OpenRouterLanguageModel.layer({
          model: input.model,
          config: decodeConfig(input.config),
        }),
      ),
      resolveOpenRouterFailure,
    ),
  )

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = ContextOverflow.classify

const codecTransformer = (model: string): LanguageModel.CodecTransformer => {
  if (model.startsWith("anthropic/") || model.startsWith("claude-")) {
    return AnthropicStructuredOutput.toCodecAnthropic
  }
  if (
    model.startsWith("openai/") ||
    model.startsWith("gpt-") ||
    model.startsWith("o1-") ||
    model.startsWith("o3-") ||
    model.startsWith("o4-")
  ) {
    return OpenAiStructuredOutput.toCodecOpenAI
  }
  return LanguageModel.defaultCodecTransformer
}

/** @experimental */
export const toolJsonSchemaCompiler =
  (model: string): ModelRegistry.ToolJsonSchemaCompiler =>
  (tool) =>
    Effect.try({
      try: () => Tool.getJsonSchema(tool, { transformer: codecTransformer(model) }),
      catch: (error) => {
        const fallback = "OpenRouter tool schema compilation failed"
        let description = fallback
        try {
          const decoded = decodeCompilerError(error)
          if (decoded._tag === "Some") description = boundedDescription(decoded.value.message, fallback)
        } catch {
          description = fallback
        }
        return AiError.make({
          module: "OpenRouterLanguageModel",
          method: "prepareTools",
          reason: AiError.UnsupportedSchemaError.make({ description }),
        })
      },
    })

/** @experimental */
export interface LayerOptions extends OpenRouterInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (
  input: LayerOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([ModelRegistry.registration(registrationOptions(input))]).pipe(
    Layer.provide(layerConfig({ ...input.clientConfig, apiKey: input.apiKey })),
  )

const registrationOptions = (input: OpenRouterInput) => {
  const required = {
    provider: "openrouter",
    model: input.model,
    layer: openRouterLanguageModelLayer(input),
    classifyFailure,
    toolJsonSchemaCompiler: toolJsonSchemaCompiler(input.model),
    isAvailabilityFailure,
  } as const
  if (input.registrationKey === undefined) {
    return input.metadata === undefined ? required : { ...required, metadata: input.metadata }
  }
  return input.metadata === undefined
    ? { ...required, registrationKey: input.registrationKey }
    : { ...required, registrationKey: input.registrationKey, metadata: input.metadata }
}
