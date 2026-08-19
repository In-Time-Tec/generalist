import { describe, expect, it } from "@effect/vitest"
import { Config, Deferred, Effect, Fiber, Layer, Redacted, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { OpenAiClient } from "@effect/ai-openai"
import { ModelRegistry } from "tenetkit"
import {
  type OpenAiAccountCredential,
  OpenAiAccountCredentialError,
  type OpenAiAccountCredentials,
  classifyFailure,
  credentialsFromAccountAuth,
  layer as openAiLayer,
  layerAccount,
  layerAccountClient,
} from "tenetkit/ai/openai"
import type { ServiceInterface } from "tenetkit/ai/openai-account-auth"

const endpoint = "https://chatgpt.com/backend-api/codex/responses"
const credential = (generation: string, suffix = generation): OpenAiAccountCredential => ({
  accessToken: Redacted.make(`token-${suffix}`),
  accountId: `account-${suffix}`,
  generation,
})
const responseBody = {
  id: "response-1",
  object: "response",
  model: "gpt-test",
  created_at: 1,
  output: [],
}
const textResponseBody = {
  ...responseBody,
  output: [
    {
      id: "message-1",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "folded summary", annotations: [] }],
    },
  ],
  usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
}
const stringify = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const sse = (...events: ReadonlyArray<unknown>) => events.map((event) => `data: ${stringify(event)}\n\n`).join("")
const completedFrame = (response: unknown = responseBody) =>
  sse({ type: "response.completed", response, sequence_number: 0 })

interface CapturedRequest {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const decodeBody = (request: HttpClientRequest.HttpClientRequest): unknown =>
  request.body._tag === "Uint8Array"
    ? Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(new TextDecoder().decode(request.body.body))
    : undefined

const mockClient = (statuses: Array<number>, requests: Array<CapturedRequest>, body: BodyInit = completedFrame()) =>
  HttpClient.make((request, url) => {
    requests.push({ url: url.toString(), headers: request.headers, body: decodeBody(request) })
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status: statuses.shift() ?? 200 })))
  })

/** Models the ChatGPT account backend, which rejects any request body that does not set stream. */
const streamingOnlyClient = (requests: Array<CapturedRequest>, body: BodyInit = completedFrame()) =>
  HttpClient.make((request, url) => {
    const decoded = decodeBody(request)
    requests.push({ url: url.toString(), headers: request.headers, body: decoded })
    const streaming = isRecord(decoded) && decoded.stream === true
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        streaming
          ? new Response(body, { status: 200 })
          : new Response(stringify({ detail: "Stream must be set to true" }), { status: 400 }),
      ),
    )
  })

const credentials = (
  acquire: Effect.Effect<OpenAiAccountCredential, OpenAiAccountCredentialError>,
  refreshRejected: OpenAiAccountCredentials["refreshRejected"] = () => Effect.die("unexpected refresh"),
): OpenAiAccountCredentials => ({ acquire, refreshRejected })

const expectAiError = (error: unknown): AiError.AiError => {
  expect(AiError.isAiError(error)).toBe(true)
  if (AiError.isAiError(error)) return error
  throw new Error("expected AiError")
}

const provideLayer =
  <R, E, RIn>(layer: Layer.Layer<R, E, RIn>) =>
  <A, E2, R2>(effect: Effect.Effect<A, E2, R | R2>) =>
    Layer.build(layer).pipe(Effect.flatMap((context) => Effect.provide(effect, context)))

const provideAccount = (accountCredentials: OpenAiAccountCredentials, client: HttpClient.HttpClient) => {
  const layer = Layer.provide(
    layerAccount({ model: "gpt-test", credentials: accountCredentials }),
    Layer.succeed(HttpClient.HttpClient, client),
  )
  return provideLayer(layer)
}

const provideAccountStream = (accountCredentials: OpenAiAccountCredentials, client: HttpClient.HttpClient) =>
  Stream.provide(
    Layer.provide(
      layerAccount({ model: "gpt-test", credentials: accountCredentials }),
      Layer.succeed(HttpClient.HttpClient, client),
    ),
  )

