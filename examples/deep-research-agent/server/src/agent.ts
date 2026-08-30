import { Agent, LanguageModel, Tool, Policy } from "tenetkit"
import { WebSearch } from "./web-search"
import { toolkit, webSearchTool } from "./tools"

/** @experimental The bounded research policy used by the demo agent. */
export const policy: Policy.Policy = Policy.recurs(6)

/** @experimental The deep-research agent: plan briefly, search as needed, then synthesize a cited answer. */
export const agent: Agent.Agent<
  { readonly web_search: typeof webSearchTool },
  LanguageModel.LanguageModel | WebSearch | Tool.HandlersFor<{ readonly web_search: typeof webSearchTool }>
> = Agent.make({
  name: "deep-research-agent",
  instructions: "Plan briefly, call web_search as needed, then synthesize a cited answer with source URLs.",
  toolkit,
  policy,
})
