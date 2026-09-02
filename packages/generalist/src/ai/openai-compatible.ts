import { OpenAiClient as OpenAIClient } from "@effect/ai-openai-compat"
import { Config, Layer, Redacted } from "effect"
import type { HttpClient } from "effect/unstable/http"
import type { ModelRegistry } from "../core/model/registry.js"
import { layer as chatCompletionsLayer, type ClientOptions } from "./provider/openai-chat-completions.js"
export interface Options extends Omit<ClientOptions, "provider"> {
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAIClient.layerConfig>[0]>, "apiKey" | "apiUrl">
}
export interface AzureOptions extends Options {
  readonly resource: string
}

const preset = (
  provider: string,
  baseUrl: string,
  input: Options,
): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  chatCompletionsLayer({ ...input, provider, baseUrl })
export const layerGroq = (input: Options): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("groq", "https://api.groq.com/openai/v1", input)
export const layerMistral = (input: Options): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("mistral", "https://api.mistral.ai/v1", input)
export const layerXAI = (input: Options): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("xai", "https://api.x.ai/v1", input)
export const layerDeepSeek = (input: Options): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("deepseek", "https://api.deepseek.com/v1", input)
export const layerGoogleAIStudio = (
  input: Options,
): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("google", "https://generativelanguage.googleapis.com/v1beta/openai/", input)
export const layerAzureOpenAI = (
  input: AzureOptions,
): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("azure", `https://${input.resource}.openai.azure.com/openai/v1`, input)
export const layerOllama = (input: Options): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("ollama", "http://localhost:11434/v1", input)
