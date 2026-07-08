import { Context, Effect, Schema } from "effect"
import * as Ai from "effect/unstable/ai"

export interface DocsIndexInterface {
  readonly search: (query: string) => Effect.Effect<ReadonlyArray<string>>
}

export class DocsIndex extends Context.Service<DocsIndex, DocsIndexInterface>()("app/DocsIndex") {}

export const searchDocsTool = Ai.Tool.make("search_docs", {
  description: "Search the documentation index and return matching page titles",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ titles: Schema.Array(Schema.String) }),
  failureMode: "return",
  dependencies: [DocsIndex],
})

export const toolkit = Ai.Toolkit.make(searchDocsTool)
