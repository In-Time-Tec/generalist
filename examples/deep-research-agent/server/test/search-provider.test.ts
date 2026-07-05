import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer, Redacted } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import * as SearchProvider from "../src/search-provider"

const withEnv = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromUnknown(env))

const httpClientLayer = (
  handler: Parameters<typeof HttpClient.make>[0],
): Layer.Layer<HttpClient.HttpClient, never, never> => Layer.succeed(HttpClient.HttpClient, HttpClient.make(handler))

const bodyJson = (body: { readonly toJSON: () => unknown }) => {
  const value = body.toJSON() as { readonly body?: string }
  return JSON.parse(value.body ?? "{}") as unknown
}

describe("SearchProvider", () => {
  it.effect("uses the canned corpus when EXA_API_KEY is absent", () =>
    Effect.gen(function* () {
      const results = yield* SearchProvider.search("effect typescript")

      expect(results).toEqual(SearchProvider.cannedResultsFor("effect typescript"))
    }).pipe(Effect.provide(SearchProvider.layer), Effect.provide(withEnv({}))),
  )

  it.effect("sends Exa search requests with the expected endpoint, header, body, and Schema decode", () => {
    const captured: Array<{
      readonly method: string
      readonly url: string
      readonly apiKey: string | undefined
      readonly accept: string | undefined
      readonly body: unknown
    }> = []
    const client = httpClientLayer((request, url) =>
      Effect.sync(() => {
        captured.push({
          method: request.method,
          url: url.toString(),
          apiKey: request.headers["x-api-key"],
          accept: request.headers.accept,
          body: bodyJson(request.body),
        })
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              results: [
                { title: "Baton transport", url: "https://baton.test/transport", text: "Exa text result" },
                { title: null, url: "https://baton.test/snippet", snippet: "Exa snippet result" },
                { title: null, url: null, highlights: ["first highlight", "second highlight"] },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          ),
        )
      }),
    )
    return Effect.gen(function* () {
      const results = yield* SearchProvider.search("baton transport")

      expect(results).toEqual([
        { title: "Baton transport", url: "https://baton.test/transport", snippet: "Exa text result" },
        { title: "https://baton.test/snippet", url: "https://baton.test/snippet", snippet: "Exa snippet result" },
        { title: "Untitled", url: "", snippet: "first highlight\nsecond highlight" },
      ])
      expect(captured).toEqual([
        {
          method: "POST",
          url: "https://api.exa.ai/search",
          apiKey: "exa-test",
          accept: "application/json",
          body: {
            query: "baton transport",
            numResults: 5,
            contents: { text: { maxCharacters: 1000 } },
          },
        },
      ])
    }).pipe(Effect.provide(SearchProvider.exaLayerFromApiKey(Redacted.make("exa-test"))), Effect.provide(client))
  })

  it.effect("builds the configured Exa provider when EXA_API_KEY is present", () =>
    Effect.gen(function* () {
      const service = yield* SearchProvider.Service

      expect(service.search).toBeTypeOf("function")
    }).pipe(Effect.provide(SearchProvider.layer), Effect.provide(withEnv({ EXA_API_KEY: "exa-env-test" }))),
  )

  it.effect("falls back to the canned corpus on Exa failure", () =>
    Effect.gen(function* () {
      const client = httpClientLayer((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response("not available", { status: 500 }))),
      )
      const results = yield* SearchProvider.search("baton agent framework").pipe(
        Effect.provide(SearchProvider.exaLayerFromApiKey(Redacted.make("exa-test"))),
        Effect.provide(client),
      )

      expect(results).toEqual(SearchProvider.cannedResultsFor("baton agent framework"))
    }),
  )
})
