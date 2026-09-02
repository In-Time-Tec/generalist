import { Effect, Function, Schema } from "effect"
import { BudgetExhausted, type BudgetLimits } from "../../../../core/durable/run-budget.js"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import { appendLifecycle, attemptStartedEvent } from "../../append.js"
import type { MemoryState } from "../../state.js"
import { budgetForEvents } from "../../../execution/inspection.js"

export const extendBudget: {
  (
    runId: string,
    delta: BudgetLimits,
  ): (state: MemoryState) => Effect.Effect<readonly [void, MemoryState], RunNotFound | RuntimeUnavailable>
  (
    state: MemoryState,
    runId: string,
    delta: BudgetLimits,
  ): Effect.Effect<readonly [void, MemoryState], RunNotFound | RuntimeUnavailable>
} = Function.dual(3, (state: MemoryState, runId: string, delta: BudgetLimits) =>
  Effect.gen(function* () {
    const run = state.runs.get(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const [, extended] = yield* appendLifecycle(state, runId, { _tag: "BudgetExtended", delta })
    if (run.status !== "waiting" || !Schema.is(BudgetExhausted)(run.suspension)) return [undefined, extended] as const
    const remaining = yield* budgetForEvents(extended.runs.get(runId)!.events)
    if (remaining[run.suspension.budget] === 0 || remaining[run.suspension.budget] === "unknown") {
      return [undefined, extended] as const
    }
    const runs = new Map(extended.runs)
    const { suspension: _suspension, ...clearedRun } = extended.runs.get(runId)!
    runs.set(runId, clearedRun)
    const cleared = { ...extended, runs }
    const [, activated] = yield* appendLifecycle(cleared, runId, attemptStartedEvent(run.attempt + 1), "running")
    return [undefined, activated] as const
  }),
)
