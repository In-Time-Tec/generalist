import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Stream } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { ModelRegistry } from "@batonfx/core"
import { layer } from "@batonfx/providers/openrouter"

describe("OpenRouter stream error normalization", () => {
  it.effect("fails with a bounded retryable AiError when a stream chunk reports provider overload", () => {
    const message = `${"x".repeat(3_000)}SECRET-SUFFIX`
    const body = `data: {"id":"generation-1","choices":[],"created":1,"model":"router-test","object":"chat.completion.chunk","error":{"message":"${message}","code":503}}\n\n`
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
        ),
      ),
    )
    return Effect.gen(function* () {
      const failure = yield* ModelRegistry.stream(
        { provider: "openrouter", model: "router-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        Stream.provide(
          layer({ model: "router-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
        Stream.runDrain,
        Effect.flip,
      )

      expect(AiError.isAiError(failure)).toBe(true)
      if (AiError.isAiError(failure)) {
        expect(failure.reason._tag).toBe("InternalProviderError")
        expect(failure.isRetryable).toBe(true)
        if (failure.reason._tag === "InternalProviderError") {
          expect(failure.reason.description).toHaveLength(2_048)
          expect(failure.reason.description).not.toContain("SECRET-SUFFIX")
        }
      }
    })
  })

  it.effect("keeps an unknown numeric code terminal", () => {
    const body = `data: {"id":"generation-1","choices":[],"created":1,"model":"router-test","object":"chat.completion.chunk","error":{"message":"Unknown provider code","code":600}}\n\n`
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
        ),
      ),
    )
    return Effect.gen(function* () {
      const failure = yield* ModelRegistry.stream(
        { provider: "openrouter", model: "router-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        Stream.provide(
          layer({ model: "router-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
        Stream.runDrain,
        Effect.flip,
      )

      expect(AiError.isAiError(failure) && failure.reason._tag).toBe("UnknownError")
      expect(AiError.isAiError(failure) && failure.isRetryable).toBe(false)
    })
  })
})
