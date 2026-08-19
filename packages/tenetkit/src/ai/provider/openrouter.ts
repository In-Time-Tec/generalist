import { Generated, OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { ContextOverflow, ModelRegistry } from "tenetkit"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { AiError, AnthropicStructuredOutput, LanguageModel, OpenAiStructuredOutput, Tool } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
import { layerImageSources } from "../model/image-source.js"
import { type FailureInput, isAvailabilityFailure, layerModelFailures } from "../model/model-failure.js"
import type { RegistrationOptions } from "./openai.js"

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
export const decodeConfig = (options: unknown): Config =>
  Schema.decodeUnknownSync(ConfigSchema, { onExcessProperty: "error" })(options ?? {}) as unknown as Config

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const boundedDescription = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value.slice(0, 2_048) : fallback

const compilerFailureDescription = (error: unknown): string => {
  const fallback = "OpenRouter tool schema compilation failed"
  try {
    if (!(error instanceof Error)) return fallback
    return boundedDescription(error.message, fallback)
  } catch {
    return fallback
  }
}

const boundedMetadata = (value: unknown): string | null => (typeof value === "string" ? value.slice(0, 256) : null)

const openRouterRequestId = (metadata: FailureInput["metadata"]): string | null => {
  const openrouter = metadata.openrouter
  return isRecord(openrouter) ? boundedMetadata(openrouter.requestId) : null
}

const resolveOpenRouterFailure = ({ error, metadata: partMetadata, method }: FailureInput): AiError.AiError => {
  if (AiError.isAiError(error)) return error
  const event = isRecord(error) ? error : undefined
  const rawCode = typeof event?.code === "number" || typeof event?.code === "string" ? event.code : null
  const code = typeof rawCode === "string" ? boundedMetadata(rawCode) : rawCode
  const parsedStatus =
    typeof code === "number"
      ? code
      : typeof code === "string" && /^[1-5][0-9]{2}$/.test(code)
        ? Number(code)
        : Number.NaN
  const status =
    Number.isInteger(parsedStatus) && parsedStatus >= 100 && parsedStatus <= 599 ? parsedStatus : Number.NaN
  const message = boundedDescription(event?.message, "OpenRouter response failed")
  const metadata = {
    openrouter: {
      errorCode: code,
      errorType: boundedMetadata(event?.type),
      requestId: openRouterRequestId(partMetadata),
    },
  }
  const make = (reason: AiError.AiErrorReason) => AiError.make({ module: "OpenRouterLanguageModel", method, reason })
  if (status === 400 || status === 404 || status === 422) {
    return make(AiError.InvalidRequestError.make({ description: message, metadata }))
  }
  if (status === 401) return make(AiError.AuthenticationError.make({ kind: "InvalidKey", metadata }))
  if (status === 402) return make(AiError.QuotaExhaustedError.make({ metadata }))
  if (status === 403) return make(AiError.ContentPolicyError.make({ description: message, metadata }))
  if (status === 429) {
    return make(
      AiError.RateLimitError.make({
        metadata: {
          openrouter: {
            ...metadata.openrouter,
            limit: null,
            remaining: null,
            resetRequests: null,
            resetTokens: null,
          },
        },
      }),
    )
  }
  if (status === 408 || status >= 500) {
    return make(AiError.InternalProviderError.make({ description: message, metadata }))
  }
  return make(AiError.UnknownError.make({ description: message, metadata }))
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
      catch: (error) =>
        AiError.make({
          module: "OpenRouterLanguageModel",
          method: "prepareTools",
          reason: AiError.UnsupportedSchemaError.make({
            description: compilerFailureDescription(error),
          }),
        }),
    })

/** @experimental */
export interface LayerOptions extends OpenRouterInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenRouterClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (
  input: LayerOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "openrouter",
      model: input.model,
      layer: openRouterLanguageModelLayer(input),
      classifyFailure,
      toolJsonSchemaCompiler: toolJsonSchemaCompiler(input.model),
      isAvailabilityFailure,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(OpenRouterClient.layerConfig({ ...input.clientConfig, apiKey: input.apiKey })))

/** @experimental */
export const layerConfig = OpenRouterClient.layerConfig
