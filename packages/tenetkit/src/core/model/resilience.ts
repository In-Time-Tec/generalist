import { Cause, Context, Duration, Effect, Function, Layer, Result, Schedule, Schema, Stream } from "effect"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { adapt } from "./service.js"
import {
  type FailureResolver,
  defaultResolveFailure,
  promoteResponseFailure,
  promoteStreamFailures,
} from "./response/failure.js"
import { isTerminationFailure } from "./stream-termination.js"
import type { ModelFailure } from "./registry.js"

/** @experimental */
export { defaultResolveFailure }

/** @experimental */
export type { FailureInput, FailureResolver } from "./response/failure.js"

/** @experimental Classification of a model-call failure. */
export type Classification = "transient" | "terminal"

/** @experimental Retry and correction policy for one logical model call. */
export interface Service {
  readonly classify: (error: ModelFailure) => Classification
  readonly resolve: FailureResolver
  readonly retrySchedule: Schedule.Schedule<unknown>
  readonly invalidToolCallCorrectionLimit: number
  readonly streamIdleTimeout?: Duration.Input
}

interface MutableInterface {
  classify: Service["classify"]
  resolve: Service["resolve"]
  retrySchedule: Service["retrySchedule"]
  invalidToolCallCorrectionLimit: number
  streamIdleTimeout?: Duration.Input
}

/** @experimental */
export class ModelResilience extends Context.Service<ModelResilience, Service>()(
  "tenetkit/core/model/resilience/ModelResilience",
) {}

/** @experimental A model resilience policy contains an unsafe correction bound. */
export class ModelResilienceMisconfigured extends Schema.TaggedError<ModelResilienceMisconfigured>()(
  "tenetkit/core/ModelResilienceMisconfigured",
  {
    reason: Schema.Literal("invalid-tool-call-correction-limit"),
    message: Schema.String,
  },
) {}

/**
 * @experimental A stream that ended without its terminal event is retryable
 * only while nothing a consumer would replay escaped downstream; retrying after
 * that would duplicate the consumer's transcript.
 */
export const defaultClassify = (error: ModelFailure): Classification => {
  if (isTerminationFailure(error)) return error.emitted._tag === "Nothing" ? "transient" : "terminal"
  return AiError.isAiError(error) && error.isRetryable ? "transient" : "terminal"
}

const defaultProviderClassify = (error: ModelFailure): Classification =>
  AiError.isAiError(error) &&
  (error.reason._tag === "RateLimitError" ||
    error.reason._tag === "InternalProviderError" ||
    (error.reason._tag === "NetworkError" && error.reason.reason === "TransportError"))
    ? "transient"
    : "terminal"

/** @experimental */
export const defaultPolicy: Service = {
  classify: defaultProviderClassify,
  resolve: defaultResolveFailure,
  retrySchedule: Schedule.exponential("2 seconds").pipe(Schedule.upTo({ times: 2, duration: "30 seconds" })),
  invalidToolCallCorrectionLimit: 0,
}

/** @experimental */
export const none: Service = {
  ...defaultPolicy,
  classify: () => "terminal",
  retrySchedule: Schedule.recurs(0),
}

const misconfigured = (): ModelResilienceMisconfigured =>
  ModelResilienceMisconfigured.make({
    reason: "invalid-tool-call-correction-limit",
    message: "invalidToolCallCorrectionLimit must be a safe integer between 0 and 2",
  })

/** @experimental Validate a structurally supplied model resilience policy. */
export const validate = (implementation: Service): Effect.Effect<Service, ModelResilienceMisconfigured> =>
  Effect.suspend(() => {
    const limit = implementation.invalidToolCallCorrectionLimit
    return Number.isSafeInteger(limit) && limit >= 0 && limit <= 2
      ? Effect.succeed(implementation)
      : Effect.fail(misconfigured())
  })

/** @experimental */
export const make = (input?: Partial<Service>): Effect.Effect<Service, ModelResilienceMisconfigured> => {
  const implementation: MutableInterface = {
    classify: input?.classify ?? defaultClassify,
    resolve: input?.resolve ?? defaultPolicy.resolve,
    retrySchedule: input?.retrySchedule ?? defaultPolicy.retrySchedule,
    invalidToolCallCorrectionLimit: input?.invalidToolCallCorrectionLimit ?? 0,
  }
  if (input?.streamIdleTimeout !== undefined) implementation.streamIdleTimeout = input.streamIdleTimeout
  return validate(implementation)
}

