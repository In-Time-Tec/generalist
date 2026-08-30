import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "tenetkit"
import { SearchResult, WebSearch } from "./web-search"
/** @experimental */
export const webSearchTool = Tool.make("web_search", {
  description: "Search the web for a query and return a short list of results with titles, URLs, and snippets.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ results: Schema.Array(SearchResult) }),
  failureMode: "return",
  needsApproval: true,
  dependencies: [WebSearch],
})

/** @experimental */
export const toolkit = Toolkit.make(webSearchTool)

const webSearchHandler = Effect.fn("DeepResearchAgent.webSearch")(function* (params: { readonly query: string }) {
  const webSearch = yield* WebSearch
  const results = yield* webSearch.search(params.query)
  yield* Effect.sleep("600 millis")
  return { results }
})

/** @experimental */
export const toolkitLayer = toolkit.toLayer({ web_search: webSearchHandler })
