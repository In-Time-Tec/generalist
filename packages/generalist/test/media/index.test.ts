/* oxlint-disable effecttsgo/strict-effect-provide -- Each test is a test-host Layer composition root. */
import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect"
import { LanguageModel, Model, Prompt, Response } from "effect/unstable/ai"
import { BlobStore, layerMemory, type Service as BlobStoreService } from "../../src/blob-store/index.js"
import { layerTest as layerModelCatalogTest } from "../../src/ai/model-catalog.js"
import { Agent, Media, Session } from "../../src/index.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const mediaLayer = layerMemory().pipe(Layer.provide(BunCrypto.layer))

const promptFile = (prompt: Prompt.Prompt): Prompt.FilePart | undefined => {
  for (const message of prompt.content) {
    if (message.role !== "user" && message.role !== "assistant") continue
    for (const part of message.content) if (part.type === "file") return part
  }
  return undefined
}

describe("Media", () => {
  it.effect("rejects a ref whose media type does not match its typed field", () =>
    Effect.gen(function* () {
      const failure = yield* Schema.decodeEffect(Media.File({ mediaType: "application/pdf" }))({
        sha256: "0".repeat(64),
        mediaType: "image/png",
        bytes: 3,
      }).pipe(Effect.flip)
      expect(failure.message).toContain("Expected media type application/pdf")
    }),
  )

  it.effect("reads image, audio, video, and PDF paths into BlobStore", () => {
    const encoder = new TextEncoder()
    const fileSystem = Layer.succeed(
      FileSystem.FileSystem,
      FileSystem.makeNoop({ readFile: (path) => Effect.succeed(encoder.encode(path)) }),
    )
    return Effect.gen(function* () {
      for (const [path, mediaType, filename] of [
        ["/inputs/photo.png", "image/png", "photo.png"],
        ["/inputs/recording.mp3", "audio/mpeg", "recording.mp3"],
        ["/inputs/clip.mp4", "video/mp4", "clip.mp4"],
        ["/inputs/spec.pdf", "application/pdf", "spec.pdf"],
      ] as const) {
        const ref = yield* Media.fromPath(path)
        expect(ref).toMatchObject({ mediaType, bytes: encoder.encode(path).byteLength, filename })
        expect((yield* (yield* BlobStore).get(ref.sha256)).data).toEqual(encoder.encode(path))
      }
    }).pipe(Effect.provide(Layer.mergeAll(mediaLayer, fileSystem, Path.layer)))
  })

  it.effect("sends typed image input as FilePart while Session stores only its ref", () => {
    let providerPrompt: Prompt.Prompt | undefined
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (options) => {
          providerPrompt = options.prompt
          return Stream.make(Response.makePart("text-delta", { id: "answer", delta: "seen" }), finish)
        },
      }),
    )
    const input = Schema.Struct({ image: Media.File({ mediaType: "image/png" }) })
    const agent = Agent.make({ name: "media-input", input })
    return Effect.gen(function* () {
      const store = yield* BlobStore
      const ref = yield* store.put({ data: new Uint8Array([1, 2, 3]), mediaType: "image/png" })
      expect(yield* Agent.run(agent, { image: ref }, { sessionId: "media-input-session" })).toBe("seen")

      const sent = promptFile(providerPrompt!)
      expect(sent?.data).toEqual(new Uint8Array([1, 2, 3]))
      const session = yield* Session.acquire("media-input-session")
      const path = yield* session.path()
      const message = path.find((entry) => entry._tag === "Message")
      const journalFile = message?._tag === "Message" ? promptFile(Prompt.fromMessages([message.message])) : undefined
      expect(Schema.is(Schema.String)(journalFile?.data)).toBe(true)
      expect(String(journalFile?.data)).toContain("generalist:blob-ref:")
      expect(String(journalFile?.data)).not.toContain("AQID")
    }).pipe(Effect.provide(Layer.mergeAll(mediaLayer, model, Session.layerMemory)))
  })

  it.effect("uses the ModelCatalog provider transport preference", () => {
    const ref = {
      sha256: "0".repeat(64),
      mediaType: "image/png",
      bytes: 3,
    }
    let preference: "bytes" | "url" | undefined
    const store: BlobStoreService = {
      put: () => Effect.die("unused"),
      get: () => Effect.die("unused"),
      resolve: (storedRef, options) => {
        preference = options.prefer
        return Effect.succeed({ ref: storedRef, data: new URL("https://media.example.test/image.png") })
      },
    }
    const catalog = layerModelCatalogTest([
      {
        provider: "test-provider",
        model: "test-model",
        contextWindow: 1_000,
        maxOutput: 100,
        media: { input: ["image"], preferredInput: "url" },
      },
    ])
    return Effect.gen(function* () {
      const file = yield* Media.resolve(ref)
      expect(file.data).toEqual(new URL("https://media.example.test/image.png"))
      expect(preference).toBe("url")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(BlobStore, BlobStore.of(store)),
          catalog,
          Layer.succeed(Model.ProviderName, "test-provider"),
          Layer.succeed(Model.ModelName, "test-model"),
        ),
      ),
    )
  })

  it.effect("round-trips a generated file through BlobStore and typed Agent.run output", () => {
    const generated = new Uint8Array([1, 2, 3])
    const ref = {
      sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      mediaType: "image/png" as const,
      bytes: 3,
    }
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () =>
          Effect.succeed([
            { type: "text", text: JSON.stringify({ output: { file: ref } }) },
            Schema.encodeSync(Response.FinishPart)(finish),
          ]),
        streamText: () =>
          Stream.make(
            { type: "file", mediaType: "image/png", data: "AQID" },
            Response.makePart("text-delta", { id: "answer", delta: "generated" }),
            finish,
          ),
      }),
    )
    const agent = Agent.make({
      name: "media-output",
      output: Schema.Struct({ file: Media.File({ mediaType: "image/png" }) }),
    })
    return Effect.gen(function* () {
      expect(yield* Agent.run(agent, "generate an image", { sessionId: "media-output-session" })).toEqual({
        file: ref,
      })
      expect((yield* (yield* BlobStore).get(ref.sha256)).data).toEqual(generated)
      const session = yield* Session.acquire("media-output-session")
      const path = yield* session.path()
      const assistant = path.find((entry) => entry._tag === "Message" && entry.message.role === "assistant")
      const journalFile =
        assistant?._tag === "Message" ? promptFile(Prompt.fromMessages([assistant.message])) : undefined
      expect(Schema.is(Schema.String)(journalFile?.data)).toBe(true)
      expect(String(journalFile?.data)).toContain("generalist:blob-ref:")
    }).pipe(Effect.provide(Layer.mergeAll(mediaLayer, model, Session.layerMemory)))
  })
})
