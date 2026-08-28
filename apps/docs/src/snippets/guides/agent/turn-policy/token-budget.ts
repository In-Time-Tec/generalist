import { Effect } from "effect"
import { Agent, Prompt, TurnPolicy } from "tenetkit"

const approximateTokens = (history: Prompt.Prompt): number => Math.ceil(JSON.stringify(history.content).length / 4)

export const tokenBudget = (maxTokens: number): TurnPolicy.TurnPolicy =>
  TurnPolicy.make((info) =>
    Effect.succeed(
      approximateTokens(info.history) > maxTokens
        ? TurnPolicy.decision.stop({ _tag: "BudgetExhausted", budget: "tokens" })
        : TurnPolicy.decision.continue(),
    ),
  )

const _agent = Agent.make({
  name: "budgeted-researcher",
  policy: TurnPolicy.both(tokenBudget(24_000), TurnPolicy.recurs(8)),
})
