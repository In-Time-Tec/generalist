import { Cause, Clock, Effect, Exit, Function, Option, Stream } from "effect"
import { AiError, LanguageModel, Response, ResponseIdTracker } from "effect/unstable/ai"
import { adapt } from "../service.js"
import type { IdentityCell } from "./identity.js"
import { disabledResponseIdTracker, firstOutputKind, providerUsage, singleFailure } from "./observation.js"
import { defaultResolveFailure, promoteResponseFailure, promoteStreamFailures } from "../response/failure.js"
import type { Classification, Policy as Resilience } from "../resilience.js"
import type { CandidateIdentity, FailureDisposition } from "../registry.js"
import { type TerminationFailure, requireTerminal } from "../stream-termination.js"
import {
  InvocationLifecycle,
  InvocationLifecycleFailed,
  type EventPayload,
  type CallPurpose,
  type FailureCategory,
  type FirstOutputKind,
  type ModelInvocationMethod,
  type ProviderUsage,
  generateId,
} from "../telemetry/events.js"

type ModelFailure = Parameters<Resilience["classify"]>[0]

export interface InstrumentOptions {
  readonly clock: Clock.Clock
  readonly emit: (event: EventPayload) => Effect.Effect<void>
  readonly turn: number
  readonly identity?: IdentityCell
  readonly onCallCompleted?: (completion: {
    readonly modelCallId: string
    readonly failedAttemptUsage: ProviderUsage | undefined
  }) => void
  readonly resilience?: Resilience
  readonly logicalOperationId?: string
  readonly nextCallOrdinal?: (persisted?: number) => number
  readonly lifecycle?: InvocationLifecycle["Service"]
}

export interface CallState {
  attempts: number
  usage: Response.Usage | undefined
  failedAttemptUsage: ProviderUsage | undefined
  finishReason: Response.FinishReason | undefined
  errorCategory: FailureCategory | undefined
  pendingFailure: PendingFailure | undefined
}

export interface CallContext {
  readonly options: InstrumentOptions
  readonly modelCallId: string
  readonly logicalOperationId: string | undefined
  readonly callOrdinal: number
  readonly purpose: CallPurpose
  readonly provider: string | undefined
  readonly model: string | undefined
  readonly categorize: (error: ModelFailure) => FailureCategory
  readonly classify: (error: ModelFailure) => Classification
  readonly state: CallState
}

interface PendingFailure {
  readonly attempt: AttemptContext
  readonly category: FailureCategory
  readonly classification: Classification
  readonly usage: ProviderUsage | undefined
}

interface Finished {
  readonly _tag: "Finished"
  readonly reason: Response.FinishReason
  readonly usage: Response.Usage
  readonly at: number
  readonly providerMetadata: Response.ProviderMetadata
}

type Termination = { readonly _tag: "Open" } | Finished

