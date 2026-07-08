import { Agent, TurnPolicy } from "@batonfx/core"
import { toolkit } from "./tools"

export const agent = Agent.make({
  name: "research-agent",
  instructions: "Plan briefly, call web_search as needed, then synthesize a cited answer with source URLs.",
  toolkit,
  policy: TurnPolicy.recurs(6),
})
