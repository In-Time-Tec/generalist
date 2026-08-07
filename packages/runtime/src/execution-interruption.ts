import { Effect, Ref, Schema } from "effect"
import { AgentExecutionFailure, RunTerminal } from "./errors.js"
import type { ExecutionClaim, Interface as RunStoreInterface } from "./run-store.js"

/**
 * @experimental Settle a Run whose execution was interrupted mid-operation.
 *
 * Operations that are not retry-safe must be expired before the Run fails, or a recovered process
 * would replay a side effect the interrupted attempt already performed. A Run that expiry moved to
 * `needs-resolution` is left for resolution rather than failed.
 */
export const settleInterruptedExecution = (input: {
  readonly store: RunStoreInterface
  readonly claim: ExecutionClaim
  readonly runId: string
  readonly activeOperationIds: Ref.Ref<ReadonlySet<string>>
  readonly completingRetrySafeOperationIds: Ref.Ref<ReadonlySet<string>>
}): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const operationIds = yield* Ref.get(input.activeOperationIds)
    const completingRetrySafe = yield* Ref.get(input.completingRetrySafeOperationIds)
    const requiresRecovery = [...operationIds].filter((operationId) => !completingRetrySafe.has(operationId))
    yield* Effect.forEach(
      requiresRecovery,
      (operationId) => input.store.expireRunningOperation({ ...input.claim, operationId }),
      { discard: true },
    )
    if (requiresRecovery.length > 0 && (yield* input.store.inspect(input.runId)).status === "needs-resolution") return
    yield* input.store
      .fail({ ...input.claim, error: AgentExecutionFailure.make({ message: "execution interrupted" }) })
      .pipe(Effect.catch((error) => (Schema.is(RunTerminal)(error) ? Effect.void : Effect.fail(error))))
  }).pipe(Effect.orDie)
