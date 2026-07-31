import { Cause, Context, Duration, Effect, Function, Layer, Result, Schedule, Schema, Stream } from "effect"
import { AiError, LanguageModel, Response, Tool } from "effect/unstable/ai"
import {
  type FailureResolver,
  defaultResolveFailure,
  promoteResponseFailure,
  promoteStreamFailures,
} from "./model-response-failure.js"
import { isTerminationFailure } from "./model-stream-termination.js"

/** @experimental */
export { defaultResolveFailure }

/** @experimental */
export type { FailureInput, FailureResolver } from "./model-response-failure.js"

/** @experimental Classification of a model-call failure. */
export type Classification = "transient" | "terminal"

/** @experimental Retry and correction policy for one logical model call. */
export interface Interface {
  readonly classify: (error: unknown) => Classification
  readonly resolve: FailureResolver
  readonly retrySchedule: Schedule.Schedule<unknown>
  readonly invalidToolCallCorrectionLimit: number
  readonly streamIdleTimeout?: Duration.Input
}

/** @experimental */
export class ModelResilience extends Context.Service<ModelResilience, Interface>()("@batonfx/core/ModelResilience") {}

/**
 * @experimental A stream that ended without its terminal event is retryable
 * only while nothing a consumer would replay escaped downstream; retrying after
 * that would duplicate the consumer's transcript.
 */
export const defaultClassify = (error: unknown): Classification =>
  isTerminationFailure(error)
    ? error.emitted._tag === "Nothing"
      ? "transient"
      : "terminal"
    : AiError.isAiError(error) && error.isRetryable
      ? "transient"
      : "terminal"

/** @experimental */
export const none: Interface = {
  classify: () => "terminal",
  resolve: defaultResolveFailure,
  retrySchedule: Schedule.recurs(0),
  invalidToolCallCorrectionLimit: 0,
}

/** @experimental */
export const make = (input?: Partial<Interface>): Interface => ({
  classify: input?.classify ?? defaultClassify,
  resolve: input?.resolve ?? defaultResolveFailure,
  retrySchedule: input?.retrySchedule ?? none.retrySchedule,
  invalidToolCallCorrectionLimit: input?.invalidToolCallCorrectionLimit ?? 0,
  ...(input?.streamIdleTimeout === undefined ? {} : { streamIdleTimeout: input.streamIdleTimeout }),
})

/** @experimental */
export const layer = (input?: Partial<Interface>): Layer.Layer<ModelResilience> =>
  Layer.succeed(ModelResilience, ModelResilience.of(make(input)))

/** @experimental */
export const layerTest = (implementation: Interface): Layer.Layer<ModelResilience> =>
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
  consumesReplay: (value: A) => boolean,
): Stream.Stream<A, E, R> =>
  Stream.suspend(() => {
    let consumed = false
    let held: Array<A> = []
    const release = (): ReadonlyArray<A> => {
      const pending = held
      held = []
      return pending
    }
    return stream().pipe(
      Stream.flatMap((value): Stream.Stream<A> => {
        if (!consumesReplay(value)) {
          held.push(value)
          return Stream.empty
        }
        consumed = true
        return Stream.fromIterable([...release(), value])
      }),
      Stream.concat(Stream.suspend(() => Stream.fromIterable(release()))),
      Stream.map((value): Result.Result<A, Cause.Cause<E>> => Result.succeed(value)),
      Stream.catchCause((cause): Stream.Stream<Result.Result<A, Cause.Cause<E>>, E> => {
        const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
        if (reason === undefined || !Cause.isFailReason(reason)) return Stream.succeed(Result.fail(cause))
        if (!consumed) return Stream.fail(reason.error)
        return Stream.fromIterable([...release(), onEmittedFailure(reason.error)].map((value) => Result.succeed(value)))
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
        retryEffect(
          () =>
            model
              .generateText(options)
              .pipe(Effect.flatMap((response) => promoteResponseFailure(response, "generateText", resilience.resolve))),
          resilience,
        )) as unknown as LanguageModel.Service["generateText"],
      generateObject: (<
        ObjectEncoded extends Record<string, unknown>,
        StructuredOutputSchema extends Schema.Codec<unknown, ObjectEncoded, unknown, unknown>,
        Tools extends Record<string, Tool.Any>,
      >(
        options: LanguageModel.GenerateObjectOptions<Tools, StructuredOutputSchema>,
      ) => {
        const generate = model.generateObject
        return retryEffect(
          () =>
            generate(options).pipe(
              Effect.flatMap((response) => promoteResponseFailure(response, "generateObject", resilience.resolve)),
            ),
          resilience,
        )
      }) as unknown as LanguageModel.Service["generateObject"],
      streamText: ((options: never) =>
        retryStream(
          () => promoteStreamFailures(model.streamText(options), resilience.resolve),
          (error) => Response.makePart("error", { error }),
          resilience,
          (part: Response.StreamPart<never>) => part.type !== "response-metadata",
        )) as unknown as LanguageModel.Service["streamText"],
    }) as LanguageModel.Service,
)
