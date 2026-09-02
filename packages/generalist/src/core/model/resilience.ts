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
export { defaultResolveFailure }
export type { FailureInput, FailureResolver } from "./response/failure.js"

/** Classification of a model-call failure. */
export type Classification = "transient" | "terminal"

/** Retry and correction policy for one logical model call. */
export interface Policy {
  readonly classify: (cause: unknown) => Classification
  readonly resolve: FailureResolver
  readonly retrySchedule: Schedule.Schedule<unknown>
  readonly invalidToolCallCorrectionLimit: number
  readonly streamIdleTimeout?: Duration.Input
}

interface MutablePolicy {
  classify: Policy["classify"]
  resolve: Policy["resolve"]
  retrySchedule: Policy["retrySchedule"]
  invalidToolCallCorrectionLimit: number
  streamIdleTimeout?: Duration.Input
}
export class ModelResilience extends Context.Service<ModelResilience, Policy>()(
  "generalist/core/model/resilience/ModelResilience",
) {}

/** A model resilience policy contains an unsafe correction bound. */
export class Misconfigured extends Schema.TaggedError<Misconfigured>()("generalist/core/ModelResilienceMisconfigured", {
  reason: Schema.Literal("invalid-tool-call-correction-limit"),
  message: Schema.String,
}) {}

/**
 * A stream that ended without its terminal event is retryable
 * only while nothing a consumer would replay escaped downstream; retrying after
 * that would duplicate the consumer's transcript.
 */
export const defaultClassify = (cause: unknown): Classification => {
  if (isTerminationFailure(cause)) return cause.emitted._tag === "Nothing" ? "transient" : "terminal"
  return AiError.isAiError(cause) && cause.isRetryable ? "transient" : "terminal"
}

const defaultProviderClassify = (cause: unknown): Classification =>
  AiError.isAiError(cause) &&
  (cause.reason._tag === "RateLimitError" ||
    cause.reason._tag === "InternalProviderError" ||
    (cause.reason._tag === "NetworkError" && cause.reason.reason === "TransportError"))
    ? "transient"
    : "terminal"
export const defaultPolicy: Policy = {
  classify: defaultProviderClassify,
  resolve: defaultResolveFailure,
  retrySchedule: Schedule.exponential("500 millis").pipe(Schedule.jittered, Schedule.upTo({ times: 5 })),
  invalidToolCallCorrectionLimit: 0,
}
export const none: Policy = {
  ...defaultPolicy,
  classify: () => "terminal",
  retrySchedule: Schedule.recurs(0),
}

const misconfigured = (): Misconfigured =>
  Misconfigured.make({
    reason: "invalid-tool-call-correction-limit",
    message: "invalidToolCallCorrectionLimit must be a safe integer between 0 and 2",
  })

/** Validate a structurally supplied model resilience policy. */
export const validate = (implementation: Policy): Effect.Effect<Policy, Misconfigured> =>
  Effect.suspend(() => {
    const limit = implementation.invalidToolCallCorrectionLimit
    return Number.isSafeInteger(limit) && limit >= 0 && limit <= 2
      ? Effect.succeed(implementation)
      : Effect.fail(misconfigured())
  })
export const make = (input?: Partial<Policy>): Effect.Effect<Policy, Misconfigured> => {
  const implementation: MutablePolicy = {
    classify: input?.classify ?? defaultClassify,
    resolve: input?.resolve ?? defaultPolicy.resolve,
    retrySchedule: input?.retrySchedule ?? defaultPolicy.retrySchedule,
    invalidToolCallCorrectionLimit: input?.invalidToolCallCorrectionLimit ?? 0,
  }
  if (input?.streamIdleTimeout !== undefined) implementation.streamIdleTimeout = input.streamIdleTimeout
  return validate(implementation)
}
export const layer = (input?: Partial<Policy>): Layer.Layer<ModelResilience, Misconfigured> =>
  Layer.effect(ModelResilience, make(input).pipe(Effect.map(ModelResilience.of)))
export const layerTest = (implementation: Policy): Layer.Layer<ModelResilience, Misconfigured> =>
  Layer.effect(ModelResilience, validate(implementation).pipe(Effect.map(ModelResilience.of)))

const retryEffect = <A, E, R>(effect: () => Effect.Effect<A, E, R>, resilience: Policy): Effect.Effect<A, E, R> =>
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

const retryStreamSchedule = (resilience: Policy): Schedule.Schedule<unknown, unknown> =>
  resilience.retrySchedule.pipe(Schedule.while(({ input }) => resilience.classify(input) === "transient"))

const retryStream = <A, B, E, R>(
  stream: () => Stream.Stream<A, E, R>,
  onEmittedFailure: (error: E) => B,
  resilience: Policy,
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
export const apply: {
  (resilience: Policy): (model: LanguageModel.Service) => LanguageModel.Service
  (model: LanguageModel.Service, resilience: Policy): LanguageModel.Service
} = Function.dual(
  2,
  (model: LanguageModel.Service, resilience: Policy): LanguageModel.Service =>
    adapt<AiError.AiError | Misconfigured, AiError.AiError | Misconfigured, AiError.AiError | Misconfigured>(model, {
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
