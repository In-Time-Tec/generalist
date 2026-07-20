import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { AiError } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface AnthropicInput extends RegistrationOptions {
  readonly model: (string & {}) | AnthropicLanguageModel.Model
  readonly config?: Omit<typeof AnthropicLanguageModel.Config.Service, "model">
}

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = (error) => {
  if (!AiError.isAiError(error) || error.reason._tag !== "InvalidRequestError") return "other"
  const metadata = error.reason.metadata.anthropic
  return metadata?.errorType === "invalid_request_error" &&
    /\bprompt is too long\b/i.test(error.reason.description ?? "")
    ? "context-overflow"
    : "other"
}

/** @experimental */
export const anthropic = (input: AnthropicInput) =>
  ModelRegistry.registration({
    provider: "anthropic",
    model: input.model,
    layer: AnthropicLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }),
    classifyFailure,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const anthropicClientLayerConfig = AnthropicClient.layerConfig

/** @experimental */
export interface WithAnthropicOptions extends AnthropicInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof AnthropicClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const withAnthropic = (options: WithAnthropicOptions) =>
  ModelRegistry.layer([anthropic(options)]).pipe(
    Layer.provide(AnthropicClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
  )

/** @experimental */
export const withAnthropicFetch = (options: WithAnthropicOptions) =>
  withAnthropic(options).pipe(Layer.provide(FetchHttpClient.layer))
