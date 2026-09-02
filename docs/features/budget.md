# Run budgets

`RunBudget` gives a durable run explicit limits for model tokens, US-dollar model cost, elapsed time, tool calls, and child runs.

```ts
import { Effect } from "effect"
import { RunBudget } from "generalist"
import { Runtime } from "generalist/runtime"

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const budget = RunBudget.make({
    tokens: 2_000_000,
    usd: 5,
    duration: "30 minutes",
    toolCalls: 500,
    children: 8,
  })
  const handle = yield* runtime.start(Researcher, input, { budget })
  return yield* runtime.inspect(handle.runId)
})
```

`inspect(runId).budget` is the remaining budget. Generalist derives spend from accepted, model-usage, tool, child, and budget-extension journal facts whenever it inspects or resumes a run; remaining amounts are not a second persisted counter. A priced model contributes tokens and USD. An unknown model still contributes tokens and reports the USD remainder as `"unknown"`.

Budget exhaustion is not a run failure. The run enters `waiting` with the suspension `{ _tag: "BudgetExhausted", budget }`. `TurnPolicy` receives the same remaining numeric limits as `info.budget` before a follow-up turn.

Children inherit a reservation from the parent's remaining budget before admission. Active reservations are unavailable to the parent. Settlement releases the unused reservation; consumed child resources remain charged to the parent. Fan-out placement, rather than the child agent, chooses each reservation.

`runtime.extendBudget(runId, delta)` is the low-level top-up primitive. It journals the delta and resumes a run waiting specifically on budget exhaustion. `runtime.operator.extendBudget(runId, delta, operator)` wraps that primitive with recovery-decision validation and a journaled operator identity; operator tooling should prefer it.

A tool-call credit is consumed when its durable operation starts live execution. Recovery and fork replay reuse the recorded outcome without emitting or charging another `ToolExecutionStarted`, so one `extendBudget({ toolCalls: 1 })` funds one handler execution.
