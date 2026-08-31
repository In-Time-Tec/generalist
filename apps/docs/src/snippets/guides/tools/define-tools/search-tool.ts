import { Context, Effect, Schema } from "effect"
import { Tool, Toolkit } from "generalist"
export interface DocsIndexService {
  readonly search: (query: string) => Effect.Effect<ReadonlyArray<string>>
}

export class DocsIndex extends Context.Service<DocsIndex, DocsIndexService>()(
  "generalist-docs/snippets/guides/tools/define-tools/search-tool/DocsIndex",
) {}

export const searchDocsTool = Tool.make("search_docs", {
  description: "Search the documentation index and return matching page titles",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ titles: Schema.Array(Schema.String) }),
  failureMode: "return",
  dependencies: [DocsIndex],
})

export const toolkit = Toolkit.make(searchDocsTool)
