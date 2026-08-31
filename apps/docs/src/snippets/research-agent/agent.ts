import { Agent, Policy } from "generalist"
import type { LanguageModel, Tool } from "effect/unstable/ai"
import { toolkit, type webSearchTool } from "./tools"
import { WebSearch } from "./web-search"

type Tools = { readonly web_search: typeof webSearchTool }

export const agent: Agent.Agent<Tools, LanguageModel.LanguageModel | WebSearch | Tool.HandlersFor<Tools>> = Agent.make({
  name: "research-agent",
  instructions: "Plan briefly, call web_search as needed, then synthesize a cited answer with source URLs.",
  toolkit,
  policy: Policy.recurs(6),
})
