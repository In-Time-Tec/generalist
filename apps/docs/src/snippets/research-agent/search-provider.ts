import { Context, Effect, Layer, Schema } from "effect"

export const SearchResult = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  snippet: Schema.String,
})

export type SearchResult = typeof SearchResult.Type

export interface Interface {
  readonly search: (query: string) => Effect.Effect<ReadonlyArray<SearchResult>>
}

export class Service extends Context.Service<Service, Interface>()(
  "@batonfx/docs/snippets/research-agent/search-provider/Service",
) {}

const cannedResults: ReadonlyArray<SearchResult> = [
  {
    title: "Effect - production-grade TypeScript",
    url: "https://effect.website",
    snippet: "Effect is a TypeScript library for building robust, type-safe, and composable applications.",
  },
  {
    title: "Effect-TS on GitHub",
    url: "https://github.com/Effect-TS/effect",
    snippet: "The Effect monorepo: the core library, Schema, platform integrations, and the CLI.",
  },
]

export const cannedLayer: Layer.Layer<Service> = Layer.succeed(
  Service,
  Service.of({ search: () => Effect.succeed(cannedResults) }),
)
