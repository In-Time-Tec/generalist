import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Schedule, Schema, Stream } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ModelRegistry, ModelResilience } from "tenetkit"
import { classifyFailure, layer, normalizeResponsesSse } from "tenetkit/ai/openai"

const stringify = Schema.encodeSync(Schema.UnknownFromJsonString)
const encoder = new TextEncoder()

const nestedError = stringify({
  type: "error",
  error: { type: "server_error", code: "server_error", message: "boom", param: null },
  sequence_number: 159,
})
const flatError = stringify({
  type: "error",
  code: "server_error",
  message: "boom",
  param: null,
  sequence_number: 159,
})
const nestedOverload = stringify({
  type: "error",
  error: {
    type: "server_error",
    code: "server_is_overloaded",
    message: "Our servers are currently overloaded. Please try again later.",
    param: null,
  },
  sequence_number: 2,
})
const failedOverload = stringify({
  type: "response.failed",
  response: {
    id: "response-failed",
    object: "response",
    model: "gpt-test",
    created_at: 1,
    output: [],
    error: {
      type: "server_error",
      code: "server_is_overloaded",
      message: "Our servers are currently overloaded. Please try again later.",
      param: null,
    },
  },
  sequence_number: 2,
})
const flatOverload = stringify({
  type: "error",
  code: "server_is_overloaded",
  message: "Our servers are currently overloaded. Please try again later.",
  param: null,
  sequence_number: 2,
})
const deltaFrame = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n\n'
const completed = stringify({
  type: "response.completed",
  response: { id: "response-1", object: "response", model: "gpt-test", created_at: 1, output: [] },
  sequence_number: 160,
})

const stubClient = (chunks: Array<string>, contentType = "text/event-stream") =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => {
              for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
              controller.close()
            },
          }),
          { status: 200, headers: { "content-type": contentType } },
        ),
      ),
    ),
  )

const readThrough = (chunks: Array<string>, url: string, contentType?: string) =>
  Effect.scoped(
    normalizeResponsesSse(stubClient(chunks, contentType))
      .execute(HttpClientRequest.post(url))
      .pipe(Effect.flatMap((response) => response.text)),
  )

const responsesUrl = "https://api.openai.com/v1/responses"

describe("normalizeResponsesSse", () => {
  it.effect("flattens nested error frames and leaves other frames byte-identical", () =>
    Effect.gen(function* () {
      const body = `${deltaFrame}event: error\ndata: ${nestedError}\n\n`
      const output = yield* readThrough([body], responsesUrl)
      expect(output).toBe(`${deltaFrame}event: error\ndata: ${flatError}\n\n`)
    }),
  )

  it.effect("preserves CRLF framing while flattening", () =>
    Effect.gen(function* () {
      const body = `event: error\r\ndata: ${nestedError}\r\n\r\n`
      const output = yield* readThrough([body], responsesUrl)
      expect(output).toBe(`event: error\r\ndata: ${flatError}\r\n\r\n`)
    }),
  )

  it.effect("normalizes frames split across chunk boundaries and flushes a final unterminated frame", () =>
    Effect.gen(function* () {
      const body = `${deltaFrame}event: error\ndata: ${nestedError}`
      const chunks = [body.slice(0, 20), body.slice(20, 75), body.slice(75, 76), body.slice(76)]
      const output = yield* readThrough(chunks, responsesUrl)
      expect(output).toBe(`${deltaFrame}event: error\ndata: ${flatError}`)
    }),
  )

  it.effect("passes through already-flat errors, comments, and non-JSON data unchanged", () =>
    Effect.gen(function* () {
      const body = [`: keep-alive`, ``, `data: ${flatError}`, ``, `data: not json`, ``].join("\n")
      const output = yield* readThrough([body], responsesUrl)
      expect(output).toBe(body)
    }),
  )

  it.effect("flattens a nested error split across multiple data lines into one flat data line", () =>
    Effect.gen(function* () {
      const body = [
        `data: {"type":"error",`,
        `data: "error":{"code":"context_length_exceeded","message":"too long"},"sequence_number":2}`,
        ``,
        ``,
      ].join("\n")
      const output = yield* readThrough([body], responsesUrl)
      expect(output).toBe(
        `data: ${stringify({
          type: "error",
          code: "context_length_exceeded",
          message: "too long",
          param: null,
          sequence_number: 2,
        })}\n\n`,
      )
    }),
  )

  it.effect("does not touch streams from non-Responses endpoints", () =>
    Effect.gen(function* () {
      const body = `event: error\ndata: ${nestedError}\n\n`
      const output = yield* readThrough([body], "https://api.anthropic.com/v1/messages")
      expect(output).toBe(body)
    }),
  )

  it.effect("does not touch non-SSE responses", () =>
    Effect.gen(function* () {
      const body = stringify({ type: "error", error: { message: "boom" } })
      const output = yield* readThrough([body], responsesUrl, "application/json")
      expect(output).toBe(body)
    }),
  )

  it.effect("flattens SSE error frames even when the response is not labeled text/event-stream", () =>
    Effect.gen(function* () {
      const body = `event: error\ndata: ${nestedError}\n\n`
      const output = yield* readThrough([body], responsesUrl, "application/json")
      expect(output).toBe(`event: error\ndata: ${flatError}\n\n`)
    }),
  )

  it.effect("does not copy an arbitrary malformed error payload into the normalized message", () =>
    Effect.gen(function* () {
      const malformed = stringify({
        type: "error",
        error: { type: "server_error", secret: "must-not-escape" },
        sequence_number: 2,
      })
      const output = yield* readThrough([`event: error\ndata: ${malformed}\n\n`], responsesUrl)

      expect(output).toContain("OpenAI response failed")
      expect(output).not.toContain("must-not-escape")
    }),
  )

  it.effect("turns response.failed into a decodable provider failure", () =>
    Effect.gen(function* () {
      const output = yield* readThrough([`event: response.failed\ndata: ${failedOverload}\n\n`], responsesUrl)

      expect(output).toBe(`event: response.failed\ndata: ${flatOverload}\n\n`)
    }),
  )

  it.effect("flattens a nested error that also carries a top-level message", () =>
    Effect.gen(function* () {
      const withTopLevelMessage = stringify({
        type: "error",
        message: "request failed",
        error: { type: "invalid_request_error", code: "context_length_exceeded", message: "too long", param: "input" },
        sequence_number: 7,
      })
      const output = yield* readThrough([`data: ${withTopLevelMessage}\n\n`], responsesUrl)
      expect(output).toBe(
        `data: ${stringify({
          type: "error",
          code: "context_length_exceeded",
          message: "too long",
          param: "input",
          sequence_number: 7,
        })}\n\n`,
      )
    }),
  )
})

