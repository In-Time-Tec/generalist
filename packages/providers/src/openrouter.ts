import { OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface OpenRouterInput extends RegistrationOptions {
  readonly model: string
  readonly config?: Omit<typeof OpenRouterLanguageModel.Config.Service, "model">
}

/** @experimental */
export const openRouter = (input: OpenRouterInput) =>
  ModelRegistry.registrationFromLayer({
    provider: "openrouter",
    model: input.model,
    layer: OpenRouterLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }),
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const openRouterClientLayerConfig = OpenRouterClient.layerConfig

/** @experimental */
export interface WithOpenRouterOptions extends OpenRouterInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenRouterClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const withOpenRouter = (options: WithOpenRouterOptions) =>
  ModelRegistry.layerFromRegistrationEffects([openRouter(options)]).pipe(
    Layer.provide(OpenRouterClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
  )

/** @experimental */
export const withOpenRouterFetch = (options: WithOpenRouterOptions) =>
  withOpenRouter(options).pipe(Layer.provide(FetchHttpClient.layer))