/** @experimental */
export const layer = (input?: Partial<Service>): Layer.Layer<ModelResilience, ModelResilienceMisconfigured> =>
  Layer.effect(ModelResilience, make(input).pipe(Effect.map(ModelResilience.of)))

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<ModelResilience, ModelResilienceMisconfigured> =>
  Layer.effect(ModelResilience, validate(implementation).pipe(Effect.map(ModelResilience.of)))

const retryEffect = <A, E, R>(effect: () => Effect.Effect<A, E, R>, resilience: Service): Effect.Effect<A, E, R> =>
  Effect.suspend(effect).pipe(
    Effect.map((value): Result.Result<A, Cause.Cause<E>> => Result.succeed(value)),
    Effect.catchCause((cause): Effect.Effect<Result.Result<A, Cause.Cause<E>>, E> => {
      const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
      return reason === undefined || !Cause.isFailReason(reason)
        ? Effect.succeed(Result.fail(cause))
        : Effect.fail(reason.error)
    }),
    Effect.retry({
      schedule: resilience.retrySchedule,
      while: (error) => resilience.classify(error) === "transient",
    }),
    Effect.flatMap((result) =>
      Result.isFailure(result) ? Effect.failCause(result.failure) : Effect.succeed(result.success),
    ),
  )

const retryStreamSchedule = (resilience: Service): Schedule.Schedule<unknown, unknown> =>
  resilience.retrySchedule.pipe(Schedule.while(({ input }) => resilience.classify(input) === "transient"))

const retryStream = <A, B, E, R>(
  stream: () => Stream.Stream<A, E, R>,
  onEmittedFailure: (error: E) => B,
  resilience: Service,
  consumesReplay: (value: A) => boolean,
): Stream.Stream<A | B, E, R> =>
  Stream.suspend(() => {
    let consumed = false
    let held: Array<A | B> = []
    const release = (): ReadonlyArray<A | B> => {
      const pending = held
      held = []
      return pending
    }
    return stream().pipe(
      Stream.flatMap((value): Stream.Stream<A | B> => {
        if (!consumesReplay(value)) {
          held.push(value)
          return Stream.empty
        }
        consumed = true
        return Stream.fromIterable([...release(), value])
      }),
      Stream.concat(Stream.suspend(() => Stream.fromIterable(release()))),
      Stream.map((value): Result.Result<A | B, Cause.Cause<E>> => Result.succeed(value)),
      Stream.catchCause((cause): Stream.Stream<Result.Result<A | B, Cause.Cause<E>>, E> => {
        const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
        if (reason === undefined || !Cause.isFailReason(reason)) return Stream.succeed(Result.fail(cause))
        if (!consumed) return Stream.fail(reason.error)
        return Stream.fromIterable([...release(), onEmittedFailure(reason.error)].map((value) => Result.succeed(value)))
      }),
    )
  }).pipe(
    Stream.retry(retryStreamSchedule(resilience)),
    Stream.flatMap(
      (result): Stream.Stream<A | B, E> =>
        Result.isFailure(result) ? Stream.failCause(result.failure) : Stream.succeed(result.success),
    ),
  )

/** @experimental */
export const apply: {
  (resilience: Service): (model: LanguageModel.Service) => LanguageModel.Service
  (model: LanguageModel.Service, resilience: Service): LanguageModel.Service
} = Function.dual(
  2,
  (model: LanguageModel.Service, resilience: Service): LanguageModel.Service =>
    adapt<
      AiError.AiError | ModelResilienceMisconfigured,
      AiError.AiError | ModelResilienceMisconfigured,
      AiError.AiError | ModelResilienceMisconfigured
    >(model, {
      generateText: (_options, invoke) =>
        Effect.flatMap(validate(resilience), (validated) =>
          retryEffect(
            () =>
              invoke().pipe(
                Effect.flatMap((response) => promoteResponseFailure(response, "generateText", validated.resolve)),
              ),
            validated,
          ),
        ),
      generateObject: (_options, invoke) =>
        Effect.flatMap(validate(resilience), (validated) =>
          retryEffect(
            () =>
              invoke().pipe(
                Effect.flatMap((response) => promoteResponseFailure(response, "generateObject", validated.resolve)),
              ),
            validated,
          ),
        ),
      streamText: (_options, invoke) =>
        Stream.unwrap(
          validate(resilience).pipe(
            Effect.map((validated) =>
              retryStream(
                () => promoteStreamFailures(invoke(), validated.resolve),
                (error) => Response.makePart("error", { error }),
                validated,
                (part) => part.type !== "response-metadata",
              ),
            ),
          ),
        ),
    }),
)
