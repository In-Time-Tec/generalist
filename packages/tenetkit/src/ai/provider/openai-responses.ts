import { OpenAiClient } from "@effect/ai-openai"
import { ModelRegistry } from "../../core/index.js"
import { Config, Layer, Redacted } from "effect"
import { HttpClient } from "effect/unstable/http"
import { isAvailabilityFailure } from "../model/failure.js"
import {
  decodeConfig,
  layerConfig as openAiLayerConfig,
  openAiLanguageModelLayer,
  toolJsonSchemaCompiler,
  type Config as OpenAiConfig,
  type RegistrationOptions,
} from "./openai.js"

/** @experimental */
export interface OpenAiResponsesInput extends RegistrationOptions {
  readonly provider?: string
  readonly model: string
  readonly config?: OpenAiConfig
  readonly classifyFailure?: ModelRegistry.FailureClassifier
}

/** @experimental */
export interface LayerOptions extends OpenAiResponsesInput {
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly baseUrl?: string
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey" | "apiUrl">
}

const registrationOptions = (input: LayerOptions) => {
  const required = {
    provider: input.provider ?? "openai-responses",
    model: input.model,
    layer: openAiLanguageModelLayer(input),
    toolJsonSchemaCompiler,
    isAvailabilityFailure,
  } as const
  const classified =
    input.classifyFailure === undefined ? required : { ...required, classifyFailure: input.classifyFailure }
  const registered =
    input.registrationKey === undefined ? classified : { ...classified, registrationKey: input.registrationKey }
  return input.metadata === undefined ? registered : { ...registered, metadata: input.metadata }
}

const clientOptions = (input: LayerOptions) => {
  const configured = input.apiKey === undefined ? input.clientConfig : { ...input.clientConfig, apiKey: input.apiKey }
  return input.baseUrl === undefined ? configured : { ...configured, apiUrl: Config.succeed(input.baseUrl) }
}

/** @experimental */
export const layer = (
  input: LayerOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([ModelRegistry.registration(registrationOptions(input))]).pipe(
    Layer.provide(openAiLayerConfig(clientOptions(input))),
  )

/** @experimental */
export { decodeConfig, openAiLayerConfig as layerConfig, toolJsonSchemaCompiler }
