import { Cause, Clock, Effect, Exit, Function, Option, Stream } from "effect"
import { AiError, LanguageModel, Model, Response } from "effect/unstable/ai"
import {
  correct as correctInvalidToolCall,
  type StreamTextOptions,
  type StreamTextPart,
} from "./model-call-correction.js"
import type { IdentityCell } from "./model-attempt-identity.js"
import { attemptModel, type CallContext, type InstrumentOptions } from "./model-attempt-instrumentation.js"
import { memoized, singleFailure, tapRetryTelemetry } from "./model-attempt-observation.js"
import { classifyFailure } from "./model-registry.js"
import { adapt, invokeGenerateObject, invokeGenerateText } from "./model-service.js"
import { type InvalidToolCallParameters, isInvalidToolCallParameters } from "./model-tool-call-validation.js"
import { type Classification, type ModelResilienceMisconfigured, apply, validate } from "./model-resilience.js"
import type { TerminationFailure } from "./model-stream-termination.js"
import {
  CurrentCompactionId,
  CurrentPurpose,
  CurrentSummaryCall,
  InvocationCoordinationFailed,
  type ModelFailureCategory,
  classifyFailureCategory,
  generateId,
  isInvocationCoordinationFailed,
} from "./model-telemetry.js"

export { type Identity, type IdentityCell, makeIdentityCell } from "./model-attempt-identity.js"
export type { InstrumentOptions } from "./model-attempt-instrumentation.js"

const instrumentedModels = new WeakMap<LanguageModel.Service, InstrumentedMarker>()
interface InstrumentedMarker {
  readonly emit: InstrumentOptions["emit"]
  readonly base: LanguageModel.Service
}
interface AnyResponse {
  readonly content: ReadonlyArray<Response.AnyPart>
}

const beginCall = (
  model: LanguageModel.Service,
  options: InstrumentOptions,
): Effect.Effect<
  { readonly context: CallContext; readonly stack: LanguageModel.Service },
  InvocationCoordinationFailed
> =>
  Effect.gen(function* () {
    const purpose = yield* CurrentPurpose
    const callOrdinal = options.nextCallOrdinal?.() ?? 0
    if (!Number.isSafeInteger(callOrdinal) || callOrdinal < 0) {
      return yield* InvocationCoordinationFailed.make({
        message: "model call ordinal is outside the safe integer range",
      })
    }
    const modelCallId =
      options.logicalOperationId === undefined
        ? yield* generateId
        : `${options.logicalOperationId}:model-call:${callOrdinal}:${purpose}`
    const compactionId = yield* CurrentCompactionId
    const provider = yield* Effect.serviceOption(Model.ProviderName)
    const modelName = yield* Effect.serviceOption(Model.ModelName)
    const startedAt = yield* Clock.currentTimeMillis
    yield* options.emit({
      _tag: "ModelCallStarted",
      turn: options.turn,
      modelCallId,
      purpose,
      ...(Option.isSome(provider) ? { provider: provider.value } : {}),
      ...(Option.isSome(modelName) ? { model: modelName.value } : {}),
      ...(compactionId === undefined ? {} : { compactionId }),
      startedAt,
    })
    if (compactionId !== undefined) {
      const summaryCell = yield* CurrentSummaryCall
      if (summaryCell !== undefined) {
        if (summaryCell.current !== undefined)
          return yield* Effect.die(new Error("A compaction pass issued multiple summary model calls"))
        summaryCell.current = modelCallId
      }
    }
    const providerClassification = memoized((error) => classifyFailure(model, error))
    const context: CallContext = {
      options,
      modelCallId,
      logicalOperationId: options.logicalOperationId,
      callOrdinal,
      purpose,
      provider: Option.getOrUndefined(provider),
      model: Option.getOrUndefined(modelName),
      categorize: memoized((error) =>
        providerClassification(error) === "context-overflow" ? "context-overflow" : classifyFailureCategory(error),
      ),
      classify: memoized((error) =>
        isInvocationCoordinationFailed(error) ||
        providerClassification(error) === "context-overflow" ||
        isInvalidToolCallParameters(error)
          ? "terminal"
          : options.resilience === undefined
            ? "terminal"
            : options.resilience.classify(error),
      ),
      state: {
        attempts: 0,
        usage: undefined,
        failedAttemptUsage: undefined,
        finishReason: undefined,
        errorCategory: undefined,
      },
    }
    const attempts = attemptModel(model, context)
    const stack =
      options.resilience === undefined
        ? attempts
        : apply(
            attempts,
            tapRetryTelemetry({
              resilience: options.resilience,
              classify: context.classify,
              categorize: context.categorize,
              attempt: () => context.state.attempts - 1,
              turn: options.turn,
              modelCallId: context.modelCallId,
              emit: options.emit,
            }),
          )
    return { context, stack }
  })

const observeCallPart = (context: CallContext, part: Response.AnyPart): void => {
  if (part.type === "finish") {
    context.state.usage = part.usage
    context.state.finishReason = part.reason
  }
  if (part.type === "error") {
    context.state.errorCategory = context.categorize(part.error)
  }
}

