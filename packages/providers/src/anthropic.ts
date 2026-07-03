import * as Anthropic from "@effect/ai-anthropic"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import type { RegistrationOptions } from "./openai"

/** @experimental */
export interface AnthropicInput extends RegistrationOptions {
  readonly model: (string & {}) | Anthropic.AnthropicLanguageModel.Model
  readonly config?: Omit<typeof Anthropic.AnthropicLanguageModel.Config.Service, "model">
}

/** @experimental */
export const anthropic = (input: AnthropicInput) =>
  ModelRegistry.registrationFromLayer({
    provider: "anthropic",
    model: input.model,
    layer: Anthropic.AnthropicLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }),
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const anthropicClientLayerConfig = Anthropic.AnthropicClient.layerConfig

/** @experimental */
export interface WithAnthropicOptions extends AnthropicInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof Anthropic.AnthropicClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const withAnthropic = (options: WithAnthropicOptions) =>
  ModelRegistry.layerFromRegistrationEffects([anthropic(options)]).pipe(
    Layer.provide(Anthropic.AnthropicClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
    Layer.provide(FetchHttpClient.layer),
  )