const generate = (accountCredentials: OpenAiAccountCredentials, client: HttpClient.HttpClient) =>
  ModelRegistry.operate(
    { provider: "openai", model: "gpt-test" },
    LanguageModel.generateText({ prompt: "hello" }),
  ).pipe(provideAccount(accountCredentials, client))

describe("OpenAI account Responses registration", () => {
  it.effect("resolves the latest credential for every request and keeps identity public", () =>
    Effect.gen(function* () {
      const requests: Array<CapturedRequest> = []
      const current = yield* Ref.make(credential("one"))
      const accountCredentials = credentials(Ref.get(current))
      const client = mockClient([200, 200], requests)
      const registrations = yield* Effect.scoped(
        Layer.build(
          Layer.provide(
            layerAccount({
              model: "gpt-test",
              credentials: accountCredentials,
              registrationKey: "account",
              metadata: { mode: "account" },
            }),
            Layer.succeed(HttpClient.HttpClient, client),
          ),
        ).pipe(Effect.flatMap((context) => ModelRegistry.registrations().pipe(Effect.provide(context)))),
      )
      const registration = registrations[0]!

      yield* generate(accountCredentials, client)
      yield* Ref.set(current, credential("two"))
      yield* generate(accountCredentials, client)

      expect(requests.map(({ headers }) => [headers.authorization, headers["chatgpt-account-id"]])).toEqual([
        ["Bearer token-one", "account-one"],
        ["Bearer token-two", "account-two"],
      ])
      expect(registration.registrationKey).toBe("account")
      expect(registration.metadata).toEqual({ mode: "account" })
      expect(registration.classifyFailure).toBe(classifyFailure)
      expect(stringify(registration)).not.toContain("token-")
      expect(stringify(registration)).not.toContain("account-one")
    }),
  )

  it.effect("uses only the fixed account endpoint and exact Responses request headers and body", () => {
    const requests: Array<CapturedRequest> = []
    return Effect.gen(function* () {
      yield* generate(credentials(Effect.succeed(credential("current"))), mockClient([200], requests))

      expect(requests).toHaveLength(1)
      expect(requests[0]?.url).toBe(endpoint)
      expect(requests[0]?.headers.authorization).toBe("Bearer token-current")
      expect(requests[0]?.headers["chatgpt-account-id"]).toBe("account-current")
      expect(requests[0]?.headers.accept).toBe("text/event-stream")
      expect(requests[0]?.headers["content-type"]).toBe("application/json")
      expect(requests[0]?.body).toMatchObject({ model: "gpt-test", stream: true })
    })
  })

  it.effect("preserves Responses stream conversion and does not refresh after output starts", () => {
    const requests: Array<CapturedRequest> = []
    const refreshes: Array<string> = []
    const accountCredentials = credentials(Effect.succeed(credential("stream")), (generation) =>
      Effect.sync(() => {
        refreshes.push(generation)
        return credential("refreshed")
      }),
    )
    const client = mockClient([200], requests)

    return Effect.gen(function* () {
      yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(provideAccountStream(accountCredentials, client), Stream.runCollect)

      expect(requests).toHaveLength(1)
      expect(requests[0]?.headers.accept).toBe("text/event-stream")
      expect(requests[0]?.body).toMatchObject({ model: "gpt-test", stream: true })
      expect(refreshes).toEqual([])
    })
  })

  it.effect("redacts account credentials from failures during stream consumption", () => {
    const requests: Array<CapturedRequest> = []
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => controller.error(new Error("stream failed")),
    })
    const accountCredentials = credentials(Effect.succeed(credential("generation-secret", "stream-secret")))

    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        ModelRegistry.stream(
          { provider: "openai", model: "gpt-test" },
          LanguageModel.streamText({ prompt: "hello" }),
        ).pipe(provideAccountStream(accountCredentials, mockClient([200], requests, body)), Stream.runCollect),
      )
      const rendered = `${String(failure)} ${stringify(failure)}`

      expect(rendered).not.toContain("stream-secret")
      expect(rendered).not.toContain("generation-secret")
      expect(rendered).not.toContain("account-stream")
    })
  })

  it.effect("uses the authenticated HTTP path even when OpenAI WebSocket mode is ambient", () => {
    const requests: Array<CapturedRequest> = []
    const socketCalls: Array<unknown> = []

    return Effect.gen(function* () {
      yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        provideAccountStream(credentials(Effect.succeed(credential("current"))), mockClient([200], requests)),
        Stream.provideService(OpenAiClient.OpenAiSocket, {
          createResponseStream: (options) =>
            Effect.sync(() => {
              socketCalls.push(options)
              throw new Error("account registration must not use WebSocket mode")
            }),
        }),
        Stream.runDrain,
      )

      expect(socketCalls).toEqual([])
      expect(requests).toHaveLength(1)
    })
  })

  it.effect("refreshes and replays one pre-emission 401 with the rejected generation", () => {
    const requests: Array<CapturedRequest> = []
    const rejected: Array<string> = []
    const accountCredentials = credentials(Effect.succeed(credential("old")), (generation) =>
      Effect.sync(() => {
        rejected.push(generation)
        return credential("new")
      }),
    )

    return Effect.gen(function* () {
      yield* generate(accountCredentials, mockClient([401, 200], requests))

      expect(rejected).toEqual(["old"])
      expect(requests.map(({ headers }) => headers.authorization)).toEqual(["Bearer token-old", "Bearer token-new"])
    })
  })

  it.effect("passes the same stale generation to bounded concurrent refresh callbacks", () => {
    const rejected: Array<string> = []
    const accountCredentials = credentials(Effect.succeed(credential("stale")), (generation) =>
      Effect.sync(() => {
        rejected.push(generation)
        return credential("fresh")
      }),
    )

    return Effect.gen(function* () {
      yield* Effect.all(
        [
          generate(accountCredentials, mockClient([401, 200], [])),
          generate(accountCredentials, mockClient([401, 200], [])),
        ],
        { concurrency: 2 },
      )

      expect(rejected).toEqual(["stale", "stale"])
    })
  })

  it.effect("never sends or replays credentials from a different profile fingerprint", () => {
    const requests: Array<CapturedRequest> = []
    const authCredential = (fingerprint: string, suffix: string) => ({
      accessToken: Redacted.make(`token-${suffix}`),
      idToken: Redacted.make(`id-${suffix}`),
      refreshToken: Redacted.make(`refresh-${suffix}`),
      accountId: Redacted.make(`account-${suffix}`),
      fingerprint,
      generation: `${fingerprint}.${suffix}`,
      expiresAt: 1,
      refreshedAt: 1,
    })
    const auth: ServiceInterface = {
      loginBrowser: () => Effect.succeed(authCredential("profile-a", "old")),
      loginDevice: Effect.succeed(authCredential("profile-a", "old")),
      status: Effect.succeed({ _tag: "Present", fingerprint: "profile-a" }),
      logout: Effect.succeed({ removed: false, revocationSupported: false }),
      acquire: Effect.succeed(authCredential("profile-a", "old")),
      refreshRejected: () => Effect.succeed(authCredential("profile-b", "new")),
    }
    const accountCredentials = credentialsFromAccountAuth(auth, "profile-a")

    return Effect.gen(function* () {
      yield* Effect.flip(generate(accountCredentials, mockClient([401], requests)))
      expect(requests.map(({ headers }) => headers.authorization)).toEqual(["Bearer token-old"])

      const replaced = credentialsFromAccountAuth(
        { ...auth, acquire: Effect.succeed(authCredential("profile-b", "replacement")) },
        "profile-a",
      )
      yield* Effect.flip(generate(replaced, mockClient([], requests)))
      expect(requests).toHaveLength(1)
    })
  })

  it.effect("surfaces a second 401 without another refresh and redacts account credentials", () => {
    const requests: Array<CapturedRequest> = []

    return Effect.gen(function* () {
      const refreshes = yield* Ref.make(0)
      const accountCredentials = credentials(Effect.succeed(credential("secret-generation", "secret-old")), () =>
        Ref.update(refreshes, (count) => count + 1).pipe(Effect.as(credential("new-generation", "secret-new"))),
      )
      const failure = yield* Effect.flip(generate(accountCredentials, mockClient([401, 401], requests)))
      const rendered = `${String(failure)} ${stringify(failure)}`

      expect(yield* Ref.get(refreshes)).toBe(1)
      expectAiError(failure)
      expect(expectAiError(failure).reason._tag).toBe("AuthenticationError")
      expect(rendered).not.toContain("secret-old")
      expect(rendered).not.toContain("secret-new")
      expect(rendered).not.toContain("account-secret")
      expect(rendered).not.toContain("secret-generation")
    })
  })

  it.effect("does not refresh non-401 responses or credential acquisition failures", () =>
    Effect.gen(function* () {
      const refreshes = yield* Ref.make(0)
      const refresh = () => Ref.update(refreshes, (count) => count + 1).pipe(Effect.as(credential("unused")))
      const providerFailure = yield* Effect.flip(
        generate(credentials(Effect.succeed(credential("current")), refresh), mockClient([403], [])),
      )
      const credentialFailure = yield* Effect.flip(
        generate(
          credentials(Effect.fail(OpenAiAccountCredentialError.make({ operation: "acquire" })), refresh),
          mockClient([], []),
        ),
      )

      expect(yield* Ref.get(refreshes)).toBe(0)
      expect(expectAiError(providerFailure).reason._tag).toBe("AuthenticationError")
      expect(expectAiError(credentialFailure).reason._tag).toBe("NetworkError")
      expect(String(credentialFailure)).toContain("credential acquire failed")
    }),
  )

  it.effect("rejects redirects without replaying credentials to another origin", () => {
    const requests: Array<CapturedRequest> = []
    const accountCredentials = credentials(Effect.succeed(credential("current")), () =>
      Effect.die("unexpected refresh"),
    )

    return Effect.gen(function* () {
      const failure = yield* Effect.flip(generate(accountCredentials, mockClient([302], requests)))

      expect(requests.map(({ url }) => url)).toEqual([endpoint])
      expect(expectAiError(failure).reason._tag).toBe("UnknownError")
    })
  })

  it.effect("forces redirect rejection when composed with FetchHttpClient.layer", () => {
    const requests: Array<{ readonly url: string; readonly redirect: RequestRedirect | undefined }> = []
    const fetch: typeof globalThis.fetch = Object.assign(
      (input: URL | RequestInfo, init?: BunFetchRequestInit | RequestInit) => {
        requests.push({ url: String(input), redirect: init?.redirect })
        return Promise.resolve(
          new Response("", {
            status: 302,
            headers: { location: "https://attacker.invalid/responses" },
          }),
        )
      },
      { preconnect: () => {} },
    )
    const layer = Layer.provide(
      layerAccount({ model: "gpt-test", credentials: credentials(Effect.succeed(credential("current"))) }),
      FetchHttpClient.layer,
    )

    return Effect.gen(function* () {
      yield* Effect.flip(
        ModelRegistry.operate(
          { provider: "openai", model: "gpt-test" },
          LanguageModel.generateText({ prompt: "hello" }),
        ).pipe(provideLayer(layer)),
      )

      expect(requests).toEqual([{ url: endpoint, redirect: "error" }])
    }).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch))
  })

  it.effect("preserves interruption during acquire, refresh, and replay", () =>
    Effect.gen(function* () {
      const interrupted = yield* Ref.make<Array<string>>([])
      const blocked = (phase: string, started: Deferred.Deferred<void>) =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Ref.update(interrupted, (phases) => [...phases, phase])),
        )
      const acquireStarted = yield* Deferred.make<void>()
      const acquireFiber = yield* Effect.forkChild(
        generate(credentials(blocked("acquire", acquireStarted)), mockClient([], [])),
      )
      yield* Deferred.await(acquireStarted)
      yield* Fiber.interrupt(acquireFiber)

      const refreshStarted = yield* Deferred.make<void>()
      const refreshFiber = yield* Effect.forkChild(
        generate(
          credentials(Effect.succeed(credential("old")), () => blocked("refresh", refreshStarted)),
          mockClient([401], []),
        ),
      )
      yield* Deferred.await(refreshStarted)
      yield* Fiber.interrupt(refreshFiber)

      const replayStarted = yield* Deferred.make<void>()
      let calls = 0
      const replayClient = HttpClient.make((request) => {
        calls += 1
        if (calls === 1) {
          return Effect.succeed(HttpClientResponse.fromWeb(request, new Response("", { status: 401 })))
        }
        return blocked("replay", replayStarted)
      })
      const replayFiber = yield* Effect.forkChild(
        generate(
          credentials(Effect.succeed(credential("old")), () => Effect.succeed(credential("new"))),
          replayClient,
        ),
      )
      yield* Deferred.await(replayStarted)
      yield* Fiber.interrupt(replayFiber)

      expect(yield* Ref.get(interrupted)).toEqual(["acquire", "refresh", "replay"])
    }),
  )

  it.effect("satisfies non-streaming generateText against the streaming-only account endpoint", () => {
    const requests: Array<CapturedRequest> = []

    return Effect.gen(function* () {
      const response = yield* ModelRegistry.operate(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.generateText({ prompt: "summarize" }),
      ).pipe(
        provideAccount(
          credentials(Effect.succeed(credential("current"))),
          streamingOnlyClient(requests, completedFrame(textResponseBody)),
        ),
      )

      expect(requests).toHaveLength(1)
      expect(requests[0]?.url).toBe(endpoint)
      expect(requests[0]?.body).toMatchObject({ model: "gpt-test", stream: true })
      expect(requests[0]?.headers.accept).toBe("text/event-stream")
      expect(response.text).toBe("folded summary")
      expect(response.finishReason).toBe("stop")
      expect(response.usage.inputTokens.total).toBe(11)
      expect(response.usage.outputTokens.total).toBe(7)
    })
  })

  it.effect("folds a terminal event into exactly what the streaming path produces", () => {
    const message = {
      id: "message-1",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "folded summary", annotations: [] }],
    }
    const incomplete = { ...textResponseBody, incomplete_details: { reason: "max_output_tokens" } }
    const body = sse(
      { type: "response.created", response: responseBody, sequence_number: 0 },
      { type: "response.output_item.added", output_index: 0, item: { ...message, content: [] }, sequence_number: 1 },
      {
        type: "response.output_text.delta",
        item_id: "message-1",
        output_index: 0,
        content_index: 0,
        delta: "folded summary",
        sequence_number: 2,
      },
      { type: "response.output_item.done", output_index: 0, item: message, sequence_number: 3 },
      { type: "response.incomplete", response: incomplete, sequence_number: 4 },
    )
    const accountCredentials = credentials(Effect.succeed(credential("current")))

    return Effect.gen(function* () {
      const folded = yield* ModelRegistry.operate(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.generateText({ prompt: "summarize" }),
      ).pipe(provideAccount(accountCredentials, streamingOnlyClient([], body)))
      const streamed = yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.streamText({ prompt: "summarize" }),
      ).pipe(provideAccountStream(accountCredentials, streamingOnlyClient([], body)), Stream.runCollect)
      const streamedText = streamed
        .filter((part) => part.type === "text-delta")
        .map((part) => part.delta)
        .join("")
      const streamedFinish = streamed.find((part) => part.type === "finish")

      expect(folded.text).toBe(streamedText)
      expect(folded.finishReason).toBe(streamedFinish?.reason)
      expect(folded.usage.inputTokens.total).toBe(streamedFinish?.usage.inputTokens.total)
      expect(folded.usage.outputTokens.total).toBe(streamedFinish?.usage.outputTokens.total)
    })
  })

  it.effect("promotes a terminal response.failed event to a typed failure", () => {
    const requests: Array<CapturedRequest> = []
    const body = sse({
      type: "response.failed",
      response: {
        ...responseBody,
        error: { code: "rate_limit_exceeded", message: "slow down" },
      },
      sequence_number: 0,
    })

    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        ModelRegistry.operate(
          { provider: "openai", model: "gpt-test" },
          LanguageModel.generateText({ prompt: "summarize" }),
        ).pipe(provideAccount(credentials(Effect.succeed(credential("current"))), streamingOnlyClient(requests, body))),
      )

      expect(expectAiError(failure).reason._tag).toBe("RateLimitError")
    })
  })

  it.effect("promotes a mid-stream error frame to a typed failure", () => {
    const requests: Array<CapturedRequest> = []
    const body = sse({
      type: "error",
      code: "context_length_exceeded",
      message: "too many tokens",
      param: null,
      sequence_number: 0,
    })

    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        ModelRegistry.operate(
          { provider: "openai", model: "gpt-test" },
          LanguageModel.generateText({ prompt: "summarize" }),
        ).pipe(provideAccount(credentials(Effect.succeed(credential("current"))), streamingOnlyClient(requests, body))),
      )

      expect(expectAiError(failure).reason._tag).toBe("InvalidRequestError")
      expect(classifyFailure(failure)).toBe("context-overflow")
    })
  })

  it.effect("fails typed when the account stream ends without a terminal event", () => {
    const requests: Array<CapturedRequest> = []
    const body = sse({ type: "response.created", response: responseBody, sequence_number: 0 })

    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        ModelRegistry.operate(
          { provider: "openai", model: "gpt-test" },
          LanguageModel.generateText({ prompt: "summarize" }),
        ).pipe(provideAccount(credentials(Effect.succeed(credential("current"))), streamingOnlyClient(requests, body))),
      )

      expect(expectAiError(failure).reason._tag).toBe("InvalidOutputError")
    })
  })

  it.effect("refreshes and replays one pre-emission 401 for a non-streaming call", () => {
    const requests: Array<CapturedRequest> = []
    const rejected: Array<string> = []
    const accountCredentials = credentials(Effect.succeed(credential("old")), (generation) =>
      Effect.sync(() => {
        rejected.push(generation)
        return credential("new")
      }),
    )
    let calls = 0
    const client = HttpClient.make((request, url) => {
      calls += 1
      requests.push({ url: url.toString(), headers: request.headers, body: decodeBody(request) })
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          calls === 1
            ? new Response("", { status: 401 })
            : new Response(completedFrame(textResponseBody), { status: 200 }),
        ),
      )
    })

    return Effect.gen(function* () {
      const response = yield* ModelRegistry.operate(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.generateText({ prompt: "summarize" }),
      ).pipe(provideAccount(accountCredentials, client))

      expect(rejected).toEqual(["old"])
      expect(requests.map(({ headers }) => headers.authorization)).toEqual(["Bearer token-old", "Bearer token-new"])
      expect(response.text).toBe("folded summary")
    })
  })

  it.effect("fails typed instead of posting embeddings to the account Responses endpoint", () => {
    const requests: Array<CapturedRequest> = []
    const accountCredentials = credentials(Effect.succeed(credential("current")))
    const accountClientLayer = Layer.provide(
      layerAccountClient(accountCredentials),
      Layer.succeed(HttpClient.HttpClient, mockClient([200], requests)),
    )

    return Effect.gen(function* () {
      const client = yield* OpenAiClient.OpenAiClient
      const failure = yield* Effect.flip(client.createEmbedding({ model: "text-embedding-3-small", input: "hello" }))

      expect(requests).toEqual([])
      expect(expectAiError(failure).reason._tag).toBe("InvalidRequestError")
    }).pipe(provideLayer(accountClientLayer))
  })

  it("exposes API-key and account Layer constructors", () => {
    const accountCredentials = credentials(Effect.succeed(credential("current")))

    expect(Layer.isLayer(openAiLayer({ model: "gpt-test", apiKey: Config.succeed(Redacted.make("key")) }))).toBe(true)
    expect(Layer.isLayer(layerAccount({ model: "gpt-test", credentials: accountCredentials }))).toBe(true)
  })
})
