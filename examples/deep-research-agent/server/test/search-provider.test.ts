import { describe, expect, layer as layerHost } from "@effect/vitest"
import { ConfigProvider, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Service, cannedResultsFor, exaLayerFromApiKey, layer, search } from "../src/search-provider"
const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

const withEnv = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromUnknown(env))

const httpClientLayer = (
  handler: Parameters<typeof HttpClient.make>[0],
): Layer.Layer<HttpClient.HttpClient, never, never> => Layer.succeed(HttpClient.HttpClient, HttpClient.make(handler))

const bodyJson = (body: { readonly toJSON: () => unknown }) => {
  const value = body.toJSON() as { readonly body?: string }
  return Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(value.body ?? "{}")
}

describe("SearchProvider", () => {
  layerHost(layer.pipe(Layer.provide(withEnv({}))))("uses the canned corpus when EXA_API_KEY is absent", (it) => {
    it.effect("uses the canned corpus when EXA_API_KEY is absent", () =>
      Effect.gen(function* () {
        const results = yield* search("effect typescript")

        expect(results).toEqual(cannedResultsFor("effect typescript"))
      }),
    )
  })

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
          encodeJson({
            results: [
              { title: "TenetKit transport", url: "https://tenetkit.test/transport", text: "Exa text result" },
              { title: null, url: "https://tenetkit.test/snippet", snippet: "Exa snippet result" },
              { title: null, url: null, highlights: ["first highlight", "second highlight"] },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
      )
    }),
  )
  layerHost(exaLayerFromApiKey(Redacted.make("exa-test")).pipe(Layer.provide(client)))(
    "sends Exa search requests with the expected endpoint, header, body, and Schema decode",
    (it) => {
      it.effect("sends Exa search requests with the expected endpoint, header, body, and Schema decode", () =>
        Effect.gen(function* () {
          const results = yield* search("baton transport")

          expect(results).toEqual([
            { title: "TenetKit transport", url: "https://tenetkit.test/transport", snippet: "Exa text result" },
            {
              title: "https://tenetkit.test/snippet",
              url: "https://tenetkit.test/snippet",
              snippet: "Exa snippet result",
            },
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
        }),
      )
    },
  )

  layerHost(layer.pipe(Layer.provide(withEnv({ EXA_API_KEY: "exa-env-test" }))))(
    "builds the configured Exa provider when EXA_API_KEY is present",
    (it) => {
      it.effect("builds the configured Exa provider when EXA_API_KEY is present", () =>
        Effect.gen(function* () {
          const service = yield* Service

          expect(service.search).toBeTypeOf("function")
        }),
      )
    },
  )

  layerHost(
    (() => {
      const failingClient = httpClientLayer((request) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, new Response("not available", { status: 500 }))),
      )
      return exaLayerFromApiKey(Redacted.make("exa-test")).pipe(Layer.provide(failingClient))
    })(),
  )("falls back to the canned corpus on Exa failure", (it) => {
    it.effect("falls back to the canned corpus on Exa failure", () =>
      Effect.gen(function* () {
        const results = yield* search("baton agent framework")

        expect(results).toEqual(cannedResultsFor("baton agent framework"))
      }),
    )
  })
})
