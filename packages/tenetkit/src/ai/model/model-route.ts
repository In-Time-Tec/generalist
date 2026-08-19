import { Cause, Context, Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool } from "effect/unstable/ai"
import { ModelMiddleware, ModelRegistry, ToolContext } from "tenetkit"

/** @experimental */
export interface Input {
  readonly candidates: readonly [ModelRegistry.Registration, ...ReadonlyArray<ModelRegistry.Registration>]
}

/** @experimental */
export interface Route {
  readonly selection: ModelRegistry.ModelSelection
  readonly registration: ModelRegistry.Registration
}

/** @experimental An ordered candidate route contains a candidate without provider-approved availability semantics. */
export class AvailabilitySemanticsMissing extends Schema.TaggedError<AvailabilitySemanticsMissing>()(
  "tenetkit/ai/AvailabilitySemanticsMissing",
  { provider: Schema.String, model: Schema.String, registrationKey: Schema.optionalKey(Schema.String) },
) {}

interface Candidate {
  readonly identity: ModelRegistry.CandidateIdentity
  readonly model: LanguageModel.Service
  readonly isAvailabilityFailure: ModelRegistry.AvailabilityFailureClassifier
}

const singleFailure = (cause: Cause.Cause<unknown>): unknown | undefined => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? reason.error : undefined
}

type BroadTools = Record<string, Tool.Any>
type GenerateTextOptions = LanguageModel.GenerateTextOptions<BroadTools>
const objectSchema = Schema.Struct({ value: Schema.String })
type GenerateObjectOptions = LanguageModel.GenerateObjectOptions<BroadTools, typeof objectSchema>

const noToolkitOptions = (options: GenerateTextOptions): LanguageModel.GenerateTextOptions<{}> => ({
  prompt: options.prompt,
  ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
  ...(options.disableToolCallResolution === undefined
    ? {}
    : { disableToolCallResolution: options.disableToolCallResolution }),
  ...(options.toolChoice === "auto" || options.toolChoice === "none" || options.toolChoice === "required"
    ? { toolChoice: options.toolChoice }
    : {}),
  toolkit: undefined,
})

const invokeGenerateText = (model: LanguageModel.Service, options: GenerateTextOptions) => {
  if (options.toolkit === undefined) {
    return model.generateText({ ...noToolkitOptions(options), toolkit: undefined })
  }
  const invoked: Effect.Effect<
    LanguageModel.GenerateTextResponse<BroadTools>,
    LanguageModel.ExtractError<GenerateTextOptions>,
    ToolContext.ToolContext
  > = model.generateText({ ...options, toolkit: options.toolkit })
  return invoked
}

const invokeGenerateObject = (
  model: LanguageModel.Service,
  options: GenerateObjectOptions,
): import("effect").Effect.Effect<
  LanguageModel.GenerateObjectResponse<BroadTools, unknown>,
  import("effect/unstable/ai").AiError.AiError,
  ToolContext.ToolContext
> => model.generateObject(options)

const invokeStreamText = (model: LanguageModel.Service, options: GenerateTextOptions) =>
  options.toolkit === undefined
    ? model.streamText({ ...noToolkitOptions(options), toolkit: undefined })
    : model.streamText({ ...options, toolkit: options.toolkit })

const routeModel = (
  candidates: ReadonlyArray<Candidate>,
  instrumentation: ModelRegistry.CandidateRouteInstrumentation,
): LanguageModel.Service => {
  const models = candidates.map((candidate) => instrumentation.instrument(candidate.model, candidate.identity))
  const effect = <A, E, R>(
    invoke: (model: LanguageModel.Service) => Effect.Effect<A, E, R>,
    candidate = 0,
  ): Effect.Effect<A, E, R> =>
    invoke(models[candidate]!).pipe(
      Effect.catchCause((cause) => {
        const error = singleFailure(cause)
        const current = candidates[candidate]!
        const next = candidates[candidate + 1]
        if (error === undefined || next === undefined || !current.isAvailabilityFailure(error)) {
          return Effect.failCause(cause)
        }
        return instrumentation
          .fallbackScheduled({ from: current.identity, to: next.identity, error })
          .pipe(Effect.andThen(effect(invoke, candidate + 1)))
      }),
    )
  const stream = <A extends Response.AnyPart, E, R>(
    invoke: (model: LanguageModel.Service) => Stream.Stream<A, E, R>,
    candidate = 0,
  ): Stream.Stream<A, E, R> =>
    Stream.suspend(() => {
      let escaped = false
      return invoke(models[candidate]!).pipe(
        Stream.tap((part) =>
          Effect.sync(() => {
            if (
              part.type === "reasoning-start" ||
              part.type === "reasoning-delta" ||
              part.type === "reasoning" ||
              part.type === "text-start" ||
              part.type === "text-delta" ||
              part.type === "text" ||
              part.type === "tool-call"
            ) {
              escaped = true
            }
          }),
        ),
        Stream.catchCause((cause) => {
          const error = singleFailure(cause)
          const current = candidates[candidate]!
          const next = candidates[candidate + 1]
          if (escaped || error === undefined || next === undefined || !current.isAvailabilityFailure(error)) {
            return Stream.failCause(cause)
          }
          return Stream.unwrap(
            instrumentation
              .fallbackScheduled({ from: current.identity, to: next.identity, error })
              .pipe(Effect.as(stream(invoke, candidate + 1))),
          )
        }),
      )
    })
  return ModelMiddleware.adapt(candidates[0]!.model, {
    generateText: (options) => effect((model) => invokeGenerateText(model, options)),
    generateObject: (options) => effect((model) => invokeGenerateObject(model, options)),
    streamText: (options) => stream((model) => invokeStreamText(model, options)),
  })
}

const routeIdentity = (registrations: ReadonlyArray<ModelRegistry.Registration>): string =>
  JSON.stringify(
    registrations.map(({ provider, model, registrationKey }) => [provider, model, registrationKey ?? null]),
  )

/** @experimental Construct one exact registry selection and its immutable ordered candidate registration. */
export const make = (input: Input): Effect.Effect<Route, AvailabilitySemanticsMissing> =>
  Effect.gen(function* () {
    for (const candidate of input.candidates) {
      if (candidate.isAvailabilityFailure === undefined) {
        return yield* AvailabilitySemanticsMissing.make({
          provider: candidate.provider,
          model: candidate.model,
          ...(candidate.registrationKey === undefined ? {} : { registrationKey: candidate.registrationKey }),
        })
      }
    }
    const registrationKey = routeIdentity(input.candidates)
    const selection = { provider: "tenetkit/ai", model: "ordered-route", registrationKey } as const
    const routeLayer = Layer.effect(
      LanguageModel.LanguageModel,
      Effect.gen(function* () {
        yield* Effect.scope
        const candidates = yield* Effect.forEach(input.candidates, (registration, candidate) =>
          Layer.build(registration.layer).pipe(
            Effect.map(
              (context): Candidate => ({
                identity: {
                  provider: registration.provider,
                  model: registration.model,
                  ...(registration.registrationKey === undefined
                    ? {}
                    : { registrationKey: registration.registrationKey }),
                  candidate,
                },
                model: Context.get(context, LanguageModel.LanguageModel),
                isAvailabilityFailure: registration.isAvailabilityFailure!,
              }),
            ),
          ),
        )
        return ModelRegistry.withCandidateRoute(candidates[0]!.model, (instrumentation) =>
          routeModel(candidates, instrumentation),
        )
      }),
    )
    const registration = yield* ModelRegistry.registration({ ...selection, layer: routeLayer })
    return { selection, registration }
  })
