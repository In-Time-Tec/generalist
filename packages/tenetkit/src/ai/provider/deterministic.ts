import { OpenAiClient as OpenAIClient } from "@effect/ai-openai"
import { ModelRegistry } from "../../core/index.js"
import { Config, Effect, Layer, Option, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { registration as registerOpenAI, type ClientOptions, type RegistrationOptions } from "./openai.js"

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
export interface Options extends RegistrationOptions {
  readonly provider?: string
  readonly model?: string
}

const deterministicRegistrationOptions = (input: Options) => {
  const required = {
    provider: input.provider ?? "deterministic",
    model: input.model ?? "deterministic",
    layer: deterministicModelLayer,
    isAvailabilityFailure: () => false,
  } as const
  const registered =
    input.registrationKey === undefined ? required : { ...required, registrationKey: input.registrationKey }
  return input.metadata === undefined ? registered : { ...registered, metadata: input.metadata }
}

/** @experimental */
export const registration = (input: Options = {}): Effect.Effect<ModelRegistry.Registration, never, never> =>
  ModelRegistry.registration(deterministicRegistrationOptions(input))

/** @experimental */
export const layer = (input: Options = {}): Layer.Layer<ModelRegistry.ModelRegistry> =>
  ModelRegistry.layer([registration(input)])

/** @experimental */
export interface OpenAIFallbackOptions extends ClientOptions {
  readonly fallbackModel: string
  readonly fallbackProvider?: string
}

/** @experimental */
export const layerOpenAI = (options: OpenAIFallbackOptions) =>
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
            OpenAIClient.layerConfig({
              ...options.clientConfig,
              apiKey: Config.succeed(apiKey),
            }),
          ).pipe(
            Effect.flatMap((context) =>
              registerOpenAI(openAiRegistrationOptions(options)).pipe(Effect.provide(context)),
            ),
            Effect.asSome,
          ),
      })
      return ModelRegistry.layer([
        Effect.succeed(deterministic),
        ...(Option.isSome(openAiRegistration) ? [Effect.succeed(openAiRegistration.value)] : []),
      ])
    }),
  )

const openAiRegistrationOptions = (options: OpenAIFallbackOptions) => {
  const required = { model: options.model }
  const configured = options.config === undefined ? required : { ...required, config: options.config }
  const registered =
    options.registrationKey === undefined ? configured : { ...configured, registrationKey: options.registrationKey }
  return options.metadata === undefined ? registered : { ...registered, metadata: options.metadata }
}
