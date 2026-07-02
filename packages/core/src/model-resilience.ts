import { Cause, Context, Effect, Layer, Schedule, Stream } from "effect"
import * as Ai from "effect/unstable/ai"

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
  Ai.AiError.isAiError(error) && error.isRetryable ? "transient" : "terminal"

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
    Effect.retry({
      schedule: resilience.retrySchedule as Schedule.Schedule<unknown, E>,
      while: (error) => resilience.classify(error) === "transient",
    }),
  )

const retryStreamSchedule = (resilience: Interface): Schedule.Schedule<unknown, unknown> =>
  resilience.retrySchedule.pipe(
    Schedule.while(({ input }) => resilience.classify(input) === "transient"),
  ) as Schedule.Schedule<unknown, unknown>

/** @experimental */
export const apply = (model: Ai.LanguageModel.Service, resilience: Interface): Ai.LanguageModel.Service =>
  ({
    ...model,
    generateText: ((options: never) =>
      retryEffect(
        () => model.generateText(options),
        resilience,
      )) as unknown as Ai.LanguageModel.Service["generateText"],
    generateObject: ((options: never) =>
      retryEffect(
        () => model.generateObject(options),
        resilience,
      )) as unknown as Ai.LanguageModel.Service["generateObject"],
    streamText: ((options: never) =>
      Stream.suspend(() => {
        let emitted = false
        return model.streamText(options).pipe(
          Stream.tap(() =>
            Effect.sync(() => {
              emitted = true
            }),
          ),
          Stream.catchCause((cause) => {
            const error = Cause.squash(cause)
            return emitted ? Stream.make(Ai.Response.makePart("error", { error })) : Stream.failCause(cause)
          }),
        )
      }).pipe(Stream.retry(retryStreamSchedule(resilience)))) as unknown as Ai.LanguageModel.Service["streamText"],
  }) as Ai.LanguageModel.Service
