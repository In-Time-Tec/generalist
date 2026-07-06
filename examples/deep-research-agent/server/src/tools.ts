import { Effect, Schema } from "effect"
import * as Ai from "effect/unstable/ai"
import * as SearchProvider from "./search-provider"

/** @experimental */
export const webSearchTool = Ai.Tool.make("web_search", {
  description: "Search the web for a query and return a short list of results with titles, URLs, and snippets.",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ results: Schema.Array(SearchProvider.SearchResult) }),
  failureMode: "return",
  dependencies: [SearchProvider.Service],
})

/** @experimental */
export const toolkit = Ai.Toolkit.make(webSearchTool)

const webSearchHandler = Effect.fn("DeepResearchAgent.webSearch")(function* (params: { readonly query: string }) {
  const searchProvider = yield* SearchProvider.Service
  const results = yield* searchProvider.search(params.query)
  yield* Effect.sleep("600 millis")
  return { results }
})

/** @experimental */
export const toolkitLayer = toolkit.toLayer({ web_search: webSearchHandler })
