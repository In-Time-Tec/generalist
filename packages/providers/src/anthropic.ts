import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { AiError } from "effect/unstable/ai"
import { layerImageSources } from "./image-source.js"
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
export interface LayerOptions extends AnthropicInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof AnthropicClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (input: LayerOptions) =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "anthropic",
      model: input.model,
      layer: layerImageSources(
        AnthropicLanguageModel.layer({
          model: input.model,
          ...(input.config === undefined ? {} : { config: input.config }),
        }),
      ),
      classifyFailure,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(AnthropicClient.layerConfig({ ...input.clientConfig, apiKey: input.apiKey })))

/** @experimental Bare registration effect; the consumer provides the Anthropic client (see layerConfig). */
export const registration = (input: AnthropicInput) =>
  ModelRegistry.registration({
    provider: "anthropic",
    model: input.model,
    layer: layerImageSources(
      AnthropicLanguageModel.layer({
        model: input.model,
        ...(input.config === undefined ? {} : { config: input.config }),
      }),
    ),
    classifyFailure,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const layerConfig = AnthropicClient.layerConfig
