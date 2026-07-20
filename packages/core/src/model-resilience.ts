import { Cause, Context, Effect, Function, Layer, Result, Schedule, Schema, Stream } from "effect"
import { AiError, LanguageModel, Response, Tool } from "effect/unstable/ai"
/** @experimental Classification of a model-call failure. */
export type Classification = "transient" | "terminal"

/** @experimental Retry policy for model calls. */
export interface Interface {
  readonly classify: (error: unknown) => Classification
  readonly retrySchedule: Schedule.Schedule<unknown>
}

/** @experimental */
export class ModelResilience extends Context.Service<ModelResilience, Interface>()("@batonfx/core/ModelResilience") {}

/** @experimental */
export const defaultClassify = (error: unknown): Classification =>
  AiError.isAiError(error) && error.isRetryable ? "transient" : "terminal"

/** @experimental */
export const none: Interface = { classify: () => "terminal", retrySchedule: Schedule.recurs(0) }

/** @experimental */
export const make = (input?: Partial<Interface>): Interface => ({
  classify: input?.classify ?? defaultClassify,
  retrySchedule: input?.retrySchedule ?? none.retrySchedule,
})

/** @experimental */
export const layer = (input?: Partial<Interface>): Layer.Layer<ModelResilience> =>
  Layer.succeed(ModelResilience, ModelResilience.of(make(input)))

/** @experimental */
export const testLayer = (implementation: Interface): Layer.Layer<ModelResilience> =>
  Layer.succeed(ModelResilience, ModelResilience.of(implementation))

const retryEffect = <A, E, R>(effect: () => Effect.Effect<A, E, R>, resilience: Interface): Effect.Effect<A, E, R> =>
  Effect.suspend(effect).pipe(
    Effect.map((value): Result.Result<A, Cause.Cause<E>> => Result.succeed(value)),
    Effect.catchCause((cause): Effect.Effect<Result.Result<A, Cause.Cause<E>>, E> => {
      const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
      return reason === undefined || !Cause.isFailReason(reason)
        ? Effect.succeed(Result.fail(cause))
        : Effect.fail(reason.error)
    }),
    Effect.retry({
      schedule: resilience.retrySchedule as Schedule.Schedule<unknown, E>,
      while: (error) => resilience.classify(error) === "transient",
    }),
    Effect.flatMap((result) =>
      Result.isFailure(result) ? Effect.failCause(result.failure) : Effect.succeed(result.success),
    ),
  )

const retryStreamSchedule = (resilience: Interface): Schedule.Schedule<unknown, unknown> =>
  resilience.retrySchedule.pipe(
    Schedule.while(({ input }) => resilience.classify(input) === "transient"),
  ) as Schedule.Schedule<unknown, unknown>

const retryStream = <A, E, R>(
  stream: () => Stream.Stream<A, E, R>,
  onEmittedFailure: (error: E) => A,
  resilience: Interface,
): Stream.Stream<A, E, R> =>
  Stream.suspend(() => {
    let emitted = false
    return stream().pipe(
      Stream.map((value): Result.Result<A, Cause.Cause<E>> => Result.succeed(value)),
      Stream.tap(() =>
        Effect.sync(() => {
          emitted = true
        }),
      ),
      Stream.catchCause((cause): Stream.Stream<Result.Result<A, Cause.Cause<E>>, E> => {
        const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
        if (reason === undefined || !Cause.isFailReason(reason)) return Stream.succeed(Result.fail(cause))
        return emitted ? Stream.succeed(Result.succeed(onEmittedFailure(reason.error))) : Stream.fail(reason.error)
      }),
    )
  }).pipe(
    Stream.retry(retryStreamSchedule(resilience)),
    Stream.flatMap(
      (result): Stream.Stream<A, E> =>
        Result.isFailure(result) ? Stream.failCause(result.failure) : Stream.succeed(result.success),
    ),
  )

/** @experimental */
export const apply: {
  (resilience: Interface): (model: LanguageModel.Service) => LanguageModel.Service
  (model: LanguageModel.Service, resilience: Interface): LanguageModel.Service
} = Function.dual(
  2,
  (model: LanguageModel.Service, resilience: Interface): LanguageModel.Service =>
    ({
      ...model,
      generateText: ((options: never) =>
        retryEffect(() => model.generateText(options), resilience)) as unknown as LanguageModel.Service["generateText"],
      generateObject: (<
        ObjectEncoded extends Record<string, unknown>,
        StructuredOutputSchema extends Schema.Codec<unknown, ObjectEncoded, unknown, unknown>,
        Tools extends Record<string, Tool.Any>,
      >(
        options: LanguageModel.GenerateObjectOptions<Tools, StructuredOutputSchema>,
      ) => {
        const generate = model.generateObject
        return retryEffect(() => generate(options), resilience)
      }) as unknown as LanguageModel.Service["generateObject"],
      streamText: ((options: never) =>
        retryStream(
          () => model.streamText(options),
          (error) => Response.makePart("error", { error }),
          resilience,
        )) as unknown as LanguageModel.Service["streamText"],
    }) as LanguageModel.Service,
)
