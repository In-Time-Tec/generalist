import { describe, expect, it } from "@effect/vitest"
import { ModelRegistry } from "tenetkit"
import { Cause, Config, Effect, Exit, Layer, Option, Redacted, Schema, Stream } from "effect"
import { AiError, LanguageModel } from "effect/unstable/ai"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { layer as anthropicLayer } from "tenetkit/ai/anthropic"
import { layer as openAiLayer } from "tenetkit/ai/openai"
import { layer as compatibleLayer } from "tenetkit/ai/openai-compat"
import { layer as openRouterLayer } from "tenetkit/ai/openrouter"
import { layerOpenAi } from "tenetkit/ai/deterministic"

const apiKey = Config.succeed(Redacted.make("test-key"))
const image = new TextEncoder().encode("image")
const imageBase64 = "aW1hZ2U="
const imageDataUri = `data:image/png;base64,${imageBase64}`
const imageUrl = new URL("https://example.com/image.png")
const stringify = Schema.encodeSync(Schema.UnknownFromJsonString)

const prompt = [
  {
    role: "user" as const,
    content: [
      { type: "text" as const, text: "before" },
      { type: "file" as const, mediaType: "image/png", fileName: "bytes.png", data: image },
      { type: "file" as const, mediaType: "image/png", fileName: "base64.png", data: imageBase64 },
      { type: "file" as const, mediaType: "image/png", fileName: "data-uri.png", data: imageDataUri },
      { type: "file" as const, mediaType: "image/png", fileName: "remote.png", data: imageUrl },
      { type: "text" as const, text: "after" },
    ],
  },
]

const decodeBody = (request: HttpClientRequest.HttpClientRequest): unknown =>
  request.body._tag === "Uint8Array"
    ? Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(new TextDecoder().decode(request.body.body))
    : undefined

const capture = (
  provider: string,
  model: string,
  layer: Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient>,
  input: unknown = prompt,
  operation: "generateText" | "generateObject" | "streamText" = "generateText",
) => {
  let body: unknown
  let requests = 0
  const client = HttpClient.make((request) => {
    requests++
    body = decodeBody(request)
    return Effect.die("request captured")
  })
  const selection = { provider, model }
  const call =
    operation === "streamText"
      ? ModelRegistry.stream(selection, LanguageModel.streamText({ prompt: input as never })).pipe(Stream.runDrain)
      : ModelRegistry.operate(
          selection,
          operation === "generateObject"
            ? LanguageModel.generateObject({
                prompt: input as never,
                objectName: "result",
                schema: Schema.Struct({ value: Schema.String }),
              })
            : LanguageModel.generateText({ prompt: input as never }),
        )
  const run = Effect.exit(call)
  return Effect.scoped(
    Layer.build(Layer.provide(layer, Layer.succeed(HttpClient.HttpClient, client))).pipe(
      Effect.flatMap((context) => Effect.provide(run, context)),
      Effect.map((exit) => ({ body, requests, exit })),
    ),
  )
}

const failureDescription = (exit: Exit.Exit<unknown, unknown>): string | undefined => {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) return undefined
  const failure = Cause.findErrorOption(exit.cause)
  expect(Option.isSome(failure)).toBe(true)
  if (Option.isNone(failure)) return undefined
  expect(AiError.isAiError(failure.value)).toBe(true)
  if (!AiError.isAiError(failure.value)) return undefined
  expect(failure.value.reason._tag).toBe("InvalidRequestError")
  return failure.value.reason._tag === "InvalidRequestError" ? failure.value.reason.description : undefined
}

const adapters = [
  {
    name: "OpenAI",
    provider: "openai",
    model: "gpt-test",
    layer: openAiLayer({ model: "gpt-test", apiKey }),
    inline: imageDataUri,
  },
  {
    name: "OpenAI-compatible",
    provider: "compatible",
    model: "compatible-test",
    layer: compatibleLayer({ provider: "compatible", model: "compatible-test", apiKey }),
    inline: imageDataUri,
  },
  {
    name: "Anthropic",
    provider: "anthropic",
    model: "claude-test",
    layer: anthropicLayer({ model: "claude-test", apiKey }),
    inline: `"source":{"type":"base64","media_type":"image/png","data":"${imageBase64}"}`,
  },
  {
    name: "OpenRouter",
    provider: "openrouter",
    model: "router-test",
    layer: openRouterLayer({ model: "router-test", apiKey }),
    inline: imageDataUri,
  },
  {
    name: "deterministic OpenAI fallback",
    provider: "openai",
    model: "fallback-openai-test",
    layer: layerOpenAi({ model: "fallback-openai-test", fallbackModel: "fallback-test", apiKey }),
    inline: imageDataUri,
  },
]

