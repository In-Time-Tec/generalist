import { Cause, Clock, Duration, Effect, Exit, Function, Option, Schedule, Stream } from "effect"
import { AiError, LanguageModel, Model, Response } from "effect/unstable/ai"
import {
  correct as correctInvalidToolCall,
  type StreamTextOptions,
  type StreamTextPart,
} from "./model-call-correction.js"
import type { IdentityCell } from "./model-attempt-identity.js"
import { firstOutputKind, memoized, singleFailure } from "./model-attempt-observation.js"
import { addProviderUsage, providerUsageFromAiError } from "./model-provider-usage.js"
import { classifyFailure } from "./model-registry.js"
import { type InvalidToolCallParameters, isInvalidToolCallParameters } from "./model-tool-call-validation.js"
import { defaultResolveFailure, promoteResponseFailure, promoteStreamFailures } from "./model-response-failure.js"
import {
  type Classification,
  type Interface as Resilience,
  type ModelResilienceMisconfigured,
  apply,
  validate,
} from "./model-resilience.js"
import { type TerminationFailure, requireTerminal } from "./model-stream-termination.js"
import {
  CurrentCompactionId,
  CurrentPurpose,
  CurrentSummaryCall,
  type EventPayload,
  type ModelCallPurpose,
  type ModelFailureCategory,
  type ModelFirstOutputKind,
  type ModelProviderUsage,
  classifyFailureCategory,
  generateId,
} from "./model-telemetry.js"

export { type Identity, type IdentityCell, makeIdentityCell } from "./model-attempt-identity.js"
/** @experimental Options for instrumenting one loop-owned model service. */
export interface InstrumentOptions {
  readonly emit: (event: EventPayload) => Effect.Effect<void>
  readonly turn: number
  readonly identity?: IdentityCell
  readonly resilience?: Resilience
}

const InstrumentedTypeId = Symbol.for("@batonfx/core/model-instrumentation/Instrumented")
interface InstrumentedMarker {
  readonly emit: InstrumentOptions["emit"]
  readonly base: LanguageModel.Service
}

interface CallState {
  attempts: number
  usage: Response.Usage | undefined
  failedAttemptUsage: ModelProviderUsage | undefined
  finishReason: Response.FinishReason | undefined
  errorCategory: ModelFailureCategory | undefined
}

interface CallContext {
  readonly options: InstrumentOptions
  readonly modelCallId: string
  readonly purpose: ModelCallPurpose
  readonly provider: string | undefined
  readonly model: string | undefined
  readonly categorize: (error: unknown) => ModelFailureCategory
  readonly classify: (error: unknown) => Classification
  readonly state: CallState
}

interface Finished {
  readonly _tag: "Finished"
  readonly reason: Response.FinishReason
  readonly usage: Response.Usage
  readonly at: number
}

type Termination = { readonly _tag: "Open" } | Finished
const open: Termination = { _tag: "Open" }

interface AttemptState {
  firstOutputs: Set<ModelFirstOutputKind>
  termination: Termination
  requestId: string | undefined
  responseModel: string | undefined
}

interface AttemptContext {
  readonly modelAttemptId: string
  readonly attempt: number
  readonly state: AttemptState
}

const observeStreamPart = (
  context: CallContext,
  attempt: AttemptContext,
  part: Response.AnyPart,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (part.type === "response-metadata") {
      attempt.state.requestId = part.id
      attempt.state.responseModel = part.modelId
    }
    if (part.type === "finish") {
      const at = yield* Clock.currentTimeMillis
      attempt.state.termination = { _tag: "Finished", reason: part.reason, usage: part.usage, at }
    }
    const kind = firstOutputKind(part)
    if (kind === undefined || attempt.state.firstOutputs.has(kind)) return
    attempt.state.firstOutputs.add(kind)
    const at = yield* Clock.currentTimeMillis
    yield* context.options.emit({
      _tag: "ModelAttemptFirstOutput",
      turn: context.options.turn,
      modelCallId: context.modelCallId,
      modelAttemptId: attempt.modelAttemptId,
      attempt: attempt.attempt,
      kind,
      at,
    })
  })

