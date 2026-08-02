import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { ContextOverflow, ModelRegistry } from "@batonfx/core"
import type { ModelRegistryFacade } from "@batonfx/core"
import { Config, Effect, Layer, Redacted } from "effect"
import { HttpClient } from "effect/unstable/http"
import { AiError, AnthropicStructuredOutput, Tool } from "effect/unstable/ai"
import { layerImageSources } from "../model/image-source.js"
import { type FailureInput, layerModelFailures } from "../model/model-failure.js"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface AnthropicInput extends RegistrationOptions {
  readonly model: (string & {}) | AnthropicLanguageModel.Model
  readonly config?: Omit<typeof AnthropicLanguageModel.Config.Service, "model">
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const boundedDescription = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value.slice(0, 2_048) : fallback

const boundedMetadata = (value: unknown): string | null => (typeof value === "string" ? value.slice(0, 256) : null)

const anthropicRequestId = (metadata: FailureInput["metadata"]): string | null => {
  const anthropic = metadata.anthropic
  return isRecord(anthropic) ? boundedMetadata(anthropic.requestId) : null
}

const resolveAnthropicFailure = ({ error, metadata: partMetadata, method }: FailureInput): AiError.AiError => {
  if (AiError.isAiError(error)) return error
  const event = isRecord(error) ? error : undefined
  const type = boundedMetadata(event?.type)
  const message = boundedDescription(event?.message, "Anthropic response failed")
  const metadata = { anthropic: { errorType: type, requestId: anthropicRequestId(partMetadata) } }
  const make = (reason: AiError.AiErrorReason) => AiError.make({ module: "AnthropicLanguageModel", method, reason })
  if (type === "api_error" || type === "overloaded_error" || type === "timeout_error") {
    return make(AiError.InternalProviderError.make({ description: message, metadata }))
  }
  if (type === "rate_limit_error") {
    return make(
      AiError.RateLimitError.make({
        metadata: {
          anthropic: {
            ...metadata.anthropic,
            requestsLimit: null,
            requestsRemaining: null,
            requestsReset: null,
            tokensLimit: null,
            tokensRemaining: null,
            tokensReset: null,
          },
        },
      }),
    )
  }
  if (type === "billing_error") return make(AiError.QuotaExhaustedError.make({ metadata }))
  if (type === "authentication_error") {
    return make(AiError.AuthenticationError.make({ kind: "InvalidKey", metadata }))
  }
  if (type === "permission_error") {
    return make(AiError.AuthenticationError.make({ kind: "InsufficientPermissions", metadata }))
  }
  if (type === "invalid_request_error" || type === "not_found_error") {
    return make(AiError.InvalidRequestError.make({ description: message, metadata }))
  }
  return make(AiError.UnknownError.make({ description: message, metadata }))
}

const anthropicLanguageModelLayer = (input: AnthropicInput) =>
  layerModelFailures(
    layerImageSources(
      AnthropicLanguageModel.layer({
        model: input.model,
        ...(input.config === undefined ? {} : { config: input.config }),
      }),
    ),
    resolveAnthropicFailure,
  )

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = ContextOverflow.classify

/** @experimental */
export const toolJsonSchemaCompiler: ModelRegistry.ToolJsonSchemaCompiler = (tool) =>
  Effect.try({
    try: () => Tool.getJsonSchema(tool, { transformer: AnthropicStructuredOutput.toCodecAnthropic }),
    catch: (error) =>
      AiError.make({
        module: "AnthropicLanguageModel",
        method: "prepareTools",
        reason: AiError.UnsupportedSchemaError.make({
          description: error instanceof Error ? error.message : String(error),
        }),
      }),
  })

/** @experimental */
export interface LayerOptions extends AnthropicInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof AnthropicClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (
  input: LayerOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "anthropic",
      model: input.model,
      layer: anthropicLanguageModelLayer(input),
      classifyFailure,
      toolJsonSchemaCompiler,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(AnthropicClient.layerConfig({ ...input.clientConfig, apiKey: input.apiKey })))

/** @experimental Bare registration effect; the consumer provides the Anthropic client (see layerConfig). */
export const registration = (input: AnthropicInput): ReturnType<ModelRegistryFacade["registration"]> =>
  ModelRegistry.registration({
    provider: "anthropic",
    model: input.model,
    layer: anthropicLanguageModelLayer(input),
    classifyFailure,
    toolJsonSchemaCompiler,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const layerConfig = AnthropicClient.layerConfig
