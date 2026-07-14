import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface OpenAiCompatibleInput extends RegistrationOptions {
  readonly provider?: string
  readonly model: string
  readonly config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">
}

/** @experimental */
export const openAiCompatible = (input: OpenAiCompatibleInput) =>
  ModelRegistry.registrationFromLayer({
    provider: input.provider ?? "openai-compatible",
    model: input.model,
    layer: OpenAiLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }),
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const openAiCompatibleClientLayerConfig = OpenAiClient.layerConfig

/** @experimental */
export interface WithOpenAiCompatibleOptions extends OpenAiCompatibleInput {
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly baseUrl?: string
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey" | "apiUrl">
}

const clientLayerConfig = (options: WithOpenAiCompatibleOptions) =>
  OpenAiClient.layerConfig({
    ...options.clientConfig,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.baseUrl === undefined ? {} : { apiUrl: Config.succeed(options.baseUrl) }),
  })

/** @experimental */
export const withOpenAiCompatible = (options: WithOpenAiCompatibleOptions) =>
  ModelRegistry.layerFromRegistrationEffects([openAiCompatible(options)]).pipe(
    Layer.provide(clientLayerConfig(options)),
  )

/** @experimental */
export const withOpenAiCompatibleFetch = (options: WithOpenAiCompatibleOptions) =>
  withOpenAiCompatible(options).pipe(Layer.provide(FetchHttpClient.layer))
