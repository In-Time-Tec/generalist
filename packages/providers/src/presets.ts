import * as OpenAiCompat from "@effect/ai-openai-compat"
import { ModelRegistry } from "@batonfx/core"
import { Config, Effect, Redacted } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { openAiCompatible, type OpenAiCompatibleInput } from "./openai-compat"

/** @experimental */
export interface PresetInput extends Omit<OpenAiCompatibleInput, "provider"> {
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<
    NonNullable<Parameters<typeof OpenAiCompat.OpenAiClient.layerConfig>[0]>,
    "apiKey" | "apiUrl"
  >
}

/** @experimental */
export interface AzureOpenAiInput extends PresetInput {
  readonly resource: string
}

const preset = (provider: string, baseUrl: string, input: PresetInput) =>
  openAiCompatible({
    provider,
    model: input.model,
    ...(input.config === undefined ? {} : { config: input.config }),
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  }).pipe(
    Effect.provide(
      OpenAiCompat.OpenAiClient.layerConfig({
        ...input.clientConfig,
        ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
        apiUrl: Config.succeed(baseUrl),
      }),
    ),
    Effect.provide(FetchHttpClient.layer),
  )

const presetLayer = (registration: Effect.Effect<ModelRegistry.Registration, Config.ConfigError>) =>
  ModelRegistry.layerFromRegistrationEffects([registration])

/** @experimental */
export const groq = (input: PresetInput) => preset("groq", "https://api.groq.com/openai/v1", input)

/** @experimental */
export const withGroq = (input: PresetInput) => presetLayer(groq(input))

/** @experimental */
export const mistral = (input: PresetInput) => preset("mistral", "https://api.mistral.ai/v1", input)

/** @experimental */
export const withMistral = (input: PresetInput) => presetLayer(mistral(input))

/** @experimental */
export const xai = (input: PresetInput) => preset("xai", "https://api.x.ai/v1", input)

/** @experimental */
export const withXai = (input: PresetInput) => presetLayer(xai(input))

/** @experimental */
export const deepseek = (input: PresetInput) => preset("deepseek", "https://api.deepseek.com/v1", input)

/** @experimental */
export const withDeepseek = (input: PresetInput) => presetLayer(deepseek(input))

/** @experimental */
export const googleAiStudio = (input: PresetInput) =>
  preset("google", "https://generativelanguage.googleapis.com/v1beta/openai/", input)

/** @experimental */
export const withGoogleAiStudio = (input: PresetInput) => presetLayer(googleAiStudio(input))

/** @experimental */
export const azureOpenAi = (input: AzureOpenAiInput) =>
  preset("azure", `https://${input.resource}.openai.azure.com/openai/v1`, input)

/** @experimental */
export const withAzureOpenAi = (input: AzureOpenAiInput) => presetLayer(azureOpenAi(input))

/** @experimental */
export const ollama = (input: PresetInput) => preset("ollama", "http://localhost:11434/v1", input)

/** @experimental */
export const withOllama = (input: PresetInput) => presetLayer(ollama(input))
