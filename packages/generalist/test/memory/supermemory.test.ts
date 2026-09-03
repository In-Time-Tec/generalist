import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Memory } from "generalist"
import { SupermemoryError, layerSupermemory } from "generalist/memory"
import { Testing } from "generalist/testing"

const decoder = new TextDecoder()
const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const decodeBody = (request: HttpClientRequest.HttpClientRequest): Effect.Effect<Schema.Json> =>
  request.body._tag === "Uint8Array"
    ? Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(decoder.decode(request.body.body)).pipe(Effect.orDie)
    : Effect.succeed(null)

interface Stored {
  readonly id: string
  readonly containerTag: string
  readonly memory: string
}

const recordedFixture = () => {
  let nextId = 0
  let stored: Array<Stored> = []
  const requests: Array<{ readonly method: string; readonly path: string; readonly body: Schema.Json }> = []
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.gen(function* () {
        const body = yield* decodeBody(request)
        requests.push({ method: request.method, path: url.pathname, body })
        if (request.method === "POST" && url.pathname === "/v4/memories") {
          const input = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              containerTag: Schema.String,
              memories: Schema.Array(Schema.Struct({ content: Schema.String })),
            }),
          )(body).pipe(Effect.orDie)
          const memories = input.memories.map(({ content }) => {
            const value = { id: `fixture-memory-${(nextId += 1)}`, containerTag: input.containerTag, memory: content }
            stored.push(value)
            return { id: value.id, memory: content, isStatic: false, createdAt: "2026-09-02T00:00:00.000Z" }
          })
          return HttpClientResponse.fromWeb(request, new Response(encode({ documentId: null, memories })))
        }
        if (request.method === "POST" && url.pathname === "/v4/search") {
          const input = yield* Schema.decodeUnknownEffect(
            Schema.Struct({ q: Schema.String, containerTag: Schema.String, limit: Schema.Finite }),
          )(body).pipe(Effect.orDie)
          const terms = new Set(input.q.toLowerCase().match(/[a-z0-9-]+/g) ?? [])
          const results = stored
            .filter(({ containerTag }) => containerTag === input.containerTag)
            .map((value) => ({
              ...value,
              similarity: [...terms].some((term) => value.memory.toLowerCase().includes(term)) ? 0.99 : 0.6,
            }))
            .toSorted((left, right) => right.similarity - left.similarity)
            .slice(0, input.limit)
            .map(({ id, memory, similarity }) => ({ id, memory, similarity, metadata: { fixture: true } }))
          return HttpClientResponse.fromWeb(
            request,
            new Response(encode({ results, timing: 1, total: results.length })),
          )
        }
        if (request.method === "DELETE" && url.pathname === "/v4/memories") {
          const input = yield* Schema.decodeUnknownEffect(
            Schema.Struct({ id: Schema.String, containerTag: Schema.String }),
          )(body).pipe(Effect.orDie)
          stored = stored.filter((value) => value.id !== input.id || value.containerTag !== input.containerTag)
          return HttpClientResponse.fromWeb(request, new Response(encode({ success: true })))
        }
        if (request.method === "DELETE" && url.pathname.startsWith("/v3/container-tags/")) {
          const tag = decodeURIComponent(url.pathname.slice("/v3/container-tags/".length))
          stored = stored.filter(({ containerTag }) => containerTag !== tag)
          return HttpClientResponse.fromWeb(request, new Response(encode({ success: true })))
        }
        return HttpClientResponse.fromWeb(request, new Response("missing fixture", { status: 404 }))
      }),
    ),
  )
  return { layer, requests }
}

const fixture = recordedFixture()
const memory = layerSupermemory({
  apiKey: Config.succeed(Redacted.make("recorded-fixture-key")),
  containerTag: "recorded-fixture",
  containerTagForKey: (key) => key.subject,
  endpoint: "https://supermemory.fixture",
  limit: 16,
}).pipe(Layer.provide(fixture.layer))

Testing.memory({ layer: memory, persistent: true })

describe("Supermemory HTTP boundary", () => {
  it.effect("rejects unsupported semantic-memory version operations without an HTTP request", () => {
    const before = fixture.requests.length
    const program = Effect.gen(function* () {
      const service = yield* Memory.Memory
      const rememberFailure = yield* service
        .remember({
          key: { agent: "agent", subject: "session" },
          turn: 0,
          terminal: true,
          transcript: Prompt.make("replacement"),
          entryId: "semantic-entry",
          supersedes: 1,
          evidence: [],
        })
        .pipe(Effect.flip)
      const historyFailure = yield* service.history("semantic-entry").pipe(Effect.flip)
      const revertFailure = yield* service.revert("semantic-entry", { to: 1 }).pipe(Effect.flip)

      expect(rememberFailure.reason).toBe("unsupported")
      expect(historyFailure.reason).toBe("unsupported")
      expect(revertFailure.reason).toBe("unsupported")
      expect(fixture.requests).toHaveLength(before)
    })
    return Effect.scoped(
      Layer.build(memory).pipe(Effect.flatMap((context) => program.pipe(Effect.provideContext(context)))),
    )
  })

  it.effect("sends bearer-authenticated v4 requests and preserves typed status and body failures", () => {
    let authorization: string | undefined
    const failing = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        authorization = request.headers.authorization
        return Effect.succeed(HttpClientResponse.fromWeb(request, new Response("recorded failure", { status: 429 })))
      }),
    )
    const layer = layerSupermemory({
      apiKey: Config.succeed(Redacted.make("secret-fixture-key")),
      containerTag: "fixture-session",
      endpoint: "https://supermemory.fixture",
    }).pipe(Layer.provide(failing))
    const program = Effect.gen(function* () {
      const service = yield* Memory.Memory
      const failure = yield* service
        .recall({ key: { agent: "agent", subject: "session" }, turn: 0, prompt: Prompt.make("remember") })
        .pipe(Effect.flip)
      expect(authorization).toBe("Bearer secret-fixture-key")
      expect(failure.cause).toBeInstanceOf(SupermemoryError)
      expect(failure.cause).toMatchObject({ status: 429, body: "recorded failure" })
    })
    return Effect.scoped(
      Layer.build(layer).pipe(Effect.flatMap((context) => program.pipe(Effect.provideContext(context)))),
    )
  })
})
