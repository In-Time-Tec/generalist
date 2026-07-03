import * as OpenAi from "@effect/ai-openai"
import * as OpenAiCompat from "@effect/ai-openai-compat"
import { Config, Layer, Redacted } from "effect"
import * as Ai from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

/** @experimental */
export interface OpenAiEmbeddingInput {
  readonly model: (string & {}) | OpenAi.OpenAiEmbeddingModel.Model
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAi.OpenAiClient.layerConfig>[0]>, "apiKey">
  readonly config?: Omit<typeof OpenAi.OpenAiEmbeddingModel.Config.Service, "model">
}

/** @experimental */
export const withOpenAiEmbedding = (
  options: OpenAiEmbeddingInput,
): Layer.Layer<Ai.EmbeddingModel.EmbeddingModel, Config.ConfigError> =>
  OpenAi.OpenAiEmbeddingModel.layer({
    model: options.model,
    ...(options.config === undefined ? {} : { config: options.config }),
  }).pipe(
    Layer.provide(OpenAi.OpenAiClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
    Layer.provide(FetchHttpClient.layer),
  )

/** @experimental */
export interface OpenAiCompatibleEmbeddingInput {
  readonly model: string
  readonly baseUrl: string
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<
    NonNullable<Parameters<typeof OpenAiCompat.OpenAiClient.layerConfig>[0]>,
    "apiKey" | "apiUrl"
  >
  readonly config?: Omit<typeof OpenAiCompat.OpenAiEmbeddingModel.Config.Service, "model">
}

/** @experimental */
export const withOpenAiCompatibleEmbedding = (
  options: OpenAiCompatibleEmbeddingInput,
): Layer.Layer<Ai.EmbeddingModel.EmbeddingModel, Config.ConfigError> =>
  OpenAiCompat.OpenAiEmbeddingModel.layer({
    model: options.model,
    ...(options.config === undefined ? {} : { config: options.config }),
  }).pipe(
    Layer.provide(
      OpenAiCompat.OpenAiClient.layerConfig({
        ...options.clientConfig,
        ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
        apiUrl: Config.succeed(options.baseUrl),
      }),
    ),
    Layer.provide(FetchHttpClient.layer),
  )
