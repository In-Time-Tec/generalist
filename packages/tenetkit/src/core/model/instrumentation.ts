import { Cause, Effect, Exit, Function, Option, Stream } from "effect"
import { AiError, LanguageModel, Model, Response, Tool } from "effect/unstable/ai"
import { ToolContext } from "../tools/tool-context.js"
import { correct as correctInvalidToolCall, type StreamTextPart } from "./call-correction.js"
import { CurrentModelCallOrdinal } from "../durable/operation-context.js"
import { attemptModel, type CallContext, type InstrumentOptions, settleFailure } from "./attempt/instrumentation.js"
import { memoized, singleFailure, tapRetryTelemetry } from "./attempt/observation.js"
import { candidateRoute, classifyFailure, registrationIdentity, type CandidateIdentity } from "./registry.js"
import { adapt, invokeGenerateObject, invokeGenerateText, type StreamTextOptions } from "./service.js"
import { type InvalidToolCallParameters, isInvalidToolCallParameters } from "./tool-call-validation.js"
import { type Classification, type Misconfigured, apply, validate } from "./resilience.js"
import type { TerminationFailure } from "./stream-termination.js"
import {
  CurrentCompactionId,
  CurrentPurpose,
  CurrentSummaryCall,
  InvocationLifecycleFailed,
  type FailureCategory,
  classifyFailureCategory,
  generateId,
  isInvocationLifecycleFailed,
} from "./telemetry/events.js"