describe("OpenAI layer stream error normalization", () => {
  it.effect("fails with a retryable AiError when Responses reports server overload", () =>
    Effect.gen(function* () {
      const body = `event: response.failed\ndata: ${failedOverload}\n\n`
      const failure = yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        Stream.provide(
          layer({ model: "gpt-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, stubClient([body]))),
          ),
        ),
        Stream.runDrain,
        Effect.flip,
      )

      expect(AiError.isAiError(failure)).toBe(true)
      if (AiError.isAiError(failure)) {
        expect(failure.reason._tag).toBe("InternalProviderError")
        expect(failure.isRetryable).toBe(true)
        expect(failure.message).toContain("Our servers are currently overloaded")
      }
    }),
  )

  it.effect("bounds provider-controlled error descriptions", () => {
    const message = `${"x".repeat(3_000)}SECRET-SUFFIX`
    const overloaded = stringify({
      type: "error",
      code: "server_error",
      message,
      param: null,
      sequence_number: 2,
    })
    const client = stubClient([`event: error\ndata: ${overloaded}\n\n`])
    return Effect.gen(function* () {
      const failure = yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        Stream.provide(
          layer({ model: "gpt-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
        Stream.runDrain,
        Effect.flip,
      )

      expect(AiError.isAiError(failure) && failure.reason._tag).toBe("InternalProviderError")
      if (AiError.isAiError(failure) && failure.reason._tag === "InternalProviderError") {
        expect(failure.reason.description).toHaveLength(2_048)
        expect(failure.reason.description).not.toContain("SECRET-SUFFIX")
      }
    })
  })

  it.effect("maps an official vector-store timeout to a retryable provider failure", () => {
    const timeout = stringify({
      type: "error",
      code: "vector_store_timeout",
      message: "Vector store timed out",
      param: null,
      sequence_number: 2,
    })
    const client = stubClient([`event: error\ndata: ${timeout}\n\n`])
    return Effect.gen(function* () {
      const failure = yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        Stream.provide(
          layer({ model: "gpt-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
        Stream.runDrain,
        Effect.flip,
      )

      expect(AiError.isAiError(failure) && failure.reason._tag).toBe("InternalProviderError")
      expect(AiError.isAiError(failure) && failure.isRetryable).toBe(true)
    })
  })

  it.effect("keeps normalized context overflow on the reactive compaction path", () => {
    const overflow = stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        code: "context_length_exceeded",
        message: "Input exceeds the context window",
        param: "input",
      },
      sequence_number: 2,
    })
    const client = stubClient([`event: error\ndata: ${overflow}\n\n`])
    return Effect.gen(function* () {
      const failure = yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        Stream.provide(
          layer({ model: "gpt-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
        Stream.runDrain,
        Effect.flip,
      )

      expect(AiError.isAiError(failure) && failure.reason._tag).toBe("InvalidRequestError")
      expect(classifyFailure(failure)).toBe("context-overflow")
    })
  })

  it.effect("retries a pre-output server overload and returns only the recovered attempt", () => {
    let calls = 0
    const overloaded = `event: error\ndata: ${nestedOverload}\n\n`
    const recovered = `event: response.completed\ndata: ${completed}\n\n`
    const client = HttpClient.make((request) => {
      calls += 1
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(calls === 1 ? overloaded : recovered, { status: 200 })),
      )
    })
    return Effect.gen(function* () {
      const resilience = yield* ModelResilience.make({ retrySchedule: Schedule.recurs(1) })
      const parts = yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        Stream.unwrap(
          Effect.map(LanguageModel.LanguageModel, (model) =>
            ModelResilience.apply(model, resilience).streamText({
              prompt: "hello",
            }),
          ),
        ),
      ).pipe(
        Stream.provide(
          layer({ model: "gpt-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
        ),
        Stream.runCollect,
      )

      expect(calls).toBe(2)
      expect(parts.map((part) => part.type)).toEqual(["finish"])
    })
  })
})
