import { Cause, Clock, Effect, Exit, Function, Option, Stream } from "effect"
import { AiError, LanguageModel, Response, ResponseIdTracker } from "effect/unstable/ai"
import { adapt } from "./model-service.js"
import type { IdentityCell } from "./model-attempt-identity.js"
import {
  disabledResponseIdTracker,
  firstOutputKind,
  providerUsage,
  singleFailure,
} from "./model-attempt-observation.js"
import { defaultResolveFailure, promoteResponseFailure, promoteStreamFailures } from "./model-response-failure.js"
import type { Classification, Interface as Resilience } from "./model-resilience.js"
import type { CandidateIdentity, FailureDisposition } from "./model-registry.js"
import { type TerminationFailure, requireTerminal } from "./model-stream-termination.js"
import {
  InvocationCoordinationFailed,
  type EventPayload,
  type InvocationCoordinatorInterface,
  type ModelCallPurpose,
  type ModelFailureCategory,
  type ModelFirstOutputKind,
  type ModelInvocationMethod,
  type ModelProviderUsage,
  generateId,
} from "./model-telemetry.js"

export interface InstrumentOptions {
  readonly emit: (event: EventPayload) => Effect.Effect<void>
  readonly turn: number
  readonly identity?: IdentityCell
  readonly resilience?: Resilience
  readonly logicalOperationId?: string
  readonly nextCallOrdinal?: (persisted?: number) => number
  readonly coordinator?: InvocationCoordinatorInterface
}

export interface CallState {
  attempts: number
  usage: Response.Usage | undefined
  failedAttemptUsage: ModelProviderUsage | undefined
  finishReason: Response.FinishReason | undefined
  errorCategory: ModelFailureCategory | undefined
  pendingFailure: PendingFailure | undefined
}

export interface CallContext {
  readonly options: InstrumentOptions
  readonly modelCallId: string
  readonly logicalOperationId: string | undefined
  readonly callOrdinal: number
  readonly purpose: ModelCallPurpose
  readonly provider: string | undefined
  readonly model: string | undefined
  readonly categorize: (error: unknown) => ModelFailureCategory
  readonly classify: (error: unknown) => Classification
  readonly state: CallState
}

interface PendingFailure {
  readonly attempt: AttemptContext
  readonly category: ModelFailureCategory
  readonly classification: Classification
  readonly usage: ModelProviderUsage | undefined
}

interface Finished {
  readonly _tag: "Finished"
  readonly reason: Response.FinishReason
  readonly usage: Response.Usage
  readonly at: number
}

type Termination = { readonly _tag: "Open" } | Finished

interface AttemptState {
  firstOutputs: Set<ModelFirstOutputKind>
  termination: Termination
  settled: boolean
  coordinated: boolean
  requestId: string | undefined
  responseModel: string | undefined
}

interface AttemptContext {
  readonly modelAttemptId: string
  readonly attempt: number
  readonly method: ModelInvocationMethod
  readonly state: AttemptState
  readonly identity: CandidateIdentity | undefined
}

const identityFields = (identity: CandidateIdentity | undefined) =>
  identity === undefined
    ? {}
    : {
        provider: identity.provider,
        model: identity.model,
        ...(identity.registrationKey === undefined ? {} : { registrationKey: identity.registrationKey }),
        candidate: identity.candidate,
      }

const coordinateCompleted = (
  context: CallContext,
  attempt: AttemptContext,
  finished: Finished,
): Effect.Effect<void, InvocationCoordinationFailed> =>
  Effect.gen(function* () {
    if (attempt.state.coordinated) return
    const completedAt = yield* Clock.currentTimeMillis
    if (context.options.coordinator !== undefined && context.logicalOperationId !== undefined) {
      yield* context.options.coordinator.completeAttempt({
        logicalOperationId: context.logicalOperationId,
        modelCallId: context.modelCallId,
        modelAttemptId: attempt.modelAttemptId,
        attempt: attempt.attempt,
        completedAt,
        usage: finished.usage,
        finishReason: finished.reason,
        ...(attempt.state.requestId === undefined ? {} : { requestId: attempt.state.requestId }),
        ...(attempt.state.responseModel === undefined ? {} : { responseModel: attempt.state.responseModel }),
        ...identityFields(attempt.identity),
      })
    }
    attempt.state.coordinated = true
  })

const attemptCompleted = (
  context: CallContext,
  attempt: AttemptContext,
  finished: Finished,
): Effect.Effect<void, InvocationCoordinationFailed> =>
  Effect.gen(function* () {
    yield* coordinateCompleted(context, attempt, finished)
    const completedAt = yield* Clock.currentTimeMillis
    yield* context.options.emit({
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
      ...identityFields(attempt.identity),
    })
  })

const attemptFailed = (
  context: CallContext,
  attempt: AttemptContext,
  category: ModelFailureCategory,
  classification: Classification,
  error?: unknown,
): Effect.Effect<void> => {
  const usage = providerUsage.fromError(error)
  context.state.failedAttemptUsage = providerUsage.add(context.state.failedAttemptUsage, usage)
  context.state.pendingFailure = { attempt, category, classification, usage }
  return Effect.void
}

