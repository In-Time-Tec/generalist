import { Effect } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, TurnPolicy } from "@batonfx/core"

const approximateTokens = (history: Ai.Prompt.Prompt): number => Math.ceil(JSON.stringify(history.content).length / 4)

export const tokenBudget = (maxTokens: number): TurnPolicy.TurnPolicy =>
  TurnPolicy.make((info) =>
    Effect.succeed(
      approximateTokens(info.history) > maxTokens ? TurnPolicy.decision.stop : TurnPolicy.decision.continue(),
    ),
  )

export const agent = Agent.make({
  name: "budgeted-researcher",
  policy: TurnPolicy.both(tokenBudget(24_000), TurnPolicy.recurs(8)),
})
