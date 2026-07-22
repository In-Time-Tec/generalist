import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { ModelRegistry } from "@batonfx/core"
import { Config, Effect, Layer, Option, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
import { classifyFailure, type LayerOptions, type RegistrationOptions } from "./openai.js"

const deterministicModelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "deterministic response" }]),
    streamText: () => Stream.make(Response.makePart("text-delta", { id: "text", delta: "deterministic response" })),
  }),
)

/** @experimental */
export interface DeterministicInput extends RegistrationOptions {
  readonly provider?: string
  readonly model?: string
}

/** @experimental */
export const registration = (input: DeterministicInput = {}) =>
  ModelRegistry.registration({
    provider: input.provider ?? "deterministic",
    model: input.model ?? "deterministic",
    layer: deterministicModelLayer,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const layer = (input: DeterministicInput = {}) => ModelRegistry.layer([registration(input)])

/** @experimental */
export interface OpenAiFallbackOptions extends LayerOptions {
  readonly fallbackModel: string
  readonly fallbackProvider?: string
}

/** @experimental */
export const layerOpenAi = (options: OpenAiFallbackOptions) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const deterministic = yield* registration({
        provider: options.fallbackProvider ?? "deterministic",
        model: options.fallbackModel,
      })
      const configuredApiKey = yield* Config.option(options.apiKey)
      const openAiRegistration = yield* Option.match(configuredApiKey, {
        onNone: () => Effect.succeedNone,
        onSome: (apiKey) =>
          Layer.build(
            OpenAiClient.layerConfig({
              ...options.clientConfig,
              apiKey: Config.succeed(apiKey),
            }),
          ).pipe(
            Effect.flatMap((context) =>
              ModelRegistry.registration({
                provider: "openai",
                model: options.model,
                layer: OpenAiLanguageModel.layer({
                  model: options.model,
                  ...(options.config === undefined ? {} : { config: options.config }),
                }),
                classifyFailure,
                ...(options.registrationKey === undefined ? {} : { registrationKey: options.registrationKey }),
                ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
              }).pipe(Effect.provide(context)),
            ),
            Effect.asSome,
          ),
      })
      return ModelRegistry.layer([
        Effect.succeed(deterministic),
        ...(Option.isSome(openAiRegistration) ? [Effect.succeed(openAiRegistration.value)] : []),
      ])
    }),
  ) as Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient>
