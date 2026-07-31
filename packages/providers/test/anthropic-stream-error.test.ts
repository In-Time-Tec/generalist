import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Stream } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { ModelRegistry } from "@batonfx/core"
import { layer } from "@batonfx/providers/anthropic"

describe("Anthropic stream error normalization", () => {
  it.effect("fails with a bounded retryable AiError when Messages reports overload", () => {
    const message = `${"x".repeat(3_000)}SECRET-SUFFIX`
    const body = `event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"${message}"},"request_id":"req-overload"}\n\n`
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
        { provider: "anthropic", model: "claude-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        Stream.provide(
          layer({ model: "claude-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
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
})
