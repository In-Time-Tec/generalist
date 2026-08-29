import { ModelRegistry } from "../../core/model/public/registry.js"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import type { RegistrationOptions } from "../model/registration.js"

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

const deterministicRegistrationOptions = (input: DeterministicInput) => {
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
export const registration = (input: DeterministicInput = {}): Effect.Effect<ModelRegistry.Registration, never, never> =>
  ModelRegistry.registration(deterministicRegistrationOptions(input))

/** @experimental */
export const layer = (input: DeterministicInput = {}): Layer.Layer<ModelRegistry.ModelRegistry> =>
  ModelRegistry.layer([registration(input)])
