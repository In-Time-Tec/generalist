import {
  ActiveModelResponse,
  type Service as ActiveModelResponseService,
  make as makeActiveModelResponse,
} from "../../core/model/result/active-model-response.js"
import { Context, Effect, Option, Ref, Schema } from "effect"
import { AgentExecutionFailure, RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import type { ExecutionClaim, Service as RunStoreService } from "../run/store.js"
import type { RunFailure } from "../run/event.js"
import { make as makeModelResponseInterrupted } from "./model-response/interrupted.js"

const interrupted = AgentExecutionFailure.make({ message: "execution interrupted" })

const settleRunningModels = (input: {
  readonly store: RunStoreService
  readonly claim: ExecutionClaim
  readonly runId: string
  readonly activeOperationIds: Ref.Ref<ReadonlySet<string>>
  readonly activeModelResponse: ActiveModelResponseService
  readonly reason: "cancel" | "failure"
  readonly error: RunFailure
}) =>
  Effect.gen(function* () {
    const snapshot = yield* input.activeModelResponse.snapshot
    const operationIds = yield* Ref.get(input.activeOperationIds)
    const settled = new Set<string>()
    for (const operationId of operationIds) {
      const operation = yield* input.store.getOperation({ runId: input.runId, operationId })
      if (operation.kind !== "model" || operation.status !== "running") continue
      const outcome = { _tag: "Failed" as const, error: input.error }
      if (Option.isSome(snapshot) && snapshot.value.operationKey === operation.operationKey) {
        yield* input.store.commitInterruptedModelResponse({
          ...input.claim,
          operationId,
          outcome,
          event: makeModelResponseInterrupted({
            turn: snapshot.value.turn,
            operationKey: operation.operationKey,
            modelCallId: snapshot.value.modelCallId,
            modelAttemptId: snapshot.value.modelAttemptId,
            attempt: snapshot.value.attempt,
            sessionParentId: snapshot.value.sessionParentId ?? null,
            response: snapshot.value.response,
            reason: input.reason,
          }),
        })
      } else {
        yield* input.store.completeOperation({ ...input.claim, operationId, outcome })
      }
      settled.add(operationId)
    }
    if (settled.size > 0) {
      yield* Ref.update(
        input.activeOperationIds,
        (current) => new Set([...current].filter((operationId) => !settled.has(operationId))),
      )
    }
  })

/** Settle a Run whose execution ended mid-operation without claiming an unsafe operation can replay. */
export const settleInterruptedExecution = (input: {
  readonly store: RunStoreService
  readonly claim: ExecutionClaim
  readonly runId: string
  readonly activeOperationIds: Ref.Ref<ReadonlySet<string>>
  readonly completingRetrySafeOperationIds: Ref.Ref<ReadonlySet<string>>
  readonly activeModelResponse: ActiveModelResponseService
  readonly reason: "cancel" | "failure"
  readonly error?: RunFailure
  readonly settleRun?: boolean
}): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const error = input.error ?? interrupted
    if (input.settleRun !== false) {
      yield* settleRunningModels({ ...input, error })
    }
    const operationIds = yield* Ref.get(input.activeOperationIds)
    const completingRetrySafe = yield* Ref.get(input.completingRetrySafeOperationIds)
    const requiresRecovery = [...operationIds].filter((operationId) => !completingRetrySafe.has(operationId))
    yield* Effect.forEach(
      requiresRecovery,
      (operationId) => input.store.expireRunningOperation({ ...input.claim, operationId }),
      { discard: true },
    )
    if (input.settleRun === false) return
    const inspected = requiresRecovery.length > 0 ? yield* input.store.inspect(input.runId) : undefined
    if (inspected?.status === "needs-resolution") return
    yield* input.store
      .fail({ ...input.claim, error })
      .pipe(Effect.catch((failure) => (Schema.is(RunTerminal)(failure) ? Effect.void : Effect.fail(failure))))
    yield* Ref.set(input.activeOperationIds, new Set())
    yield* Ref.set(input.completingRetrySafeOperationIds, new Set())
  }).pipe(Effect.orDie)

export interface ExecutionInterruption {
  readonly context: Context.Context<typeof ActiveModelResponse>
  readonly settle: (input: {
    readonly reason: "cancel" | "failure"
    readonly error?: RunFailure
  }) => Effect.Effect<void>
  readonly retry: <A, E, R>(
    blocked: boolean,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A | undefined, E | RunNotFound | RuntimeUnavailable, R>
  readonly onInterrupt: (cancellationRequested: Effect.Effect<boolean>) => Effect.Effect<void>
}

/** Bind interruption settlement and Core's retained response to one hosted execution. */
export const make = (input: {
  readonly store: RunStoreService
  readonly claim: ExecutionClaim
  readonly runId: string
  readonly activeOperationIds: Ref.Ref<ReadonlySet<string>>
  readonly completingRetrySafeOperationIds: Ref.Ref<ReadonlySet<string>>
}): ExecutionInterruption => {
  const activeModelResponse = makeActiveModelResponse()
  const settle = (terminal: { readonly reason: "cancel" | "failure"; readonly error?: RunFailure }) =>
    settleInterruptedExecution({ ...input, activeModelResponse, ...terminal })
  const hasRunningModelOperation = Effect.gen(function* () {
    for (const operationId of yield* Ref.get(input.activeOperationIds)) {
      const operation = yield* input.store.getOperation({ runId: input.runId, operationId })
      if (operation.kind === "model" && operation.status === "running") return true
    }
    return false
  })
  const abandon = settleInterruptedExecution({
    ...input,
    activeModelResponse,
    reason: "failure",
    error: interrupted,
    settleRun: false,
  })
  return {
    context: Context.make(ActiveModelResponse, activeModelResponse),
    settle,
    retry: <A, E, R>(blocked: boolean, effect: Effect.Effect<A, E, R>) => {
      const skipped: Effect.Effect<A | undefined> = Effect.as(Effect.void, undefined)
      if (blocked) return skipped
      return hasRunningModelOperation.pipe(Effect.flatMap((running) => (running ? skipped : effect)))
    },
    onInterrupt: (cancellationRequested) =>
      cancellationRequested.pipe(Effect.flatMap((requested) => (requested ? settle({ reason: "cancel" }) : abandon))),
  }
}
