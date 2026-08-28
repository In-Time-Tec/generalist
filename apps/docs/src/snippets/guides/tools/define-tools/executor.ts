import { Effect, Layer } from "effect"
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

export const docsToolLayer = toolkitLayer.pipe(Layer.provideMerge(docsIndexLayer))