interface AttemptState {
  firstOutputs: Set<FirstOutputKind>
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

const identityFields = (identity: CandidateIdentity | undefined) => {
  if (identity === undefined) return {}
  const fields = {
    provider: identity.provider,
    model: identity.model,
    candidate: identity.candidate,
  }
  if (identity.registrationKey !== undefined) Object.assign(fields, { registrationKey: identity.registrationKey })
  return fields
}

const coordinateCompleted = (
  context: CallContext,
  attempt: AttemptContext,
  finished: Finished,
): Effect.Effect<void, InvocationLifecycleFailed> =>
  Effect.gen(function* () {
    if (attempt.state.coordinated) return
    const completedAt = yield* context.options.clock.currentTimeMillis
    if (context.options.lifecycle !== undefined && context.logicalOperationId !== undefined) {
      const completion = {
        logicalOperationId: context.logicalOperationId,
        modelCallId: context.modelCallId,
        modelAttemptId: attempt.modelAttemptId,
        attempt: attempt.attempt,
        completedAt,
        usage: finished.usage,
        finishReason: finished.reason,
        ...identityFields(attempt.identity),
      }
      if (Object.keys(finished.providerMetadata).length !== 0)
        Object.assign(completion, { providerMetadata: finished.providerMetadata })
      if (attempt.state.requestId !== undefined) Object.assign(completion, { requestId: attempt.state.requestId })
      if (attempt.state.responseModel !== undefined)
        Object.assign(completion, { responseModel: attempt.state.responseModel })
      yield* context.options.lifecycle.completeAttempt(completion)
    }
    attempt.state.coordinated = true
  })

const attemptCompleted = (
  context: CallContext,
  attempt: AttemptContext,
  finished: Finished,
): Effect.Effect<void, InvocationLifecycleFailed> =>
  Effect.gen(function* () {
    yield* coordinateCompleted(context, attempt, finished)
    const completedAt = yield* context.options.clock.currentTimeMillis
    const event = {
      _tag: "ModelAttemptCompleted",
      turn: context.options.turn,
      modelCallId: context.modelCallId,
      modelAttemptId: attempt.modelAttemptId,
      attempt: attempt.attempt,
      completedAt,
      usage: finished.usage,
      usageAt: finished.at,
      finishReason: finished.reason,
      ...identityFields(attempt.identity),
    } satisfies EventPayload
    if (Object.keys(finished.providerMetadata).length !== 0)
      Object.assign(event, { providerMetadata: finished.providerMetadata })
    if (attempt.state.requestId !== undefined) Object.assign(event, { requestId: attempt.state.requestId })
    if (attempt.state.responseModel !== undefined) Object.assign(event, { responseModel: attempt.state.responseModel })
    yield* context.options.emit(event)
  })

const attemptFailed = (
  context: CallContext,
  attempt: AttemptContext,
  category: FailureCategory,
  classification: Classification,
  error?: ModelFailure,
): Effect.Effect<void> => {
  const usage = providerUsage.fromError(error)
  context.state.failedAttemptUsage = providerUsage.add(context.state.failedAttemptUsage, usage)
  context.state.pendingFailure = { attempt, category, classification, usage }
  return Effect.void
}

export const settleFailure: {
  (disposition: FailureDisposition): (context: CallContext) => Effect.Effect<void, InvocationLifecycleFailed>
  (context: CallContext, disposition: FailureDisposition): Effect.Effect<void, InvocationLifecycleFailed>
} = Function.dual(
  2,
  (context: CallContext, disposition: FailureDisposition): Effect.Effect<void, InvocationLifecycleFailed> =>
    Effect.suspend(() => {
      const pending = context.state.pendingFailure
      if (pending === undefined) return Effect.void
      context.state.pendingFailure = undefined
      const { attempt, category, classification, usage } = pending
      return Effect.gen(function* () {
        const failedAt = yield* context.options.clock.currentTimeMillis
        if (context.options.lifecycle !== undefined && context.logicalOperationId !== undefined) {
          yield* context.options.lifecycle.failAttempt({
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
        const event = {
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
        } satisfies EventPayload
        if (usage !== undefined) Object.assign(event, { providerUsage: usage })
        yield* context.options.emit(event)
      })
    }),
)

const attemptExit = (
  context: CallContext,
  attempt: AttemptContext,
  exit: Exit.Exit<unknown, unknown>,
): Effect.Effect<void, InvocationLifecycleFailed> =>
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
): Effect.Effect<void, InvocationLifecycleFailed> =>
  Effect.gen(function* () {
    if (part.type === "response-metadata") {
      attempt.state.requestId = part.id
      attempt.state.responseModel = part.modelId
    }
    if (part.type === "finish") {
      const at = yield* context.options.clock.currentTimeMillis
      attempt.state.termination = {
        _tag: "Finished",
        reason: part.reason,
        usage: part.usage,
        at,
        providerMetadata: part.metadata,
      }
    }
    const kind = firstOutputKind(part)
    if (kind !== undefined && !attempt.state.firstOutputs.has(kind)) {
      attempt.state.firstOutputs.add(kind)
      const at = yield* context.options.clock.currentTimeMillis
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
): Effect.Effect<AttemptContext, InvocationLifecycleFailed> =>
  Effect.gen(function* () {
    const attempt = context.state.attempts
    context.state.attempts += 1
    const modelAttemptId =
      context.logicalOperationId === undefined ? yield* generateId : `${context.modelCallId}:attempt:${attempt}`
    if (context.options.identity !== undefined) {
      context.options.identity.current = { modelCallId: context.modelCallId, modelAttemptId, attempt }
    }
    const startedAt = yield* context.options.clock.currentTimeMillis
    if (context.options.lifecycle !== undefined) {
      if (context.logicalOperationId === undefined) {
        return yield* InvocationLifecycleFailed.make({
          message: "logicalOperationId is required when invocation lifecycle hooks are configured",
        })
      }
      const invocation = {
        logicalOperationId: context.logicalOperationId,
        modelCallId: context.modelCallId,
        modelAttemptId,
        callOrdinal: context.callOrdinal,
        attempt,
        turn: context.options.turn,
        purpose: context.purpose,
        method,
        ...identityFields(identity),
        startedAt,
      }
      if (context.provider !== undefined) Object.assign(invocation, { provider: context.provider })
      if (context.model !== undefined) Object.assign(invocation, { model: context.model })
      yield* context.options.lifecycle.beforeAttempt(invocation)
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
): Effect.Effect<A, E | AiError.AiError | InvocationLifecycleFailed, R> =>
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
): Stream.Stream<A, E | AiError.AiError | InvocationLifecycleFailed | TerminationFailure, R> =>
  Stream.unwrap(
    Effect.map(beginAttempt(context, "streamText", identity), (attempt) => {
      const stream = promoteStreamFailures(run(), context.options.resilience?.resolve ?? defaultResolveFailure)
      const terminalOptions = {
        toPart: Function.identity,
        turn: context.options.turn,
        provider: context.provider,
        model: context.model,
      }
      const idleTimeout = context.options.resilience?.streamIdleTimeout
      const terminated =
        idleTimeout === undefined
          ? requireTerminal(stream, terminalOptions)
          : requireTerminal(stream, { ...terminalOptions, idleTimeout })
      return terminated.pipe(
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
      )
    }),
  )

export const attemptModel: {
  (context: CallContext, identity?: CandidateIdentity): (model: LanguageModel.Service) => LanguageModel.Service
  (model: LanguageModel.Service, context: CallContext, identity?: CandidateIdentity): LanguageModel.Service
} = Function.dual(
  (args) => args.length === 3 || !("modelCallId" in args[0]),
  (model: LanguageModel.Service, context: CallContext, identity?: CandidateIdentity): LanguageModel.Service =>
    adapt<
      AiError.AiError | InvocationLifecycleFailed,
      AiError.AiError | InvocationLifecycleFailed,
      AiError.AiError | InvocationLifecycleFailed | TerminationFailure
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
    }),
)
