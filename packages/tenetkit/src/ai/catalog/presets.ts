import { OpenAiClient } from "@effect/ai-openai-compat"
import { ModelRegistry } from "tenetkit"
import { Config, Layer, Redacted } from "effect"
import type { HttpClient } from "effect/unstable/http"
import { layer as chatCompletionsLayer, type OpenAiChatCompletionsInput } from "../provider/openai-chat-completions.js"

/** @experimental */
export interface PresetInput extends Omit<OpenAiChatCompletionsInput, "provider"> {
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey" | "apiUrl">
}

/** @experimental */
export interface AzureOpenAiInput extends PresetInput {
  readonly resource: string
}

const preset = (
  provider: string,
  baseUrl: string,
  input: PresetInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  chatCompletionsLayer({ ...input, provider, baseUrl })

/** @experimental */
export const layerGroq = (
  input: PresetInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("groq", "https://api.groq.com/openai/v1", input)

/** @experimental */
export const layerMistral = (
  input: PresetInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("mistral", "https://api.mistral.ai/v1", input)

/** @experimental */
export const layerXai = (
  input: PresetInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("xai", "https://api.x.ai/v1", input)

/** @experimental */
export const layerDeepseek = (
  input: PresetInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("deepseek", "https://api.deepseek.com/v1", input)

/** @experimental */
export const layerGoogleAiStudio = (
  input: PresetInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("google", "https://generativelanguage.googleapis.com/v1beta/openai/", input)

/** @experimental */
export const layerAzureOpenAi = (
  input: AzureOpenAiInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("azure", `https://${input.resource}.openai.azure.com/openai/v1`, input)

/** @experimental */
export const layerOllama = (
  input: PresetInput,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  preset("ollama", "http://localhost:11434/v1", input)
