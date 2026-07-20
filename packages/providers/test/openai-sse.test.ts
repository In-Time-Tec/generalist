import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ModelRegistry } from "@batonfx/core"
import { layer, normalizeResponsesSse } from "@batonfx/providers/openai"

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

  it.effect("passes through already-flat errors, comments, and multi-data frames unchanged", () =>
    Effect.gen(function* () {
      const body = [
        `: keep-alive`,
        ``,
        `data: ${flatError}`,
        ``,
        `data: {"type":"error",`,
        `data: "error":{}}`,
        ``,
        `data: not json`,
        ``,
      ].join("\n")
      const output = yield* readThrough([body], responsesUrl)
      expect(output).toBe(body)
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
})

describe("OpenAI layer stream error normalization", () => {
  it.effect("surfaces a nested server_error as a decoded error part instead of a schema failure", () =>
    Effect.gen(function* () {
      const body = `event: error\ndata: ${nestedError}\n\nevent: response.completed\ndata: ${completed}\n\n`
      const parts = yield* ModelRegistry.stream(
        { provider: "openai", model: "gpt-test" },
        LanguageModel.streamText({ prompt: "hello" }),
      ).pipe(
        Stream.provide(
          layer({ model: "gpt-test", apiKey: Config.succeed(Redacted.make("test-key")) }).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, stubClient([body]))),
          ),
        ),
        Stream.runCollect,
      )
      const errorParts = parts.filter((part) => part.type === "error")
      expect(errorParts).toHaveLength(1)
      expect(stringify(errorParts[0])).toContain("boom")
    }),
  )
})
