import { OpenAiClient, OpenAiEmbeddingModel } from "@effect/ai-openai"
import { Config, Layer, Redacted } from "effect"
import { EmbeddingModel } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
export interface Options {
  readonly model: (string & {}) | OpenAiEmbeddingModel.Model
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey">
  readonly config?: Omit<typeof OpenAiEmbeddingModel.Config.Service, "model">
}
export const layer = (
  options: Options,
): Layer.Layer<EmbeddingModel.EmbeddingModel, Config.ConfigError, HttpClient.HttpClient> =>
  OpenAiEmbeddingModel.layer(
    options.config === undefined ? { model: options.model } : { model: options.model, config: options.config },
  ).pipe(Layer.provide(OpenAiClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })))
