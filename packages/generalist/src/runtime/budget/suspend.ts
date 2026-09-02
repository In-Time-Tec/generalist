import { Effect } from "effect"
import { make, type BudgetLimits, type Remaining } from "../../core/durable/run-budget.js"
import type { DriverCheckpoint } from "../../core/durable/driver.js"
import type { Service as CodeMode } from "../code-mode.js"
import type { Service as Operations } from "../operation/nested-operations.js"
import type { ExecutionClaim, Service as RunStore } from "../run/store.js"
import { suspend } from "../execution/agent/suspend.js"
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
    const checkpoint = replayCheckpoint(make(remaining))(input.checkpoint)
    return checkpoint === undefined ? { remaining } : { remaining, checkpoint }
  }).pipe(Effect.orDie)
