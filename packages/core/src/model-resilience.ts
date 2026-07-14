import { Cause, Context, Effect, Function, Layer, Schedule, Schema, Stream } from "effect"
import { AiError, LanguageModel, Response, Tool } from "effect/unstable/ai"
/** @experimental Classification of a model-call failure. */
export type Classification = "transient" | "terminal"

/** @experimental Retry policy for model calls. */
export interface Interface {
  readonly classify: (error: unknown) => Classification
  readonly retrySchedule: Schedule.Schedule<unknown>
}

/** @experimental */
export class ModelResilience extends Context.Service<ModelResilience, Interface>()(
  "@batonfx/core/model-resilience/ModelResilience",
) {}

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
        Stream.suspend(() => {
          let emitted = false
          return model.streamText(options).pipe(
            Stream.tap(() =>
              Effect.sync(() => {
                emitted = true
              }),
            ),
            Stream.catchCause((cause) => {
              if (Cause.hasInterrupts(cause)) return Stream.failCause(cause)
              const error = Cause.squash(cause)
              return emitted ? Stream.make(Response.makePart("error", { error })) : Stream.failCause(cause)
            }),
          )
        }).pipe(Stream.retry(retryStreamSchedule(resilience)))) as unknown as LanguageModel.Service["streamText"],
    }) as LanguageModel.Service,
)
