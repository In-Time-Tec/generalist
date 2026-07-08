import { Effect, Schema } from "effect"
import * as Ai from "effect/unstable/ai"
import * as SearchProvider from "./search-provider"

export const webSearchTool = Ai.Tool.make("web_search", {
  description: "Search the web for a query and return a short list of results with titles, URLs, and snippets.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ results: Schema.Array(SearchProvider.SearchResult) }),
  failureMode: "return",
  needsApproval: true,
  dependencies: [SearchProvider.Service],
})

export const toolkit = Ai.Toolkit.make(webSearchTool)

const webSearchHandler = Effect.fn("ResearchAgent.webSearch")(function* (params: { readonly query: string }) {
  const searchProvider = yield* SearchProvider.Service
  const results = yield* searchProvider.search(params.query)
  return { results }
})

export const toolkitLayer = toolkit.toLayer({ web_search: webSearchHandler })
