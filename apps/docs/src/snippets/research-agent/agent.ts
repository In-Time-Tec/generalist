import { Agent, TurnPolicy } from "tenetkit"
import type { LanguageModel, Tool } from "effect/unstable/ai"
import { SearchProvider } from "./search-provider"
import { toolkit, type webSearchTool } from "./tools"

type Tools = { readonly web_search: typeof webSearchTool }

export const agent: Agent.Agent<Tools, LanguageModel.LanguageModel | SearchProvider | Tool.HandlersFor<Tools>> =
  Agent.make({
    name: "research-agent",
    instructions: "Plan briefly, call web_search as needed, then synthesize a cited answer with source URLs.",
    toolkit,
    policy: TurnPolicy.recurs(6),
  })
