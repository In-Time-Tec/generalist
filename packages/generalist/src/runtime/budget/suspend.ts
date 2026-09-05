import { Effect, Schema } from "effect"
import { make, type BudgetLimits, type Remaining } from "../../core/durable/run-budget.js"
import type { DriverCheckpoint } from "../../core/durable/driver.js"
import { LoopDriverState } from "../../core/durable/loop-driver-state.js"
import type { Service as CodeMode } from "../code-mode.js"
import type { Service as Operations } from "../operation/nested-operations.js"
import type { ExecutionClaim, Service as RunStore } from "../run/store.js"
import { suspend } from "../execution/agent/suspend.js"
import { completedOperationRefValue } from "../execution/model-response/commit.js"
import { factTokens } from "../execution/inspection.js"
import { firstExhausted, replayCheckpoint, runnableLimits } from "./state.js"

export const suspendIfExhausted = (input: {
  readonly budget: Remaining
  readonly runId: string
  readonly claim: ExecutionClaim
  readonly store: RunStore
  readonly nested: Operations
  readonly codeMode?: CodeMode | undefined
}) =>
  Effect.gen(function* () {
    const budget = firstExhausted(input.budget)
    if (budget === undefined) return false
    yield* suspend({
      runId: input.runId,
      claim: input.claim,
      store: input.store,
      nested: input.nested,
      ...(input.codeMode === undefined ? undefined : { codeMode: input.codeMode }),
      suspension: { _tag: "BudgetExhausted", budget },
    })
    return true
  })

export const prepare = (input: {
  readonly runId: string
  readonly claim: ExecutionClaim
  readonly store: RunStore
  readonly nested: Operations
  readonly codeMode?: CodeMode | undefined
  readonly checkpoint?: DriverCheckpoint | undefined
}): Effect.Effect<{ readonly remaining: BudgetLimits; readonly checkpoint?: DriverCheckpoint } | undefined> =>
  Effect.gen(function* () {
    const snapshot = yield* input.store.snapshot(input.runId)
    if (yield* suspendIfExhausted({ ...input, budget: snapshot.budget })) return undefined
    const remaining = runnableLimits(snapshot.budget)
    let replayBudget = make(remaining)
    if (input.checkpoint !== undefined && remaining.tokens !== undefined) {
      const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(input.checkpoint.state)
      if (state.pending?.kind === "model") {
        const operation = yield* input.store.getOperationByKey({ runId: input.runId, operationKey: state.pending.key })
        const completed = operation?.status === "succeeded" ? completedOperationRefValue(operation.result) : undefined
        if (completed !== undefined) {
          // Replay applies the whole recorded charge. Restore only the portion already deducted
          // by canonical usage facts; interruption may have prevented terminal telemetry delivery.
          const charged = snapshot.usageFacts
            .filter((fact) => fact.modelCallId === completed.modelCallId)
            .reduce((total, fact) => total + factTokens(fact), 0)
          replayBudget = make({ ...remaining, tokens: remaining.tokens + charged })
        }
      }
    }
    const checkpoint = replayCheckpoint(replayBudget)(input.checkpoint)
    return checkpoint === undefined ? { remaining } : { remaining, checkpoint }
  }).pipe(Effect.orDie)
