import { Effect } from "effect"
import { TurnPolicy } from "@batonfx/core"

export const focusLateTurns: TurnPolicy.TurnPolicy = TurnPolicy.make((info) =>
  Effect.succeed(
    info.turn >= 6
      ? TurnPolicy.decision.stop({ _tag: "GoalSatisfied" })
      : info.turn >= 3
        ? TurnPolicy.decision.continue({
            activeTools: ["submit_answer"],
            instructions: "Stop exploring. Submit your best answer now.",
          })
        : TurnPolicy.decision.continue(),
  ),
)
