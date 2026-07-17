import { OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { AiError } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"
import type { RegistrationOptions } from "./openai.js"

/** @experimental */
export interface OpenRouterInput extends RegistrationOptions {
  readonly model: string
  readonly config?: Omit<typeof OpenRouterLanguageModel.Config.Service, "model">
}

const contextOverflowCodes = new Set(["context_length_exceeded", "context_window_exceeded", "input_too_long"])

/** @experimental */
export const classifyFailure: ModelRegistry.FailureClassifier = (error) => {
  if (!AiError.isAiError(error)) return "other"
  const reason = error.reason
  if (reason._tag !== "InvalidRequestError" && reason._tag !== "UnknownError") return "other"
  const metadata = reason.metadata.openrouter
  if (metadata !== null && metadata !== undefined) {
    if (
      (typeof metadata.errorCode === "string" && contextOverflowCodes.has(metadata.errorCode)) ||
      (metadata.errorType !== null && contextOverflowCodes.has(metadata.errorType))
    ) {
      return "context-overflow"
    }
  }
  return reason._tag === "InvalidRequestError" &&
    /maximum context length|context length exceeded|input exceeds (?:the )?context window|prompt is too long/i.test(
      reason.description ?? "",
    )
    ? "context-overflow"
    : "other"
}

/** @experimental */
export const openRouter = (input: OpenRouterInput) =>
  ModelRegistry.registrationFromLayer({
    provider: "openrouter",
    model: input.model,
    layer: OpenRouterLanguageModel.layer({
      model: input.model,
      ...(input.config === undefined ? {} : { config: input.config }),
    }),
    classifyFailure,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const openRouterClientLayerConfig = OpenRouterClient.layerConfig

/** @experimental */
export interface WithOpenRouterOptions extends OpenRouterInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenRouterClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const withOpenRouter = (options: WithOpenRouterOptions) =>
  ModelRegistry.layerFromRegistrationEffects([openRouter(options)]).pipe(
    Layer.provide(OpenRouterClient.layerConfig({ ...options.clientConfig, apiKey: options.apiKey })),
  )

/** @experimental */
export const withOpenRouterFetch = (options: WithOpenRouterOptions) =>
  withOpenRouter(options).pipe(Layer.provide(FetchHttpClient.layer))
