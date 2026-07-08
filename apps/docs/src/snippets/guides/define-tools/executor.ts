import { Effect, Layer } from "effect"
import { ToolExecutor } from "@batonfx/core"
import { DocsIndex, toolkit } from "./search-tool"

const searchDocsHandler = Effect.fn("Docs.searchDocs")(function* (params: { readonly query: string }) {
  const index = yield* DocsIndex
  const titles = yield* index.search(params.query)
  return { titles }
})

export const toolkitLayer = toolkit.toLayer({ search_docs: searchDocsHandler })

export const docsIndexLayer: Layer.Layer<DocsIndex> = Layer.succeed(
  DocsIndex,
  DocsIndex.of({
    search: (query) => Effect.succeed([`How to define tools and toolkits (matched "${query}")`]),
  }),
)

export const toolExecutorLayer: Layer.Layer<ToolExecutor.ToolExecutor> = Layer.unwrap(
  Effect.gen(function* () {
    const handledToolkit = yield* toolkit.pipe(Effect.provide(toolkitLayer))
    return ToolExecutor.fromToolkit(handledToolkit)
  }),
).pipe(Layer.provide(docsIndexLayer))
