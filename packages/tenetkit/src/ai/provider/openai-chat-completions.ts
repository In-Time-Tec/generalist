import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { ModelRegistry } from "tenetkit"
import { isAvailabilityFailure } from "../model/model-failure.js"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import { AiError, OpenAiStructuredOutput, Tool } from "effect/unstable/ai"
import { layerImageSources } from "../model/image-source.js"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface OpenAiChatCompletionsInput extends RegistrationOptions {
  readonly provider?: string
  readonly model: string
  readonly config?: Config
  readonly classifyFailure?: ModelRegistry.FailureClassifier
}

/** @experimental */
export type Config = Omit<typeof OpenAiLanguageModel.Config.Service, "model">

const ConfigSchema = Schema.Record(Schema.String, Schema.Json).pipe(
  Schema.check(
    Schema.makeFilter((config) =>
      "model" in config ? { path: ["model"], issue: "model must be configured by the registration" } : undefined,
    ),
  ),
)

/** @experimental Decodes persisted OpenAI-compatible Chat Completions request configuration. */
export const decodeConfig = (options: unknown): Config =>
  Schema.decodeUnknownSync(ConfigSchema)(options ?? {}) as Config

/** @experimental */
export const toolJsonSchemaCompiler: ModelRegistry.ToolJsonSchemaCompiler = (tool) =>
  Effect.try({
    try: () => Tool.getJsonSchema(tool, { transformer: OpenAiStructuredOutput.toCodecOpenAI }),
    catch: (error) =>
      AiError.make({
        module: "OpenAiLanguageModel",
        method: "prepareTools",
        reason: AiError.UnsupportedSchemaError.make({
          description: error instanceof Error ? error.message : String(error),
        }),
      }),
  })

/** @experimental */
export interface LayerOptions extends OpenAiChatCompletionsInput {
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
      provider: input.provider ?? "openai-chat-completions",
      model: input.model,
      layer: layerImageSources(
        OpenAiLanguageModel.layer({
          model: input.model,
          ...(input.config === undefined ? {} : { config: input.config }),
        }),
      ),
      toolJsonSchemaCompiler,
      isAvailabilityFailure,
      ...(input.classifyFailure === undefined ? {} : { classifyFailure: input.classifyFailure }),
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(
    Layer.provide(
      OpenAiClient.layerConfig({
        ...input.clientConfig,
        ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
        ...(input.baseUrl === undefined ? {} : { apiUrl: Config.succeed(input.baseUrl) }),
      }),
    ),
  )

/** @experimental */
export const layerConfig = OpenAiClient.layerConfig
