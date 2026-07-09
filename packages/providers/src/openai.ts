import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

/** @experimental */
export interface RegistrationOptions {
  readonly registrationKey?: string
  readonly metadata?: ModelRegistry.Metadata
}

/** @experimental */
export interface OpenAiInput extends RegistrationOptions {
  readonly model: (string & {}) | OpenAiLanguageModel.Model
  readonly config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">
}

/** @experimental */
export const openAi = (input: OpenAiInput) =>
  ModelRegistry.registrationFromLayer({
    provider: "openai",
    model: input.model,
    layer: OpenAiLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }),
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const openAiClientLayerConfig = OpenAiClient.layerConfig

/** @experimental */
export interface WithOpenAiOptions extends OpenAiInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const withOpenAi = (options: WithOpenAiOptions) =>
  ModelRegistry.layerFromRegistrationEffects([openAi(options)]).pipe(
    Layer.provide(OpenAiClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
    Layer.provide(FetchHttpClient.layer),
  )
