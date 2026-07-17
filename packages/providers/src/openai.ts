import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { AiError } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"

/** @experimental */
export interface RegistrationOptions {
  readonly registrationKey?: string
  readonly metadata?: ModelRegistry.Metadata
}

/** @experimental */
export interface OpenAiInput extends RegistrationOptions {
  readonly model: (string & {}) | OpenAiLanguageModel.Model
  readonly config?: Omit<typeof OpenAiLanguageModel.Config.Service, "model">
}

const contextOverflowCodes = new Set(["context_length_exceeded", "context_window_exceeded", "input_too_long"])

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = (error) => {
  if (!AiError.isAiError(error)) return "other"
  const reason = error.reason
  if (reason._tag !== "InvalidRequestError" && reason._tag !== "UnknownError") return "other"
  const metadata = reason.metadata.openai
  if (metadata !== null && metadata !== undefined) {
    if (
      (metadata.errorCode !== null && contextOverflowCodes.has(metadata.errorCode)) ||
      (metadata.errorType !== null && contextOverflowCodes.has(metadata.errorType))
    ) {
      return "context-overflow"
    }
  }
  return reason._tag === "InvalidRequestError" &&
    /maximum context length|context length exceeded|input exceeds (?:the )?context window/i.test(
      reason.description ?? "",
    )
    ? "context-overflow"
    : "other"
}

/** @experimental */
export const openAi = (input: OpenAiInput) =>
  ModelRegistry.registrationFromLayer({
    provider: "openai",
    model: input.model,
    layer: OpenAiLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }),
    classifyFailure,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const openAiClientLayerConfig = OpenAiClient.layerConfig

/** @experimental */
export interface WithOpenAiOptions extends OpenAiInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenAiClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const withOpenAi = (options: WithOpenAiOptions) =>
  ModelRegistry.layerFromRegistrationEffects([openAi(options)]).pipe(
    Layer.provide(OpenAiClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
  )

/** @experimental */
export const withOpenAiFetch = (options: WithOpenAiOptions) =>
  withOpenAi(options).pipe(Layer.provide(FetchHttpClient.layer))
