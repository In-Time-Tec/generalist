import { OpenAiClient as OpenAIClient } from "@effect/ai-openai"
import {
  type FailureClassifier,
  type ModelRegistry,
  layer as modelRegistryLayer,
  registration,
} from "../../core/model/registry.js"
import { Config, Layer, Redacted } from "effect"
import { LanguageModel, Model } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
import { isAvailabilityFailure } from "../model/failure.js"
import { layerLanguageModel } from "./openai-model.js"
import {
  decodeConfig,
  layerConfig as openAiLayerConfig,
  toolJsonSchemaCompiler,
  type Config as OpenAIConfig,
  type RegistrationOptions,
} from "./openai.js"
export interface Options extends RegistrationOptions {
  readonly provider?: string
  readonly model: string
  readonly config?: OpenAIConfig
  readonly classifyFailure?: FailureClassifier
}
export interface ClientOptions extends Options {
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly baseUrl?: string
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAIClient.layerConfig>[0]>, "apiKey" | "apiUrl">
}

const registrationOptions = (input: ClientOptions) => {
  const required = {
    provider: input.provider ?? "openai-responses",
    model: input.model,
    layer: layerLanguageModel(input),
    toolJsonSchemaCompiler,
    isAvailabilityFailure,
  } as const
  const classified =
    input.classifyFailure === undefined ? required : { ...required, classifyFailure: input.classifyFailure }
  const registered =
    input.registrationKey === undefined ? classified : { ...classified, registrationKey: input.registrationKey }
  return input.metadata === undefined ? registered : { ...registered, metadata: input.metadata }
}

const clientOptions = (input: ClientOptions) => {
  const configured = input.apiKey === undefined ? input.clientConfig : { ...input.clientConfig, apiKey: input.apiKey }
  return input.baseUrl === undefined ? configured : { ...configured, apiUrl: Config.succeed(input.baseUrl) }
}
export const layer = (input: ClientOptions): Layer.Layer<ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  modelRegistryLayer([registration(registrationOptions(input))]).pipe(
    Layer.provide(openAiLayerConfig(clientOptions(input))),
  )

/** Model layer over `OpenAiClient`; provide it to a run with `Effect.provide`. */
export const layerModel = (
  input: Options,
): Model.Model<string, LanguageModel.LanguageModel, OpenAIClient.OpenAiClient> =>
  Model.make(input.provider ?? "openai-responses", input.model, layerLanguageModel(input))
export { decodeConfig, openAiLayerConfig as layerConfig, toolJsonSchemaCompiler }
