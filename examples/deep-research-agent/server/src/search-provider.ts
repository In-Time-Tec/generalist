import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

/** @experimental */
export class ExaSearchProviderError extends Schema.TaggedErrorClass<ExaSearchProviderError>()(
  "ExaSearchProviderError",
  {
    message: Schema.String,
  },
) {}

/** @experimental */
export const SearchResult = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  snippet: Schema.String,
})

/** @experimental */
export type SearchResult = typeof SearchResult.Type

interface CannedTopic {
  readonly keywords: ReadonlyArray<string>
  readonly results: ReadonlyArray<SearchResult>
}

const cannedTopics: ReadonlyArray<CannedTopic> = [
  {
    keywords: ["effect", "typescript", "functional"],
    results: [
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
    ],
  },
  {
    keywords: ["baton", "agent sdk", "agent framework"],
    results: [
      {
        title: "Baton: a standalone Effect-native agent SDK",
        url: "https://github.com/batonfx/batonfx",
        snippet: "Baton is a non-durable, Effect-native framework for building tool-using LLM agents.",
      },
      {
        title: "Baton docs - the agent loop",
        url: "https://baton.dev/docs/concepts/agent-loop",
        snippet: "Baton's agent loop plans, calls tools over configurable turns, and synthesizes a final answer.",
      },
    ],
  },
  {
    keywords: ["foldkit", "elm architecture", "foldcn"],
    results: [
      {
        title: "FoldKit - the Elm architecture for TypeScript",
        url: "https://foldkit.dev",
        snippet: "FoldKit brings the Elm architecture to TypeScript, built on Effect.",
      },
      {
        title: "foldcn - shadcn/ui for FoldKit",
        url: "https://foldcn.dev",
        snippet: "Copy-in styled components over headless FoldKit UI primitives.",
      },
    ],
  },
]

const defaultResults: ReadonlyArray<SearchResult> = [
  {
    title: "Deep research agent demo corpus",
    url: "https://github.com/batonfx/batonfx/tree/main/examples/deep-research-agent",
    snippet: "No EXA_API_KEY was configured, so this canned result stands in for a live web search over this question.",
  },
  {
    title: "Baton - transport and session registry",
    url: "https://github.com/batonfx/batonfx/blob/main/docs/spec/11-transport.md",
    snippet: "The wire protocol and in-process session registry that stream this run to the browser.",
  },
]

/** @experimental */
export const cannedResultsFor = (query: string): ReadonlyArray<SearchResult> => {
  const normalized = query.toLowerCase()
  const topic = cannedTopics.find((candidate) => candidate.keywords.some((keyword) => normalized.includes(keyword)))
  return topic?.results ?? defaultResults
}

const ExaResult = Schema.Struct({
  title: Schema.optionalKey(Schema.NullOr(Schema.String)),
  url: Schema.optionalKey(Schema.NullOr(Schema.String)),
  text: Schema.optionalKey(Schema.NullOr(Schema.String)),
  snippet: Schema.optionalKey(Schema.NullOr(Schema.String)),
  highlights: Schema.optionalKey(Schema.Array(Schema.String)),
})

const ExaResponse = Schema.Struct({
  results: Schema.Array(ExaResult),
})

type ExaResult = typeof ExaResult.Type

/** @experimental */
export interface Interface {
  readonly search: (query: string) => Effect.Effect<ReadonlyArray<SearchResult>>
}

/** @experimental */
export class Service extends Context.Service<Service, Interface>()(
  "@batonfx/example-deep-research-agent/SearchProvider",
) {}

const exaSearchBody = (query: string) => ({
  query,
  numResults: 5,
  contents: { text: { maxCharacters: 1000 } },
})

const messageOf = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    return String((error as { readonly _tag: unknown })._tag)
  }
  if (error instanceof Error) return error.name
  return "unknown"
}

const toExaError = (error: unknown) => new ExaSearchProviderError({ message: `Exa search failed: ${messageOf(error)}` })

const snippetFor = (result: ExaResult): string => {
  if (result.text !== undefined && result.text !== null) return result.text
  if (result.snippet !== undefined && result.snippet !== null) return result.snippet
  return result.highlights?.join("\n") ?? ""
}

const toSearchResult = (result: ExaResult): SearchResult => ({
  title: result.title ?? result.url ?? "Untitled",
  url: result.url ?? "",
  snippet: snippetFor(result),
})

const searchExa = (
  client: HttpClient.HttpClient,
  apiKey: Redacted.Redacted<string>,
  query: string,
): Effect.Effect<ReadonlyArray<SearchResult>, ExaSearchProviderError> => {
  const request = HttpClientRequest.post("https://api.exa.ai/search").pipe(
    HttpClientRequest.setHeader("x-api-key", Redacted.value(apiKey)),
    HttpClientRequest.acceptJson,
    HttpClientRequest.bodyJsonUnsafe(exaSearchBody(query)),
  )
  return client.execute(request).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(ExaResponse)),
    Effect.map((response) => response.results.map(toSearchResult)),
    Effect.mapError(toExaError),
  )
}

/** @experimental */
export const cannedLayer = Layer.succeed(
  Service,
  Service.of({
    search: Effect.fn("SearchProvider.Canned.search")((query: string) => Effect.succeed(cannedResultsFor(query))),
  }),
)

/** @experimental */
export const exaLayerFromApiKey = (
  apiKey: Redacted.Redacted<string>,
): Layer.Layer<Service, never, HttpClient.HttpClient> =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      return Service.of({
        search: Effect.fn("SearchProvider.Exa.search")(function* (query: string) {
          return yield* searchExa(client, apiKey, query).pipe(
            Effect.catch(() => Effect.succeed(cannedResultsFor(query))),
          )
        }),
      })
    }),
  )

/** @experimental */
export const exaLayer = Layer.unwrap(
  Config.redacted("EXA_API_KEY").pipe(
    Effect.map((apiKey) => exaLayerFromApiKey(apiKey).pipe(Layer.provide(FetchHttpClient.layer))),
  ),
)

/** @experimental */
export const layer = Layer.unwrap(
  Config.option(Config.redacted("EXA_API_KEY")).pipe(
    Effect.catchTag("ConfigError", () => Effect.succeedNone),
    Effect.map((apiKey) =>
      Option.match(apiKey, {
        onNone: () => cannedLayer,
        onSome: (key) => exaLayerFromApiKey(key).pipe(Layer.provide(FetchHttpClient.layer)),
      }),
    ),
  ),
)

/** @experimental */
export const searchProviderLayer = layer

/** @experimental */
export const testLayer = (implementation: Interface) => Layer.succeed(Service, Service.of(implementation))

/** @experimental */
export const search = Effect.fn("SearchProvider.search.call")(function* (query: string) {
  const searchProvider = yield* Service
  return yield* searchProvider.search(query)
})
