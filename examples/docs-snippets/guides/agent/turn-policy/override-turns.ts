import { Effect } from "effect"
import { Policy } from "generalist"

export const focusLateTurns: Policy.Policy = Policy.make((info) => {
  if (info.turn >= 6) return Effect.succeed(Policy.decision.stop({ _tag: "GoalSatisfied" }))
  if (info.turn >= 3) {
    return Effect.succeed(
      Policy.decision.continue({
        activeTools: ["submit_answer"],
        instructions: "Stop exploring. Submit your best answer now.",
      }),
    )
  }
  return Effect.succeed(Policy.decision.continue())
})
