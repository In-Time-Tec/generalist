import { Cause, Context, Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { adapt, invokeGenerateObject, invokeGenerateText, invokeStreamText } from "../../core/model/service.js"
import {
  type AvailabilityFailureClassifier,
  type ModelSelection,
  type Registration,
  registration as modelRegistration,
} from "../../core/model/registry.js"
import {
  type CandidateIdentity,
  type CandidateRouteInstrumentation,
  withCandidateRoute,
} from "../../core/model/registry-internal.js"

/** @experimental */
export interface Input {
  readonly candidates: readonly [Registration, ...ReadonlyArray<Registration>]
}

/** @experimental */
export interface Route {
  readonly selection: ModelSelection
  readonly registration: Registration
}

/** @experimental An ordered candidate route contains a candidate without provider-approved availability semantics. */
export class AvailabilitySemanticsMissing extends Schema.TaggedError<AvailabilitySemanticsMissing>()(
  "tenetkit/ai/AvailabilitySemanticsMissing",
  { provider: Schema.String, model: Schema.String, registrationKey: Schema.optionalKey(Schema.String) },
) {}

interface Candidate {
  readonly identity: CandidateIdentity
  readonly model: LanguageModel.Service
  readonly isAvailabilityFailure: AvailabilityFailureClassifier
}

const singleFailure = <E>(cause: Cause.Cause<E>): E | undefined => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? reason.error : undefined
}

const routeModel = (
  candidates: ReadonlyArray<Candidate>,
  instrumentation: CandidateRouteInstrumentation,
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
  return adapt(candidates[0]!.model, {
    generateText: (options) => effect((model) => invokeGenerateText(model, options)),
    generateObject: (options) => effect((model) => invokeGenerateObject(model, options)),
    streamText: (options) => stream((model) => invokeStreamText(model, options)),
  })
}

const routeIdentity = (registrations: ReadonlyArray<Registration>): string =>
  JSON.stringify(
    registrations.map(({ provider, model, registrationKey }) => [provider, model, registrationKey ?? null]),
  )

/** @experimental Construct one exact registry selection and its immutable ordered candidate registration. */
export const make = (input: Input): Effect.Effect<Route, AvailabilitySemanticsMissing> =>
  Effect.gen(function* () {
    for (const candidate of input.candidates) {
      if (candidate.isAvailabilityFailure === undefined) {
        const missing = {
          provider: candidate.provider,
          model: candidate.model,
        }
        return yield* AvailabilitySemanticsMissing.make(
          candidate.registrationKey === undefined
            ? missing
            : { ...missing, registrationKey: candidate.registrationKey },
        )
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
            Effect.map((context): Candidate => {
              const identity = {
                provider: registration.provider,
                model: registration.model,
                candidate,
              }
              return {
                identity:
                  registration.registrationKey === undefined
                    ? identity
                    : { ...identity, registrationKey: registration.registrationKey },
                model: Context.get(context, LanguageModel.LanguageModel),
                isAvailabilityFailure: registration.isAvailabilityFailure!,
              }
            }),
          ),
        )
        return withCandidateRoute(candidates[0].model, (instrumentation) => routeModel(candidates, instrumentation))
      }),
    )
    const registration = yield* modelRegistration({ ...selection, layer: routeLayer })
    return { selection, registration }
  })
