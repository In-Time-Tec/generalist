import { OpenAiClient } from "@effect/ai-openai"
import { ModelRegistry } from "@batonfx/core"
import { Config, Effect, Layer, Option, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { FetchHttpClient } from "effect/unstable/http"
import { openAi, type RegistrationOptions, type WithOpenAiOptions } from "./openai.js"

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
export const deterministicModel = (input: DeterministicInput = {}) =>
  ModelRegistry.registration({
    provider: input.provider ?? "deterministic",
    model: input.model ?? "deterministic",
    layer: deterministicModelLayer,
    ...(input.registrationKey === undefined ? {} : { registrationKey: input.registrationKey }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  })

/** @experimental */
export const withDeterministic = (input: DeterministicInput = {}) => ModelRegistry.layer([deterministicModel(input)])

/** @experimental */
export interface WithOpenAiOrDeterministicOptions extends WithOpenAiOptions {
  readonly fallbackModel: string
  readonly fallbackProvider?: string
}

/** @experimental */
export const withOpenAiOrDeterministic = (options: WithOpenAiOrDeterministicOptions) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const deterministic = yield* deterministicModel({
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
            Effect.flatMap((context) => openAi(options).pipe(Effect.provide(context))),
            Effect.asSome,
          ),
      })
      return ModelRegistry.layer([
        Effect.succeed(deterministic),
        ...(Option.isSome(openAiRegistration) ? [Effect.succeed(openAiRegistration.value)] : []),
      ])
    }),
  )

/** @experimental */
export const withOpenAiOrDeterministicFetch = (options: WithOpenAiOrDeterministicOptions) =>
  withOpenAiOrDeterministic(options).pipe(Layer.provide(FetchHttpClient.layer))