export const settleFailure = (
  context: CallContext,
  disposition: FailureDisposition,
): Effect.Effect<void, InvocationCoordinationFailed> =>
  Effect.suspend(() => {
    const pending = context.state.pendingFailure
    if (pending === undefined) return Effect.void
    context.state.pendingFailure = undefined
    const { attempt, category, classification, usage } = pending
    return Effect.gen(function* () {
      const failedAt = yield* Clock.currentTimeMillis
      if (context.options.coordinator !== undefined && context.logicalOperationId !== undefined) {
        yield* context.options.coordinator.failAttempt({
          logicalOperationId: context.logicalOperationId,
          modelCallId: context.modelCallId,
          modelAttemptId: attempt.modelAttemptId,
          attempt: attempt.attempt,
          failedAt,
          category,
          classification,
          disposition,
          ...identityFields(attempt.identity),
        })
      }
      yield* context.options.emit({
        _tag: "ModelAttemptFailed",
        turn: context.options.turn,
        modelCallId: context.modelCallId,
        modelAttemptId: attempt.modelAttemptId,
        attempt: attempt.attempt,
        failedAt,
        category,
        classification,
        disposition,
        ...identityFields(attempt.identity),
        ...(usage === undefined ? {} : { providerUsage: usage }),
      })
    })
  })

const attemptExit = (
  context: CallContext,
  attempt: AttemptContext,
  exit: Exit.Exit<unknown, unknown>,
): Effect.Effect<void, InvocationCoordinationFailed> =>
  Effect.suspend(() => {
    if (attempt.state.settled) return Effect.void
    attempt.state.settled = true
    const termination = attempt.state.termination
    if (Exit.isSuccess(exit) || (Cause.hasInterrupts(exit.cause) && termination._tag === "Finished")) {
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
  })

const observeStreamPart = (
  context: CallContext,
  attempt: AttemptContext,
  part: Response.AnyPart,
): Effect.Effect<void, InvocationCoordinationFailed> =>
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
    if (kind !== undefined && !attempt.state.firstOutputs.has(kind)) {
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
    }
    if (part.type === "finish") {
      const termination = attempt.state.termination
      if (termination._tag === "Finished") yield* coordinateCompleted(context, attempt, termination)
    }
  })

const beginAttempt = (
  context: CallContext,
  method: ModelInvocationMethod,
  identity?: CandidateIdentity,
): Effect.Effect<AttemptContext, InvocationCoordinationFailed> =>
  Effect.gen(function* () {
    const attempt = context.state.attempts
    context.state.attempts += 1
    const modelAttemptId =
      context.logicalOperationId === undefined ? yield* generateId : `${context.modelCallId}:attempt:${attempt}`
    if (context.options.identity !== undefined) {
      context.options.identity.current = { modelCallId: context.modelCallId, modelAttemptId, attempt }
    }
    const startedAt = yield* Clock.currentTimeMillis
    if (context.options.coordinator !== undefined) {
      if (context.logicalOperationId === undefined) {
        return yield* InvocationCoordinationFailed.make({
          message: "logicalOperationId is required when an invocation coordinator is configured",
        })
      }
      yield* context.options.coordinator.beforeAttempt({
        logicalOperationId: context.logicalOperationId,
        modelCallId: context.modelCallId,
        modelAttemptId,
        callOrdinal: context.callOrdinal,
        attempt,
        turn: context.options.turn,
        purpose: context.purpose,
        method,
        ...(context.provider === undefined ? {} : { provider: context.provider }),
        ...(context.model === undefined ? {} : { model: context.model }),
        ...identityFields(identity),
        startedAt,
      })
    }
    yield* context.options.emit({
      _tag: "ModelAttemptStarted",
      turn: context.options.turn,
      modelCallId: context.modelCallId,
      modelAttemptId,
      attempt,
      ...identityFields(identity),
      startedAt,
    })
    return {
      modelAttemptId,
      attempt,
      method,
      identity,
      state: {
        firstOutputs: new Set(),
        termination: { _tag: "Open" },
        settled: false,
        coordinated: false,
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
  identity?: CandidateIdentity,
): Effect.Effect<A, E | AiError.AiError | InvocationCoordinationFailed, R> =>
  Effect.flatMap(beginAttempt(context, method, identity), (attempt) =>
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
  identity?: CandidateIdentity,
): Stream.Stream<A, E | AiError.AiError | InvocationCoordinationFailed | TerminationFailure, R> =>
  Stream.unwrap(
    Effect.map(beginAttempt(context, "streamText", identity), (attempt) =>
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
        Stream.catchCause((cause) =>
          Stream.unwrap(
            attemptExit(context, attempt, Exit.failCause(cause)).pipe(Effect.map(() => Stream.failCause(cause))),
          ),
        ),
        Stream.concat(
          Stream.fromEffect(Effect.suspend(() => attemptExit(context, attempt, Exit.succeed(undefined)))).pipe(
            Stream.drain,
          ),
        ),
        Stream.onExit((exit) => attemptExit(context, attempt, exit).pipe(Effect.ignore)),
      ),
    ),
  )

export const attemptModel = (
  model: LanguageModel.Service,
  context: CallContext,
  identity?: CandidateIdentity,
): LanguageModel.Service =>
  adapt<
    AiError.AiError | InvocationCoordinationFailed,
    AiError.AiError | InvocationCoordinationFailed,
    AiError.AiError | InvocationCoordinationFailed | TerminationFailure
  >(model, {
    generateText: (_options, invoke) =>
      attemptEffect(
        context,
        "generateText",
        () => invoke().pipe(Effect.provideService(ResponseIdTracker.ResponseIdTracker, disabledResponseIdTracker)),
        identity,
      ),
    generateObject: (_options, invoke) =>
      attemptEffect(
        context,
        "generateObject",
        () => invoke().pipe(Effect.provideService(ResponseIdTracker.ResponseIdTracker, disabledResponseIdTracker)),
        identity,
      ),
    streamText: (_options, invoke) =>
      attemptStream(
        context,
        () => invoke().pipe(Stream.provideService(ResponseIdTracker.ResponseIdTracker, disabledResponseIdTracker)),
        identity,
      ),
  })