export { type Identity, type IdentityCell, makeIdentityCell } from "./attempt/identity.js"
export type { InstrumentOptions } from "./attempt/instrumentation.js"

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
): Effect.Effect<{ readonly context: CallContext; readonly stack: LanguageModel.Service }, InvocationLifecycleFailed> =>
  Effect.gen(function* () {
    const purpose = yield* CurrentPurpose
    const persistedOrdinal = yield* CurrentModelCallOrdinal
    const callOrdinal = options.nextCallOrdinal?.(persistedOrdinal) ?? persistedOrdinal ?? 0
    if (!Number.isSafeInteger(callOrdinal) || callOrdinal < 0) {
      return yield* InvocationLifecycleFailed.make({
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
    const startedAt = yield* options.clock.currentTimeMillis
    const started = {
      _tag: "ModelCallStarted",
      turn: options.turn,
      modelCallId,
      purpose,
      startedAt,
    } as const
    yield* options.emit(
      Object.assign(
        started,
        Option.isSome(provider) ? { provider: provider.value } : undefined,
        Option.isSome(modelName) ? { model: modelName.value } : undefined,
        compactionId === undefined ? undefined : { compactionId },
      ),
    )
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
      classify: memoized((error) => {
        if (
          isInvocationLifecycleFailed(error) ||
          providerClassification(error) === "context-overflow" ||
          isInvalidToolCallParameters(error) ||
          options.resilience === undefined
        ) {
          return "terminal"
        }
        return options.resilience.classify(error)
      }),
      state: {
        attempts: 0,
        usage: undefined,
        failedAttemptUsage: undefined,
        finishReason: undefined,
        errorCategory: undefined,
        pendingFailure: undefined,
      },
    }
    const instrumentCandidate = (candidate: LanguageModel.Service, identity?: CandidateIdentity) => {
      const attempts = attemptModel(candidate, context, identity)
      return options.resilience === undefined
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
              settleFailure: settleFailure(context, "retry").pipe(Effect.orDie),
            }),
          )
    }
    const route = candidateRoute(model)
    const directIdentity = registrationIdentity(model)
    const stack =
      route === undefined
        ? instrumentCandidate(model, directIdentity === undefined ? undefined : { ...directIdentity, candidate: 0 })
        : route({
            instrument: (candidate, identity) => instrumentCandidate(candidate, identity),
            settleFailure: (disposition) => settleFailure(context, disposition).pipe(Effect.orDie),
            fallbackScheduled: ({ from, to, error }) =>
              Effect.gen(function* () {
                yield* settleFailure(context, "fallback")
                const at = yield* options.clock.currentTimeMillis
                const scheduled = {
                  _tag: "ModelFallbackScheduled",
                  turn: options.turn,
                  modelCallId: context.modelCallId,
                  attempt: context.state.attempts - 1,
                  fromCandidate: from.candidate,
                  fromProvider: from.provider,
                  fromModel: from.model,
                  toCandidate: to.candidate,
                  toProvider: to.provider,
                  toModel: to.model,
                  category: context.categorize(error),
                  at,
                } as const
                yield* options.emit(
                  Object.assign(
                    scheduled,
                    from.registrationKey === undefined ? undefined : { fromRegistrationKey: from.registrationKey },
                    to.registrationKey === undefined ? undefined : { toRegistrationKey: to.registrationKey },
                  ),
                )
              }).pipe(Effect.orDie),
          })
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
  Effect.gen(function* () {
    context.options.onCallCompleted?.({
      modelCallId: context.modelCallId,
      failedAttemptUsage: context.state.failedAttemptUsage,
    })
    const completedAt = yield* context.options.clock.currentTimeMillis
    yield* context.options.emit(
      Object.assign(
        {
          _tag: "ModelCallCompleted",
          turn: context.options.turn,
          modelCallId: context.modelCallId,
          purpose: context.purpose,
          attempts: context.state.attempts,
          completedAt,
        } as const,
        context.state.usage === undefined ? undefined : { usage: context.state.usage },
        context.state.failedAttemptUsage === undefined
          ? undefined
          : { failedAttemptUsage: context.state.failedAttemptUsage },
        context.state.finishReason === undefined ? undefined : { finishReason: context.state.finishReason },
      ),
    )
  })

const callFailed = (
  context: CallContext,
  category: FailureCategory,
  classification: Classification,
): Effect.Effect<void> =>
  Effect.flatMap(context.options.clock.currentTimeMillis, (failedAt) =>
    context.options.emit(
      Object.assign(
        {
          _tag: "ModelCallFailed",
          turn: context.options.turn,
          modelCallId: context.modelCallId,
          purpose: context.purpose,
          attempts: context.state.attempts,
          failedAt,
          category,
          classification,
        } as const,
        context.state.failedAttemptUsage === undefined
          ? undefined
          : { failedAttemptUsage: context.state.failedAttemptUsage },
      ),
    ),
  )

const callExit = (context: CallContext, exit: Exit.Exit<unknown, unknown>): Effect.Effect<void> => {
  if (context.state.errorCategory !== undefined) {
    return settleFailure(context, "terminal").pipe(
      Effect.andThen(callFailed(context, context.state.errorCategory, "terminal")),
      Effect.orDie,
    )
  }
  if (Exit.isSuccess(exit)) return callCompleted(context)
  if (Cause.hasInterrupts(exit.cause))
    return settleFailure(context, "terminal").pipe(
      Effect.andThen(callFailed(context, "cancellation", "terminal")),
      Effect.orDie,
    )
  const failure = singleFailure(exit.cause)
  if (Option.isNone(failure))
    return settleFailure(context, "terminal").pipe(
      Effect.andThen(callFailed(context, "unknown", "terminal")),
      Effect.orDie,
    )
  return settleFailure(context, "terminal").pipe(
    Effect.andThen(callFailed(context, context.categorize(failure.value), context.classify(failure.value))),
    Effect.orDie,
  )
}

const validateOptions = (options: InstrumentOptions) =>
  options.resilience === undefined ? Effect.void : validate(options.resilience).pipe(Effect.asVoid)

const callEffect = <A extends AnyResponse, E, R>(
  model: LanguageModel.Service,
  options: InstrumentOptions,
  invoke: (stack: LanguageModel.Service) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | InvocationLifecycleFailed | Misconfigured, R> =>
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
  | InvocationLifecycleFailed
  | TerminationFailure
  | import("./resilience.js").Misconfigured,
  ToolContext | Tool.Handler<string>
> =>
  Stream.unwrap(
    Effect.map(validateOptions(options).pipe(Effect.andThen(beginCall(model, options))), ({ context, stack }) =>
      correctInvalidToolCall({
        context: {
          clock: context.options.clock,
          modelCallId: context.modelCallId,
          turn: context.options.turn,
          correctionLimit: context.options.resilience?.invalidToolCallCorrectionLimit ?? 0,
          attempt: () => context.state.attempts - 1,
          categorize: context.categorize,
          emit: context.options.emit,
          settleFailure: settleFailure(context, "retry").pipe(Effect.orDie),
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
