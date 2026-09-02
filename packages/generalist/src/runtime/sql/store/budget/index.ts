import { Effect, Function, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { BudgetExhausted, type BudgetLimits } from "../../../../core/durable/run-budget.js"
import { RunNotFound } from "../../../errors.js"
import { budgetForEvents } from "../../../execution/inspection.js"
import type { EventHub } from "../../subscribers.js"
import { appendEvent, loadEventsAfter, loadRun } from "../statements.js"

export const extendBudget: {
  (runId: string, delta: BudgetLimits): (hub: EventHub) => ReturnType<typeof extend>
  (hub: EventHub, runId: string, delta: BudgetLimits): ReturnType<typeof extend>
} = Function.dual(3, (hub: EventHub, runId: string, delta: BudgetLimits) => extend(hub, runId, delta))

const extend = (hub: EventHub, runId: string, delta: BudgetLimits) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    yield* appendEvent(hub, run, { _tag: "BudgetExtended", delta })
    if (run.status !== "waiting" || !Schema.is(BudgetExhausted)(run.suspension)) return
    const remaining = yield* budgetForEvents(yield* loadEventsAfter(runId, -1))
    if (remaining[run.suspension.budget] === 0 || remaining[run.suspension.budget] === "unknown") return
    yield* sql`UPDATE generalist_runs SET suspension_json = NULL WHERE run_id = ${runId}`
    const extended = (yield* loadRun(runId))!
    yield* appendEvent(hub, extended, { _tag: "RunAttemptStarted", attempt: run.attempt + 1 }, "running")
  })
