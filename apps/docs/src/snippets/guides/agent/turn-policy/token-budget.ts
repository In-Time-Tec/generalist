import { Effect } from "effect"
import { Agent, Policy } from "generalist"
import { Prompt } from "effect/unstable/ai"

const approximateTokens = (history: Prompt.Prompt): number => Math.ceil(JSON.stringify(history.content).length / 4)

export const tokenBudget = (maxTokens: number): Policy.Policy =>
  Policy.make((info) =>
    Effect.succeed(
      approximateTokens(info.history) > maxTokens
        ? Policy.decision.stop({ _tag: "BudgetExhausted", budget: "tokens" })
        : Policy.decision.continue(),
    ),
  )

const _agent = Agent.make({
  name: "budgeted-researcher",
  policy: Policy.both(tokenBudget(24_000), Policy.recurs(8)),
})
