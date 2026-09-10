import { Effect, Function, Layer, Stream } from "effect"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { adapt } from "../../core/model/middleware.js"
export type Method = "generateText" | "generateObject" | "streamText"
export interface FailureInput {
  readonly error: unknown
  readonly metadata: Response.ErrorPart["metadata"]
  readonly method: Method
}
export type Resolver = (input: FailureInput) => AiError.AiError

/** @internal Conservative cross-provider availability semantics. */
export const isAvailabilityFailure = (error: FailureInput["error"]): boolean =>
  AiError.isAiError(error) &&
  (error.reason._tag === "RateLimitError" ||
    error.reason._tag === "NetworkError" ||
    error.reason._tag === "InternalProviderError")

interface ModelResponse {
  readonly content: ReadonlyArray<Response.AnyPart>
}

const normalizeResponse = <A extends ModelResponse>(
  response: A,
  method: Method,
  resolve: Resolver,
): Effect.Effect<A, AiError.AiError> => {
  const failure = response.content.find((part) => part.type === "error")
  return failure?.type === "error"
    ? Effect.fail(resolve({ error: failure.error, metadata: failure.metadata, method }))
    : Effect.succeed(response)
}

const conformFailureModel = (model: LanguageModel.Service, resolve: Resolver): LanguageModel.Service =>
  adapt<AiError.AiError, AiError.AiError, AiError.AiError>(model, {
    generateText: (_options, invoke) =>
      invoke().pipe(Effect.flatMap((response) => normalizeResponse(response, "generateText", resolve))),
    generateObject: (_options, invoke) =>
      invoke().pipe(Effect.flatMap((response) => normalizeResponse(response, "generateObject", resolve))),
    streamText: (_options, invoke) =>
      invoke().pipe(
        Stream.mapEffect((part) =>
          part.type === "error"
            ? Effect.fail(resolve({ error: part.error, metadata: part.metadata, method: "streamText" }))
            : Effect.succeed(part),
        ),
      ),
  })
export const layerModelFailures: {
  (
    resolve: Resolver,
  ): <E, R>(layer: Layer.Layer<LanguageModel.LanguageModel, E, R>) => Layer.Layer<LanguageModel.LanguageModel, E, R>
  <E, R>(
    layer: Layer.Layer<LanguageModel.LanguageModel, E, R>,
    resolve: Resolver,
  ): Layer.Layer<LanguageModel.LanguageModel, E, R>
} = Function.dual(
  2,
  <E, R>(
    layer: Layer.Layer<LanguageModel.LanguageModel, E, R>,
    resolve: Resolver,
  ): Layer.Layer<LanguageModel.LanguageModel, E, R> =>
    Layer.effect(
      LanguageModel.LanguageModel,
      Effect.map(LanguageModel.LanguageModel, (model) => conformFailureModel(model, resolve)),
    ).pipe(Layer.provide(layer)),
)
