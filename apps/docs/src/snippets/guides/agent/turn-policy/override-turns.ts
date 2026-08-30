import { Effect } from "effect"
import { TurnPolicy } from "tenetkit"

export const focusLateTurns: TurnPolicy.Policy = TurnPolicy.make((info) => {
  if (info.turn >= 6) return Effect.succeed(TurnPolicy.decision.stop({ _tag: "GoalSatisfied" }))
  if (info.turn >= 3) {
    return Effect.succeed(
      TurnPolicy.decision.continue({
        activeTools: ["submit_answer"],
        instructions: "Stop exploring. Submit your best answer now.",
      }),
    )
  }
  return Effect.succeed(TurnPolicy.decision.continue())
})
