import { Agent, LanguageModel, Tool, TurnPolicy } from "tenetkit"
import { Service as SearchProvider } from "./search-provider"
import { toolkit, webSearchTool } from "./tools"

/** @experimental The bounded research policy used by the demo agent. */
export const policy: TurnPolicy.TurnPolicy = TurnPolicy.recurs(6)

/** @experimental The deep-research agent: plan briefly, search as needed, then synthesize a cited answer. */
export const agent: Agent.Agent<
  { readonly web_search: typeof webSearchTool },
  LanguageModel.LanguageModel | SearchProvider | Tool.HandlersFor<{ readonly web_search: typeof webSearchTool }>
> = Agent.make({
  name: "deep-research-agent",
  instructions: "Plan briefly, call web_search as needed, then synthesize a cited answer with source URLs.",
  toolkit,
  policy,
})