describe("provider image-source conformance", () => {
  for (const adapter of adapters) {
    it.effect(`${adapter.name} preserves image representations and ordered content`, () =>
      Effect.gen(function* () {
        const captured = yield* capture(adapter.provider, adapter.model, adapter.layer)
        const body = stringify(captured.body)

        expect(captured.requests).toBe(1)
        expect(body.split(adapter.inline)).toHaveLength(4)
        expect(body).toContain(imageUrl.toString())
        expect(body.indexOf("before")).toBeLessThan(body.indexOf(adapter.inline))
        expect(body.indexOf(adapter.inline)).toBeLessThan(body.indexOf("after"))
      }),
    )

    it.effect(`${adapter.name} rejects malformed and unsupported images before transport`, () =>
      Effect.gen(function* () {
        const malformed = yield* capture(adapter.provider, adapter.model, adapter.layer, [
          { role: "user", content: [{ type: "file", mediaType: "image/png", data: "not base64" }] },
        ])
        const mismatched = yield* capture(adapter.provider, adapter.model, adapter.layer, [
          { role: "user", content: [{ type: "file", mediaType: "image/png", data: "data:image/jpeg;base64,aQ==" }] },
        ])
        const unsupported = yield* capture(adapter.provider, adapter.model, adapter.layer, [
          { role: "user", content: [{ type: "file", mediaType: "image/svg+xml", data: new Uint8Array([1]) }] },
        ])
        const noncanonical = yield* capture(adapter.provider, adapter.model, adapter.layer, [
          { role: "user", content: [{ type: "file", mediaType: "image/png", data: "AB==" }] },
        ])
        const uppercase = yield* capture(adapter.provider, adapter.model, adapter.layer, [
          { role: "user", content: [{ type: "file", mediaType: "Image/PNG", data: new Uint8Array([1]) }] },
        ])
        const assistant = yield* capture(adapter.provider, adapter.model, adapter.layer, [
          { role: "assistant", content: [{ type: "file", mediaType: "image/png", data: new Uint8Array([1]) }] },
        ])

        expect(malformed.requests).toBe(0)
        expect(mismatched.requests).toBe(0)
        expect(unsupported.requests).toBe(0)
        expect(noncanonical.requests).toBe(0)
        expect(uppercase.requests).toBe(0)
        expect(assistant.requests).toBe(0)
        expect(failureDescription(malformed.exit)).toBe("image data must be valid base64")
        expect(failureDescription(mismatched.exit)).toContain("does not match")
        expect(failureDescription(unsupported.exit)).toBe("unsupported image MIME type: image/svg+xml")
        expect(failureDescription(noncanonical.exit)).toBe("image data must use canonical base64 encoding")
        expect(failureDescription(uppercase.exit)).toBe("unsupported image MIME type: Image/PNG")
        expect(failureDescription(assistant.exit)).toBe("image file parts are only supported in user messages")
      }),
    )
  }

  it.effect("accepts every conforming image MIME type", () =>
    Effect.gen(function* () {
      const layer = openAiLayer({ model: "mime-test", apiKey })
      const mediaTypes = ["image/gif", "image/jpeg", "image/png", "image/webp"]
      const captured = yield* Effect.forEach(mediaTypes, (mediaType) =>
        capture("openai", "mime-test", layer, [
          { role: "user", content: [{ type: "file", mediaType, data: new Uint8Array([1]) }] },
        ]),
      )

      for (let index = 0; index < mediaTypes.length; index++) {
        expect(captured[index]?.requests).toBe(1)
        expect(stringify(captured[index]?.body)).toContain(`data:${mediaTypes[index]};base64,AQ==`)
      }
    }),
  )

  it.effect("applies validation to object generation and streaming before transport", () =>
    Effect.gen(function* () {
      const layer = openAiLayer({ model: "operation-test", apiKey })
      const invalid = [{ role: "user", content: [{ type: "file", mediaType: "image/png", data: "not base64" }] }]
      const object = yield* capture("openai", "operation-test", layer, invalid, "generateObject")
      const stream = yield* capture("openai", "operation-test", layer, invalid, "streamText")

      expect(object.requests).toBe(0)
      expect(stream.requests).toBe(0)
      expect(failureDescription(object.exit)).toBe("image data must be valid base64")
      expect(failureDescription(stream.exit)).toBe("image data must be valid base64")
    }),
  )
})
