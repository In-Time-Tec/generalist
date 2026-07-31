import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { ModelRegistry } from "@batonfx/core"
import { Config, Effect, Layer, Redacted } from "effect"
import { AiError, OpenAiStructuredOutput, Tool } from "effect/unstable/ai"
import { layerImageSources } from "./image-source.js"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface OpenAiCompatibleInput extends RegistrationOptions {
  readonly provider?: string
  readonly model: string
  readonly config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">
  readonly classifyFailure?: ModelRegistry.FailureClassifier
}

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
export interface LayerOptions extends OpenAiCompatibleInput {
  readonly apiKey?: Config.Config<Redacted.Redacted<string>>
  readonly baseUrl?: string
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey" | "apiUrl">
}

/** @experimental */
export const layer = (input: LayerOptions) =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: input.provider ?? "openai-compatible",
      model: input.model,
      layer: layerImageSources(
        OpenAiLanguageModel.layer({
          model: input.model,
          ...(input.config === undefined ? {} : { config: input.config }),
        }),
      ),
      toolJsonSchemaCompiler,
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
