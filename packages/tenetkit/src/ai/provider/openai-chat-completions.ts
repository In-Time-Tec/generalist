import { OpenAiClient as OpenAIClient, OpenAiLanguageModel as OpenAILanguageModel } from "@effect/ai-openai-compat"
import { ModelRegistry } from "../../core/index.js"
import { isAvailabilityFailure } from "../model/failure.js"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import { AiError, OpenAiStructuredOutput as OpenAIStructuredOutput, Tool } from "effect/unstable/ai"
import { layerImageSources } from "../model/image-source.js"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface Options extends RegistrationOptions {
  readonly provider?: string
  readonly model: string
  readonly config?: Config
  readonly classifyFailure?: ModelRegistry.FailureClassifier
}

/** @experimental */
export type Config = Omit<typeof OpenAILanguageModel.Config.Service, "model">

const ConfigSchema = Schema.Record(Schema.String, Schema.Json).pipe(
  Schema.check(
    Schema.makeFilter((config) =>
      "model" in config ? { path: ["model"], issue: "model must be configured by the registration" } : undefined,
    ),
  ),
)

/** @experimental Decodes persisted OpenAI-compatible Chat Completions request configuration. */
type ConfigInput = typeof Schema.Unknown.Type
export const decodeConfig = (options: ConfigInput): Config => Schema.decodeUnknownSync(ConfigSchema)(options ?? {})

/** @experimental */
export const toolJsonSchemaCompiler: ModelRegistry.ToolJsonSchemaCompiler = (tool) =>
  Effect.try({
    try: () => Tool.getJsonSchema(tool, { transformer: OpenAIStructuredOutput.toCodecOpenAI }),
    catch: (error) =>
      AiError.make({
        module: "OpenAILanguageModel",
        method: "prepareTools",
        reason: AiError.UnsupportedSchemaError.make({
          description: error instanceof Error ? error.message : String(error),
        }),
      }),
  })

/** @experimental */
export interface ClientOptions extends Options {
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly baseUrl?: string
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAIClient.layerConfig>[0]>, "apiKey" | "apiUrl">
}

const modelLayer = (input: ClientOptions) =>
  layerImageSources(
    input.config === undefined
      ? OpenAILanguageModel.layer({ model: input.model })
      : OpenAILanguageModel.layer({ model: input.model, config: input.config }),
  )

const registrationOptions = (input: ClientOptions) => {
  const required = {
    provider: input.provider ?? "openai-chat-completions",
    model: input.model,
    layer: modelLayer(input),
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

/** @experimental */
export const layer = (
  input: ClientOptions,
): Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =>
  ModelRegistry.layer([ModelRegistry.registration(registrationOptions(input))]).pipe(
    Layer.provide(OpenAIClient.layerConfig(clientOptions(input))),
  )

/** @experimental */
export const layerConfig = OpenAIClient.layerConfig
