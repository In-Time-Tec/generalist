import { OpenAiClient, OpenAiEmbeddingModel } from "@effect/ai-openai"
import {
  OpenAiClient as OpenAiCompatibleClient,
  OpenAiEmbeddingModel as OpenAiCompatibleEmbeddingModel,
} from "@effect/ai-openai-compat"
import { Config, Layer, Redacted } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"

/** @experimental */
export interface OpenAiEmbeddingInput {
  readonly model: (string & {}) | OpenAiEmbeddingModel.Model
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey">
  readonly config?: Omit<typeof OpenAiEmbeddingModel.Config.Service, "model">
}

/** @experimental */
export const layer = (
  options: OpenAiEmbeddingInput,
): Layer.Layer<EmbeddingModel.EmbeddingModel, Config.ConfigError, HttpClient.HttpClient> =>
  OpenAiEmbeddingModel.layer({
    model: options.model,
    ...(options.config === undefined ? {} : { config: options.config }),
  }).pipe(Layer.provide(OpenAiClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })))

/** @experimental */
export interface OpenAiCompatibleEmbeddingInput {
  readonly model: string
  readonly baseUrl: string
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<
    NonNullable<Parameters<typeof OpenAiCompatibleClient.layerConfig>[0]>,
    "apiKey" | "apiUrl"
  >
  readonly config?: Omit<typeof OpenAiCompatibleEmbeddingModel.Config.Service, "model">
}

/** @experimental */
export const layerCompatible = (
  options: OpenAiCompatibleEmbeddingInput,
): Layer.Layer<EmbeddingModel.EmbeddingModel, Config.ConfigError, HttpClient.HttpClient> =>
  OpenAiCompatibleEmbeddingModel.layer({
    model: options.model,
    ...(options.config === undefined ? {} : { config: options.config }),
  }).pipe(
    Layer.provide(
      OpenAiCompatibleClient.layerConfig({
        ...options.clientConfig,
        ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
        apiUrl: Config.succeed(options.baseUrl),
      }),
    ),
  )