const callCompleted = (context: CallContext): Effect.Effect<void> =>
  Effect.flatMap(Clock.currentTimeMillis, (completedAt) =>
    context.options.emit({
      _tag: "ModelCallCompleted",
      turn: context.options.turn,
      modelCallId: context.modelCallId,
      purpose: context.purpose,
      attempts: context.state.attempts,
      completedAt,
      ...(context.state.usage === undefined ? {} : { usage: context.state.usage }),
      ...(context.state.failedAttemptUsage === undefined
        ? {}
        : { failedAttemptUsage: context.state.failedAttemptUsage }),
      ...(context.state.finishReason === undefined ? {} : { finishReason: context.state.finishReason }),
    }),
  )

const callFailed = (
  context: CallContext,
  category: ModelFailureCategory,
  classification: Classification,
): Effect.Effect<void> =>
  Effect.flatMap(Clock.currentTimeMillis, (failedAt) =>
    context.options.emit({
      _tag: "ModelCallFailed",
      turn: context.options.turn,
      modelCallId: context.modelCallId,
      purpose: context.purpose,
      attempts: context.state.attempts,
      failedAt,
      category,
      classification,
      ...(context.state.failedAttemptUsage === undefined
        ? {}
        : { failedAttemptUsage: context.state.failedAttemptUsage }),
    }),
  )

const callExit = (context: CallContext, exit: Exit.Exit<unknown, unknown>): Effect.Effect<void> => {
  if (context.state.errorCategory !== undefined) {
    return callFailed(context, context.state.errorCategory, "terminal")
  }
  if (Exit.isSuccess(exit)) return callCompleted(context)
  if (Cause.hasInterrupts(exit.cause)) return callFailed(context, "cancellation", "terminal")
  const failure = singleFailure(exit.cause)
  if (Option.isNone(failure)) return callFailed(context, "unknown", "terminal")
  return callFailed(context, context.categorize(failure.value), context.classify(failure.value))
}

const validateOptions = (options: InstrumentOptions) =>
  options.resilience === undefined ? Effect.void : validate(options.resilience).pipe(Effect.asVoid)

const callEffect = <A extends AnyResponse, E, R>(
  model: LanguageModel.Service,
  options: InstrumentOptions,
  invoke: (stack: LanguageModel.Service) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | InvocationCoordinationFailed | ModelResilienceMisconfigured, R> =>
  Effect.flatMap(validateOptions(options).pipe(Effect.andThen(beginCall(model, options))), ({ context, stack }) =>
    invoke(stack).pipe(
      Effect.tap((response) =>
        Effect.sync(() => {
          for (const part of response.content) observeCallPart(context, part)
        }),
      ),
      Effect.onExit((exit) => callExit(context, exit)),
    ),
  )

const callStream = (
  model: LanguageModel.Service,
  options: InstrumentOptions,
  streamOptions: StreamTextOptions,
): Stream.Stream<
  StreamTextPart,
  | AiError.AiError
  | InvalidToolCallParameters
  | InvocationCoordinationFailed
  | TerminationFailure
  | import("./model-resilience.js").ModelResilienceMisconfigured,
  unknown
> =>
  Stream.unwrap(
    Effect.map(validateOptions(options).pipe(Effect.andThen(beginCall(model, options))), ({ context, stack }) =>
      correctInvalidToolCall({
        context: {
          modelCallId: context.modelCallId,
          turn: context.options.turn,
          correctionLimit: context.options.resilience?.invalidToolCallCorrectionLimit ?? 0,
          attempt: () => context.state.attempts - 1,
          categorize: context.categorize,
          emit: context.options.emit,
        },
        model: stack,
        options: streamOptions,
      }).pipe(
        Stream.tap((part) => Effect.sync(() => observeCallPart(context, part))),
        Stream.onExit((exit) => callExit(context, exit)),
      ),
    ),
  )

/**
 * @experimental Wrap a model with call, attempt, and retry telemetry emission
 * plus the caller's resilience policy. Idempotent per run: a model already
 * instrumented with the same emit target is returned unchanged, while a
 * nested run re-wraps the underlying model with its own instrumentation so
 * one provider invocation never emits into two runs.
 */
export const instrument: {
  (options: InstrumentOptions): (model: LanguageModel.Service) => LanguageModel.Service
  (model: LanguageModel.Service, options: InstrumentOptions): LanguageModel.Service
} = Function.dual(2, (model: LanguageModel.Service, options: InstrumentOptions): LanguageModel.Service => {
  const marker = instrumentedModels.get(model)
  if (marker !== undefined) {
    return marker.emit === options.emit ? model : instrument(marker.base, options)
  }
  let localCallOrdinal = 0
  const activeOptions: InstrumentOptions = {
    ...options,
    nextCallOrdinal: options.nextCallOrdinal ?? (() => localCallOrdinal++),
  }
  const wrapped = adapt(model, {
    generateText: (generateOptions) =>
      callEffect(model, activeOptions, (stack) => invokeGenerateText(stack, generateOptions)),
    generateObject: (generateOptions) =>
      callEffect(model, activeOptions, (stack) => invokeGenerateObject(stack, generateOptions)),
    streamText: (streamOptions) => callStream(model, activeOptions, streamOptions),
  })
  instrumentedModels.set(wrapped, { emit: options.emit, base: model })
  return wrapped
})
