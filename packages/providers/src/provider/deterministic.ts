import { OpenAiClient } from "@effect/ai-openai"
import { ModelRegistry } from "@batonfx/core"
import type { ModelRegistryFacade } from "@batonfx/core"
import { Config, Effect, Layer, Option, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
import { registration as registerOpenAi, type LayerOptions, type RegistrationOptions } from "./openai.js"

const deterministicUsage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
})

const deterministicFinish = Response.makePart("finish", {
  reason: "stop",
  usage: deterministicUsage,
  response: undefined,
})

const deterministicModelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () =>
      Effect.succeed([
        { type: "text", text: "deterministic response" },
        { type: "finish", reason: "stop", usage: deterministicUsage, response: undefined },
      ]),
    streamText: () =>
      Stream.make(
        Response.makePart("text-delta", { id: "text", delta: "deterministic response" }),
        deterministicFinish,
      ),
  }),
)

/** @experimental */
export interface DeterministicInput extends RegistrationOptions {
  readonly provider?: string
  readonly model?: string
}

/** @experimental */
export const registration = (input: DeterministicInput = {}): ReturnType<ModelRegistryFacade["registration"]> =>
  ModelRegistry.registration({
    provider: input.provider ?? "deterministic",
    model: input.model ?? "deterministic",
    layer: deterministicModelLayer,
    isAvailabilityFailure: () => false,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const layer = (input: DeterministicInput = {}): Layer.Layer<ModelRegistry.ModelRegistry> =>
  ModelRegistry.layer([registration(input)]) as Layer.Layer<ModelRegistry.ModelRegistry>

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
              registerOpenAi({
                model: options.model,
                ...(options.config === undefined ? {} : { config: options.config }),
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
