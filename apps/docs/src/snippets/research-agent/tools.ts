import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "@batonfx/core"
import { SearchResult, Service } from "./search-provider"
export const webSearchTool = Tool.make("web_search", {
  description: "Search the web for a query and return a short list of results with titles, URLs, and snippets.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ results: Schema.Array(SearchResult) }),
  failureMode: "return",
  needsApproval: true,
  dependencies: [Service],
})

export const toolkit = Toolkit.make(webSearchTool)

const webSearchHandler = Effect.fn("ResearchAgent.webSearch")(function* (params: { readonly query: string }) {
  const searchProvider = yield* Service
  const results = yield* searchProvider.search(params.query)
  return { results }
})

export const toolkitLayer = toolkit.toLayer({ web_search: webSearchHandler })
