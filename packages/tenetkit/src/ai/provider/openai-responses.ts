import { OpenAiClient } from "@effect/ai-openai"
import { ModelRegistry } from "tenetkit"
import { Config, Layer, Redacted } from "effect"
import { HttpClient } from "effect/unstable/http"
import { isAvailabilityFailure } from "../model/model-failure.js"
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

/** @experimental */
export const layer = (
  input: LayerOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: input.provider ?? "openai-responses",
      model: input.model,
      layer: openAiLanguageModelLayer(input),
      toolJsonSchemaCompiler,
      isAvailabilityFailure,
      ...(input.classifyFailure === undefined ? {} : { classifyFailure: input.classifyFailure }),
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(
    Layer.provide(
      openAiLayerConfig({
        ...input.clientConfig,
        ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
        ...(input.baseUrl === undefined ? {} : { apiUrl: Config.succeed(input.baseUrl) }),
      }),
    ),
  )

/** @experimental */
export { decodeConfig, openAiLayerConfig as layerConfig, toolJsonSchemaCompiler }
