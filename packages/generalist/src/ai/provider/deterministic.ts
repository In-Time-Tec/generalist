import {
  type ModelRegistry,
  type Registration,
  layer as modelRegistryLayer,
  registration as modelRegistration,
} from "../../core/model/registry.js"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Model, Response } from "effect/unstable/ai"
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

const deterministicModelLayer = (response: string) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () =>
        Effect.succeed([
          { type: "text", text: response },
          { type: "finish", reason: "stop", usage: deterministicUsage, response: undefined },
        ]),
      streamText: () =>
        Stream.make(Response.makePart("text-delta", { id: "text", delta: response }), deterministicFinish),
    }),
  )
export interface Options extends RegistrationOptions {
  readonly provider?: string
  readonly model?: string
  /** Scripted text returned by both streaming and non-streaming calls. */
  readonly response?: string
}

const deterministicRegistrationOptions = (input: Options) => {
  const response = input.response ?? "deterministic response"
  const required = {
    provider: input.provider ?? "deterministic",
    model: input.model ?? "deterministic",
    layer: deterministicModelLayer(response),
    isAvailabilityFailure: () => false,
  } as const
  const registered =
    input.registrationKey === undefined ? required : { ...required, registrationKey: input.registrationKey }
  return input.metadata === undefined ? registered : { ...registered, metadata: input.metadata }
}

/** Scripted model layer for tests and CI; provide it to a run with `Effect.provide`. */
export const layerModel = (input: Options = {}): Model.Model<string, LanguageModel.LanguageModel, never> =>
  Model.make(
    input.provider ?? "deterministic",
    input.model ?? "deterministic",
    deterministicModelLayer(input.response ?? "deterministic response"),
  )
export const registration = (input: Options = {}): Effect.Effect<Registration, never, never> =>
  modelRegistration(deterministicRegistrationOptions(input))
export const layer = (input: Options = {}): Layer.Layer<ModelRegistry> => modelRegistryLayer([registration(input)])
