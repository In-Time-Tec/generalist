import { OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { ModelRegistry } from "@batonfx/core"
import { Config, Layer, Redacted } from "effect"
import { AiError } from "effect/unstable/ai"
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
export interface LayerOptions extends OpenRouterInput {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly clientConfig?: Omit<NonNullable<Parameters<typeof OpenRouterClient.layerConfig>[0]>, "apiKey">
}

/** @experimental */
export const layer = (input: LayerOptions) =>
  ModelRegistry.layer([
    ModelRegistry.registration({
      provider: "openrouter",
      model: input.model,
      layer: OpenRouterLanguageModel.layer({
        model: input.model,
        ...(input.config === undefined ? {} : { config: input.config }),
      }),
      classifyFailure,
      ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    }),
  ]).pipe(Layer.provide(OpenRouterClient.layerConfig({ ...input.clientConfig, apiKey: input.apiKey })))

/** @experimental */
export const layerConfig = OpenRouterClient.layerConfig
