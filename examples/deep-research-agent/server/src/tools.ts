import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "@batonfx/core"
import { SearchResult, Service } from "./search-provider"
/** @experimental */
export const webSearchTool = Tool.make("web_search", {
  description: "Search the web for a query and return a short list of results with titles, URLs, and snippets.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ results: Schema.Array(SearchResult) }),
  failureMode: "return",
  needsApproval: true,
  dependencies: [Service],
})

/** @experimental */
export const toolkit = Toolkit.make(webSearchTool)

const webSearchHandler = Effect.fn("DeepResearchAgent.webSearch")(function* (params: { readonly query: string }) {
  const searchProvider = yield* Service
  const results = yield* searchProvider.search(params.query)
  yield* Effect.sleep("600 millis")
  return { results }
})

/** @experimental */
export const toolkitLayer = toolkit.toLayer({ web_search: webSearchHandler })
