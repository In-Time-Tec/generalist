import { AnthropicClient, AnthropicLanguageModel, Generated } from "@effect/ai-anthropic"
import { ContextOverflow } from "../../core/index.js"
import { ModelRegistry } from "../../core/model/public/registry.js"
import { Config as EffectConfig, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import { AiError, AnthropicStructuredOutput, Tool } from "effect/unstable/ai"
import { layerImageSources } from "../model/image-source.js"
import { type FailureInput, isAvailabilityFailure, layerModelFailures } from "../model/failure.js"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface Options extends RegistrationOptions {
  readonly model: (string & {}) | AnthropicLanguageModel.Model
  readonly config?: Config
}

const {
  max_tokens: maxTokens,
  messages: _messages,
  model: _model,
  output_config: _outputConfig,
  stream: _stream,
  tool_choice: _toolChoice,
  tools: _tools,
  ...anthropicConfigFields
} = Generated.BetaCreateMessageParams.fields

const ConfigSchema = Schema.Struct({
  ...anthropicConfigFields,
  max_tokens: Schema.optionalKey(maxTokens),
  output_config: Schema.optionalKey(
    Schema.Struct({ effort: Schema.optionalKey(Schema.NullOr(Generated.BetaEffortLevel)) }),
  ),
  disableParallelToolCalls: Schema.optionalKey(Schema.Boolean),
  strictJsonSchema: Schema.optionalKey(Schema.Boolean),
})

/** @experimental */
export type Config = typeof ConfigSchema.Type

/** @experimental Decodes persisted provider options into Anthropic request configuration. */
type ConfigInput = typeof Schema.Unknown.Type

export const decodeConfig = (options: ConfigInput): Config =>
  Schema.decodeSync(ConfigSchema, { onExcessProperty: "error" })(options ?? {})

const FailureEventSchema = Schema.Struct({
  type: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
})
const FailureMetadataSchema = Schema.Struct({ requestId: Schema.optionalKey(Schema.String) })

const anthropicRequestId = (metadata: FailureInput["metadata"]): string | null => {
  const anthropic = Option.getOrUndefined(Schema.decodeUnknownOption(FailureMetadataSchema)(metadata.anthropic))
  return anthropic?.requestId?.slice(0, 256) ?? null
}

const anthropicReason = (
  type: string | null,
  message: string,
  metadata: { readonly anthropic: { readonly errorType: string | null; readonly requestId: string | null } },
): AiError.AiErrorReason => {
  if (type === "api_error" || type === "overloaded_error" || type === "timeout_error") {
    return AiError.InternalProviderError.make({ description: message, metadata })
  }
  if (type === "rate_limit_error") {
    return AiError.RateLimitError.make({
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
    })
  }
  if (type === "billing_error") return AiError.QuotaExhaustedError.make({ metadata })
  if (type === "authentication_error") return AiError.AuthenticationError.make({ kind: "InvalidKey", metadata })
  if (type === "permission_error") {
    return AiError.AuthenticationError.make({ kind: "InsufficientPermissions", metadata })
  }
  if (type === "invalid_request_error" || type === "not_found_error") {
    return AiError.InvalidRequestError.make({ description: message, metadata })
  }
  return AiError.UnknownError.make({ description: message, metadata })
}

const resolveAnthropicFailure = ({ error, metadata: partMetadata, method }: FailureInput): AiError.AiError => {
  if (AiError.isAiError(error)) return error
  const event = Option.getOrUndefined(Schema.decodeUnknownOption(FailureEventSchema)(error))
  const type = event?.type?.slice(0, 256) ?? null
  const message =
    event?.message === undefined || event.message.length === 0
      ? "Anthropic response failed"
      : event.message.slice(0, 2_048)
  const metadata = { anthropic: { errorType: type, requestId: anthropicRequestId(partMetadata) } }
  return AiError.make({ module: "AnthropicLanguageModel", method, reason: anthropicReason(type, message, metadata) })
}

/** @experimental Effective Anthropic request config; callers opt into top-level automatic caching. */
export const resolvedConfig = (input: Options): Config => input.config ?? {}

const providerConfig = (config: Config): Omit<typeof AnthropicLanguageModel.Config.Service, "model"> => {
  const target: Omit<typeof AnthropicLanguageModel.Config.Service, "model"> = {}
  Object.assign(target, config)
  return target
}

const anthropicLanguageModelLayer = (input: Options) => {
  const options =
    input.config === undefined ? { model: input.model } : { model: input.model, config: providerConfig(input.config) }
  return layerModelFailures(layerImageSources(AnthropicLanguageModel.layer(options)), resolveAnthropicFailure)
}

const registrationOptions = (input: Options) => {
  const required = {
    provider: "anthropic",
    model: input.model,
    layer: anthropicLanguageModelLayer(input),
    classifyFailure,
    toolJsonSchemaCompiler,
    isAvailabilityFailure,
  }
  if (input.registrationKey !== undefined && input.metadata !== undefined) {
    return { ...required, registrationKey: input.registrationKey, metadata: input.metadata }
  }
  if (input.registrationKey !== undefined) return { ...required, registrationKey: input.registrationKey }
  if (input.metadata !== undefined) return { ...required, metadata: input.metadata }
  return required
}

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
export interface ClientOptions extends Options {
  readonly apiKey: EffectConfig.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof AnthropicClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (
  input: ClientOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, EffectConfig.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([ModelRegistry.registration(registrationOptions(input))]).pipe(
    Layer.provide(AnthropicClient.layerConfig({ ...input.clientConfig, apiKey: input.apiKey })),
  )

/** @experimental Bare registration effect; the consumer provides the Anthropic client (see layerConfig). */
export const registration = (input: Options): ReturnType<typeof ModelRegistry.registration> =>
  ModelRegistry.registration(registrationOptions(input))

/** @experimental */
export const layerConfig = AnthropicClient.layerConfig
