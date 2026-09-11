import { type PreparedObservation, occurredAtMillis } from "../../observation.js"
import { Effect, Function, Schema } from "effect"
import { BudgetExhausted, type BudgetLimits } from "../../../../core/durable/run-budget.js"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import { appendLifecycle, attemptStartedEvent } from "../../append.js"
import type { RuntimeState } from "../../projection.js"
import { budgetForEvents } from "../../../execution/inspection.js"

/**
 * Clear a `BudgetExhausted` suspension once its dimension regained capacity.
 *
 * Capacity can return without an explicit extension: child settlement refunds unused reservations, so the
 * suspension must be re-evaluated against canonical journal spend. The resume fact matches `extendBudget`:
 * the suspension is removed and a new attempt starts.
 */
export const recoverBudgetSuspension: {
  (runId: string): (state: RuntimeState) => Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
  (state: RuntimeState, runId: string): Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
} = Function.dual(2, (state: RuntimeState, runId: string) =>
  Effect.gen(function* () {
    const run = state.runs.get(runId)
    if (run === undefined || run.status !== "waiting" || !Schema.is(BudgetExhausted)(run.suspension)) return state
    const remaining = yield* budgetForEvents({ events: run.events, observedMillis: yield* occurredAtMillis })
    if (remaining[run.suspension.budget] === 0 || remaining[run.suspension.budget] === "unknown") return state
    const runs = new Map(state.runs)
    const { suspension: _suspension, ...clearedRun } = run
    runs.set(runId, clearedRun)
    const [, activated] = yield* appendLifecycle(
      { ...state, runs },
      runId,
      attemptStartedEvent(run.attempt + 1),
      "running",
    )
    return activated
  }),
)

export const extendBudget: {
  (
    runId: string,
    delta: BudgetLimits,
  ): (
    state: RuntimeState,
  ) => Effect.Effect<readonly [void, RuntimeState], RunNotFound | RuntimeUnavailable, PreparedObservation>
  (
    state: RuntimeState,
    runId: string,
    delta: BudgetLimits,
  ): Effect.Effect<readonly [void, RuntimeState], RunNotFound | RuntimeUnavailable, PreparedObservation>
} = Function.dual(3, (state: RuntimeState, runId: string, delta: BudgetLimits) =>
  Effect.gen(function* () {
    const run = state.runs.get(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const [, extended] = yield* appendLifecycle(state, runId, { _tag: "BudgetExtended", delta })
    return [undefined, yield* recoverBudgetSuspension(extended, runId)] as const
  }),
)