const attemptCompleted = (context: CallContext, attempt: AttemptContext, finished: Finished): Effect.Effect<void> =>
  Effect.flatMap(Clock.currentTimeMillis, (completedAt) =>
    context.options.emit({
      _tag: "ModelAttemptCompleted",
      turn: context.options.turn,
      modelCallId: context.modelCallId,
      modelAttemptId: attempt.modelAttemptId,
      attempt: attempt.attempt,
      completedAt,
      usage: finished.usage,
      usageAt: finished.at,
      finishReason: finished.reason,
      ...(attempt.state.requestId === undefined ? {} : { requestId: attempt.state.requestId }),
      ...(attempt.state.responseModel === undefined ? {} : { responseModel: attempt.state.responseModel }),
    }),
  )

const attemptFailed = (
  context: CallContext,
  attempt: AttemptContext,
  category: ModelFailureCategory,
  classification: Classification,
  error?: unknown,
): Effect.Effect<void> => {
  const usage = providerUsageFromAiError(error)
  context.state.failedAttemptUsage = addProviderUsage(context.state.failedAttemptUsage, usage)
  return Effect.flatMap(Clock.currentTimeMillis, (failedAt) =>
    context.options.emit({
      _tag: "ModelAttemptFailed",
      turn: context.options.turn,
      modelCallId: context.modelCallId,
      modelAttemptId: attempt.modelAttemptId,
      attempt: attempt.attempt,
      failedAt,
      category,
      classification,
      ...(usage === undefined ? {} : { providerUsage: usage }),
    }),
  )
}

const attemptExit = (
  context: CallContext,
  attempt: AttemptContext,
  exit: Exit.Exit<unknown, unknown>,
): Effect.Effect<void> => {
  if (Exit.isSuccess(exit)) {
    const termination = attempt.state.termination
    if (termination._tag === "Open") return attemptFailed(context, attempt, "truncated-stream", "terminal")
    context.state.usage = termination.usage
    context.state.finishReason = termination.reason
    return attemptCompleted(context, attempt, termination)
  }
  if (Cause.hasInterrupts(exit.cause)) return attemptFailed(context, attempt, "cancellation", "terminal")
  const failure = singleFailure(exit.cause)
  if (Option.isNone(failure)) return attemptFailed(context, attempt, "unknown", "terminal")
  return attemptFailed(
    context,
    attempt,
    context.categorize(failure.value),
    context.classify(failure.value),
    failure.value,
  )
}

const beginAttempt = (context: CallContext): Effect.Effect<AttemptContext> =>
  Effect.gen(function* () {
    const attempt = context.state.attempts
    context.state.attempts += 1
    const modelAttemptId = yield* generateId
    if (context.options.identity !== undefined) {
      context.options.identity.current = { modelCallId: context.modelCallId, modelAttemptId, attempt }
    }
    const startedAt = yield* Clock.currentTimeMillis
    yield* context.options.emit({
      _tag: "ModelAttemptStarted",
      turn: context.options.turn,
      modelCallId: context.modelCallId,
      modelAttemptId,
      attempt,
      startedAt,
    })
    return {
      modelAttemptId,
      attempt,
      state: {
        firstOutputs: new Set(),
        termination: open,
        requestId: undefined,
        responseModel: undefined,
      },
    }
  })

interface AnyResponse {
  readonly content: ReadonlyArray<Response.AnyPart>
}

