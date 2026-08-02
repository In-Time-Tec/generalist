import { Agent, TurnPolicy } from "@batonfx/core"
import { toolkit, webSearchTool } from "./tools"

/** @experimental The bounded research policy used by the demo agent. */
export const policy: TurnPolicy.TurnPolicy = TurnPolicy.recurs(6)

/** @experimental The deep-research agent: plan briefly, search as needed, then synthesize a cited answer. */
export const agent = Agent.make({
  name: "deep-research-agent",
  instructions: "Plan briefly, call web_search as needed, then synthesize a cited answer with source URLs.",
  toolkit,
  policy,
}) as unknown as Agent.Agent<{ readonly web_search: typeof webSearchTool }>
