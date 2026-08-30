import { OpenAiClient as OpenAIClient, OpenAiEmbeddingModel as OpenAIEmbeddingModel } from "@effect/ai-openai"
import {
  OpenAiClient as OpenAICompatibleClient,
  OpenAiEmbeddingModel as OpenAICompatibleEmbeddingModel,
} from "@effect/ai-openai-compat"
import { Config, Layer, Redacted } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"

/** @experimental */
export interface OpenAIOptions {
  readonly model: (string & {}) | OpenAIEmbeddingModel.Model
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAIClient.layerConfig>[0]>, "apiKey">
  readonly config?: Omit<typeof OpenAIEmbeddingModel.Config.Service, "model">
}

const openAiModelOptions = (options: OpenAIOptions) => {
  const modelOptions: Parameters<typeof OpenAIEmbeddingModel.layer>[0] =
    options.config === undefined ? { model: options.model } : { model: options.model, config: options.config }
  return modelOptions
}

/** @experimental */
export const layerOpenAI = (
  options: OpenAIOptions,
): Layer.Layer<EmbeddingModel.EmbeddingModel, Config.ConfigError, HttpClient.HttpClient> =>
  OpenAIEmbeddingModel.layer(openAiModelOptions(options)).pipe(
    Layer.provide(OpenAIClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
  )

/** @experimental */
export interface OpenAICompatibleOptions {
  readonly model: string
  readonly baseUrl: string
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<
    NonNullable<Parameters<typeof OpenAICompatibleClient.layerConfig>[0]>,
    "apiKey" | "apiUrl"
  >
  readonly config?: Omit<typeof OpenAICompatibleEmbeddingModel.Config.Service, "model">
}

const compatibleModelOptions = (options: OpenAICompatibleOptions) => {
  const modelOptions: Parameters<typeof OpenAICompatibleEmbeddingModel.layer>[0] =
    options.config === undefined ? { model: options.model } : { model: options.model, config: options.config }
  return modelOptions
}

const compatibleClientOptions = (options: OpenAICompatibleOptions) => {
  const clientOptions: NonNullable<Parameters<typeof OpenAICompatibleClient.layerConfig>[0]> = {
    ...options.clientConfig,
    apiUrl: Config.succeed(options.baseUrl),
  }
  return options.apiKey === undefined ? clientOptions : { ...clientOptions, apiKey: options.apiKey }
}

/** @experimental */
export const layerOpenAICompatible = (
  options: OpenAICompatibleOptions,
): Layer.Layer<EmbeddingModel.EmbeddingModel, Config.ConfigError, HttpClient.HttpClient> =>
  OpenAICompatibleEmbeddingModel.layer(compatibleModelOptions(options)).pipe(
    Layer.provide(OpenAICompatibleClient.layerConfig(compatibleClientOptions(options))),
  )