const attemptEffect = <A extends AnyResponse, E, R>(
  context: CallContext,
  method: "generateText" | "generateObject",
  run: () => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | AiError.AiError, R> =>
  Effect.flatMap(beginAttempt(context), (attempt) =>
    run().pipe(
      Effect.flatMap((response) =>
        promoteResponseFailure(response, method, context.options.resilience?.resolve ?? defaultResolveFailure),
      ),
      Effect.tap((response) =>
        Effect.forEach(response.content, (part) => observeStreamPart(context, attempt, part), { discard: true }),
      ),
      Effect.onExit((exit) => attemptExit(context, attempt, exit)),
    ),
  )

const attemptStream = <A extends Response.AnyPart, E, R>(
  context: CallContext,
  run: () => Stream.Stream<A, E, R>,
): Stream.Stream<A, E | AiError.AiError | TerminationFailure, R> =>
  Stream.unwrap(
    Effect.map(beginAttempt(context), (attempt) =>
      requireTerminal(promoteStreamFailures(run(), context.options.resilience?.resolve ?? defaultResolveFailure), {
        toPart: Function.identity,
        turn: context.options.turn,
        provider: context.provider,
        model: context.model,
        ...(context.options.resilience?.streamIdleTimeout === undefined
          ? {}
          : { idleTimeout: context.options.resilience.streamIdleTimeout }),
      }).pipe(
        Stream.tap((part) => observeStreamPart(context, attempt, part)),
        Stream.onExit((exit) => attemptExit(context, attempt, exit)),
      ),
    ),
  )

const attemptModel = (model: LanguageModel.Service, context: CallContext): LanguageModel.Service =>
  ({
    ...model,
    generateText: ((options: never) =>
      attemptEffect(context, "generateText", () =>
        model.generateText(options),
      )) as unknown as LanguageModel.Service["generateText"],
    generateObject: ((options: never) =>
      attemptEffect(context, "generateObject", () =>
        (model.generateObject as unknown as (options: never) => Effect.Effect<AnyResponse, AiError.AiError>)(options),
      )) as unknown as LanguageModel.Service["generateObject"],
    streamText: ((options: never) =>
      attemptStream(context, () => model.streamText(options))) as unknown as LanguageModel.Service["streamText"],
  }) as LanguageModel.Service

const tappedResilience = (context: CallContext, resilience: Resilience): Resilience => ({
  classify: context.classify,
  resolve: resilience.resolve,
  invalidToolCallCorrectionLimit: resilience.invalidToolCallCorrectionLimit,
  ...(resilience.streamIdleTimeout === undefined ? {} : { streamIdleTimeout: resilience.streamIdleTimeout }),
  retrySchedule: (resilience.retrySchedule as Schedule.Schedule<unknown, unknown>).pipe(
    Schedule.while(({ input }) => context.classify(input) === "transient"),
    Schedule.tap((metadata) =>
      Effect.flatMap(Clock.currentTimeMillis, (at) =>
        context.options.emit({
          _tag: "ModelRetryScheduled",
          turn: context.options.turn,
          modelCallId: context.modelCallId,
          attempt: context.state.attempts - 1,
          reason: "provider-resilience",
          category: context.categorize(metadata.input),
          delayMillis: Duration.toMillis(metadata.duration),
          at,
        }),
      ),
    ),
  ) as Schedule.Schedule<unknown>,
})

const beginCall = (
  model: LanguageModel.Service,
  options: InstrumentOptions,
): Effect.Effect<{ readonly context: CallContext; readonly stack: LanguageModel.Service }> =>
  Effect.gen(function* () {
    const modelCallId = yield* generateId
    const purpose = yield* CurrentPurpose
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
      purpose,
      provider: Option.getOrUndefined(provider),
      model: Option.getOrUndefined(modelName),
      categorize: memoized((error) =>
        providerClassification(error) === "context-overflow" ? "context-overflow" : classifyFailureCategory(error),
      ),
      classify: memoized((error) =>
        providerClassification(error) === "context-overflow" || isInvalidToolCallParameters(error)
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
      options.resilience === undefined ? attempts : apply(attempts, tappedResilience(context, options.resilience))
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
): Effect.Effect<A, E | ModelResilienceMisconfigured, R> =>
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
  | TerminationFailure
  | import("./model-resilience.js").ModelResilienceMisconfigured,
  any
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
  const marker = (model as unknown as Record<PropertyKey, unknown>)[InstrumentedTypeId] as
    | InstrumentedMarker
    | undefined
  if (marker !== undefined) {
    return marker.emit === options.emit ? model : instrument(marker.base, options)
  }
  return {
    ...model,
    [InstrumentedTypeId]: { emit: options.emit, base: model } satisfies InstrumentedMarker,
    generateText: ((generateOptions: never) =>
      callEffect(model, options, (stack) =>
        stack.generateText(generateOptions),
      )) as unknown as LanguageModel.Service["generateText"],
    generateObject: ((generateOptions: never) =>
      callEffect(model, options, (stack) =>
        (stack.generateObject as unknown as (options: never) => Effect.Effect<AnyResponse, AiError.AiError>)(
          generateOptions,
        ),
      )) as unknown as LanguageModel.Service["generateObject"],
    streamText: ((streamOptions: StreamTextOptions) =>
      callStream(model, options, streamOptions)) as unknown as LanguageModel.Service["streamText"],
  } as LanguageModel.Service
})
