import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { BlobNotFound, BlobStore } from "../blob-store/index.js"
import { record } from "./report.js"

/** BlobStore conformance suite registration. @experimental */
export interface Options<E = never> {
  readonly layer: Layer.Layer<BlobStore, E, never>
  readonly maxBytes: number
  /** Rebuild the layer between put and get to prove storage survives closure. */
  readonly persistent?: boolean
}

const bytes = new TextEncoder().encode("blob")
const input = { data: bytes, mediaType: "image/png", filename: "image.png" } as const

const provide = <A, E, LayerError>(options: Options<LayerError>, effect: Effect.Effect<A, E, BlobStore>) =>
  Effect.scoped(
    Layer.build(options.layer).pipe(
      Effect.flatMap((context) =>
        record({
          name: "blobStore",
          capabilities: ["put", "get", "dedupe", "size-limit", ...(options.persistent === true ? ["reopen"] : [])],
        }).pipe(Effect.andThen(effect), Effect.provideContext(context)),
      ),
    ),
  )

/** Registers the authoritative BlobStore conformance suite. @experimental */
export const blobStore = <E>(options: Options<E>): void => {
  describe("Generalist BlobStore conformance", () => {
    it.effect("puts and gets content by SHA-256", () =>
      provide(
        options,
        Effect.gen(function* () {
          const store = yield* BlobStore
          const ref = yield* store.put(input)
          expect(ref).toEqual({
            sha256: "fa2c8cc4f28176bbeed4b736df569a34c79cd3723e9ec42f9674b4d46ac6b8b8",
            mediaType: "image/png",
            bytes: 4,
            filename: "image.png",
          })
          expect(yield* store.get(ref.sha256)).toEqual({ ref, data: bytes })
        }),
      ),
    )

    it.effect("deduplicates identical content", () =>
      provide(
        options,
        Effect.gen(function* () {
          const store = yield* BlobStore
          const first = yield* store.put(input)
          const second = yield* store.put({ data: bytes, mediaType: "application/octet-stream", filename: "other.bin" })
          expect(second).toEqual(first)
        }),
      ),
    )

    it.effect("fails with BlobNotFound for missing content", () =>
      provide(
        options,
        Effect.gen(function* () {
          const store = yield* BlobStore
          const failure = yield* Effect.flip(store.get("0".repeat(64)))
          expect(failure).toBeInstanceOf(BlobNotFound)
        }),
      ),
    )

    it.effect("enforces the configured byte limit", () =>
      provide(
        options,
        Effect.gen(function* () {
          const store = yield* BlobStore
          const failure = yield* Effect.flip(
            store.put({ data: new Uint8Array(options.maxBytes + 1), mediaType: "application/pdf" }),
          )
          expect(failure._tag).toBe("generalist/blob-store/BlobTooLarge")
        }),
      ),
    )

    if (options.persistent === true) {
      it.effect("gets content after closing and reopening the layer", () =>
        Effect.gen(function* () {
          const ref = yield* provide(
            options,
            Effect.flatMap(BlobStore, (store) => store.put(input)),
          )
          const restored = yield* provide(
            options,
            Effect.flatMap(BlobStore, (store) => store.get(ref.sha256)),
          )
          expect(restored).toEqual({ ref, data: bytes })
        }),
      )
    }
  })
}
