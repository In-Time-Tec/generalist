import { OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { ContextOverflow, ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { layerImageSources } from "./image-source.js"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface OpenRouterInput extends RegistrationOptions {
  readonly model: string
  readonly config?: Omit<typeof OpenRouterLanguageModel.Config.Service, "model">
}

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = ContextOverflow.classify

/** @experimental */
export interface LayerOptions extends OpenRouterInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenRouterClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (input: LayerOptions) =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "openrouter",
      model: input.model,
      layer: layerImageSources(
        OpenRouterLanguageModel.layer({
          model: input.model,
          ...(input.config === undefined ? {} : { config: input.config }),
        }),
      ),
      classifyFailure,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(OpenRouterClient.layerConfig({ ...input.clientConfig, apiKey: input.apiKey })))

/** @experimental */
export const layerConfig = OpenRouterClient.layerConfig
