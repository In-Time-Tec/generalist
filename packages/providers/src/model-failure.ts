import { Effect, Function, Layer, Stream } from "effect"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"

/** @experimental */
export type Method = "generateText" | "generateObject" | "streamText"

/** @experimental */
export interface FailureInput {
  readonly error: unknown
  readonly metadata: Response.ErrorPart["metadata"]
  readonly method: Method
}

/** @experimental */
export type Resolver = (input: FailureInput) => AiError.AiError

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

const conformFailureModel = (model: LanguageModel.Service, resolve: Resolver): LanguageModel.Service => {
  const generateText = model.generateText as unknown as (
    options: never,
  ) => Effect.Effect<ModelResponse, AiError.AiError>
  const generateObject = model.generateObject as unknown as (
    options: never,
  ) => Effect.Effect<ModelResponse, AiError.AiError>
  const streamText = model.streamText as unknown as (options: never) => Stream.Stream<Response.AnyPart, AiError.AiError>
  return {
    ...model,
    generateText: ((options: never) =>
      generateText(options).pipe(
        Effect.flatMap((response) => normalizeResponse(response, "generateText", resolve)),
      )) as unknown as LanguageModel.Service["generateText"],
    generateObject: ((options: never) =>
      generateObject(options).pipe(
        Effect.flatMap((response) => normalizeResponse(response, "generateObject", resolve)),
      )) as unknown as LanguageModel.Service["generateObject"],
    streamText: ((options: never) =>
      streamText(options).pipe(
        Stream.mapEffect((part) =>
          part.type === "error"
            ? Effect.fail(resolve({ error: part.error, metadata: part.metadata, method: "streamText" }))
            : Effect.succeed(part),
        ),
      )) as unknown as LanguageModel.Service["streamText"],
  }
}

/** @experimental */
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
