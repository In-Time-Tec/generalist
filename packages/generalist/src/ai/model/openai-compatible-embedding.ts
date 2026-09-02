import { OpenAiClient, OpenAiEmbeddingModel } from "@effect/ai-openai-compat"
import { Config, Layer, Redacted } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
export interface Input {
  readonly model: string
  readonly baseUrl: string
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey" | "apiUrl">
  readonly config?: Omit<typeof OpenAiEmbeddingModel.Config.Service, "model">
}
export const layer = (
  options: Input,
): Layer.Layer<EmbeddingModel.EmbeddingModel, Config.ConfigError, HttpClient.HttpClient> => {
  const clientOptions: NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]> = {
    ...options.clientConfig,
    apiUrl: Config.succeed(options.baseUrl),
  }
  return OpenAiEmbeddingModel.layer(
    options.config === undefined ? { model: options.model } : { model: options.model, config: options.config },
  ).pipe(
    Layer.provide(
      OpenAiClient.layerConfig(
        options.apiKey === undefined ? clientOptions : { ...clientOptions, apiKey: options.apiKey },
      ),
    ),
  )
}
