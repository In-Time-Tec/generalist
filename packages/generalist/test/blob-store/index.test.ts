/* oxlint-disable effecttsgo/strict-effect-provide -- This adapter test is the Layer composition root. */
import { BunCrypto, BunServices } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, FileSystem, Layer } from "effect"
import { BlobNotFound, BlobStore, BlobStoreError, layer, type LayerOptions } from "../../src/blob-store/index.js"
import { layer as fsLayer } from "../../src/durability/fs.js"
import { ObjectStore } from "../../src/durability/object-store.js"
import { blobStore } from "../../src/testing/blob-store.js"
import { make, type Client } from "../../src/testing/durability/index.js"

const maxBytes = 4
const options = { environment: "test/environment", tenant: "tenant/one", maxBytes }
const prefix = "environments/test%2Fenvironment/v1/tenants/tenant%2Fone/blobs/sha256/"
const input = { data: new TextEncoder().encode("blob"), mediaType: "image/png", filename: "image.png" }
const digest = "fa2c8cc4f28176bbeed4b736df569a34c79cd3723e9ec42f9674b4d46ac6b8b8"
const key = `${prefix}fa/${digest}`
const simulatorLayer = Layer.effect(ObjectStore, make().pipe(Effect.map((simulator) => simulator.store)))

blobStore({
  layer: layer(options).pipe(Layer.provide(Layer.merge(BunCrypto.layer, simulatorLayer))),
  maxBytes,
})

const storeFor = (client: Client, settings: Partial<LayerOptions> = {}) =>
  BlobStore.pipe(
    Effect.provide(
      layer({ ...options, ...settings }).pipe(
        Layer.provide(Layer.merge(BunCrypto.layer, Layer.succeed(ObjectStore, client.store))),
      ),
    ),
  )

describe("Object-backed BlobStore", () => {
  it.effect("publishes one canonical reference when independent writers race with different metadata", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const first = yield* storeFor(simulator)
      const second = yield* storeFor(yield* simulator.connect)
      const pause = yield* simulator.faults.pauseNextCreate(key)
      const pending = yield* first.put(input).pipe(Effect.forkChild({ startImmediately: true }))
      yield* pause.entered
      expect(yield* Effect.flip(second.get(digest))).toBeInstanceOf(BlobNotFound)
      const winner = yield* second.put({ ...input, mediaType: "application/octet-stream", filename: "winner.bin" })
      yield* pause.release
      expect(yield* Fiber.join(pending)).toEqual(winner)
      expect(winner).toEqual({
        sha256: digest,
        bytes: 4,
        mediaType: "application/octet-stream",
        filename: "winner.bin",
      })
      const reopened = yield* storeFor(yield* simulator.connect)
      expect(yield* reopened.get(digest)).toEqual({ ref: winner, data: input.data })
      expect(yield* reopened.put(input)).toEqual(winner)
      expect((yield* simulator.store.list(prefix)).keys).toEqual([key])
    }),
  )

  it.effect("reconciles a lost upload acknowledgement through a verified read", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const store = yield* storeFor(simulator)
      yield* simulator.faults.failNextCreate({ key, phase: "after" })
      const ref = yield* store.put(input)
      const reopened = yield* storeFor(yield* simulator.connect)
      expect(yield* reopened.get(ref.sha256)).toEqual({ ref, data: input.data })
      expect(yield* reopened.resolve(ref, { prefer: "url" })).toEqual({ ref, data: input.data })
    }),
  )

  it.effect("fails without publishing a reference when the uncertain upload cannot be read", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const store = yield* storeFor(simulator)
      yield* simulator.faults.failNextCreate({ key, phase: "after" })
      yield* simulator.faults.failNextRead({ key })
      expect(yield* Effect.flip(store.put(input))).toBeInstanceOf(BlobStoreError)
      const reopened = yield* storeFor(yield* simulator.connect)
      const ref = yield* reopened.put(input)
      expect(yield* reopened.get(ref.sha256)).toEqual({ ref, data: input.data })
    }),
  )

  it.effect("distinguishes an upload rejected before publication from a committed object", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const store = yield* storeFor(simulator)
      yield* simulator.faults.failNextCreate({ key, phase: "before", reason: "authentication" })
      expect(yield* Effect.flip(store.put(input))).toBeInstanceOf(BlobStoreError)
      expect(yield* Effect.flip(store.get(digest))).toBeInstanceOf(BlobNotFound)
      const ref = yield* store.put(input)
      expect(yield* store.get(digest)).toEqual({ ref, data: input.data })
    }),
  )

  it.effect("rejects corrupted payloads on get, resolve, and deduplication without overwriting them", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const store = yield* storeFor(simulator)
      const ref = yield* store.put(input)
      const object = (yield* simulator.store.read(key, { maxBytes: 1024 }))!
      const corrupted = object.bytes.slice()
      const finalIndex = corrupted.length - 1
      corrupted.set([corrupted[finalIndex]! ^ 0xff], finalIndex)
      yield* simulator.faults.corrupt(key, corrupted)
      const failures = yield* Effect.all([
        Effect.flip(store.get(digest)),
        Effect.flip(store.resolve(ref, { prefer: "bytes" })),
        Effect.flip(store.put(input)),
      ])
      for (const failure of failures) {
        expect(failure).toBeInstanceOf(BlobStoreError)
        expect(failure).toMatchObject({ operation: "integrity" })
      }
      expect((yield* simulator.store.read(key, { maxBytes: corrupted.byteLength }))?.bytes).toEqual(corrupted)
    }),
  )

  it.effect("rejects a valid envelope stored at the wrong digest address", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const store = yield* storeFor(simulator)
      yield* store.put(input)
      const original = (yield* simulator.store.read(key, { maxBytes: 1024 }))!
      const wrongDigest = "0".repeat(64)
      yield* simulator.store.create(`${prefix}00/${wrongDigest}`, original.bytes)
      const failure = yield* Effect.flip(store.get(wrongDigest))
      expect(failure).toBeInstanceOf(BlobStoreError)
      expect(failure).toMatchObject({ operation: "integrity" })
    }),
  )

  it.effect("keeps environment and tenant identities separate even when they contain encoded separators", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const store = yield* storeFor(simulator)
      const ref = yield* store.put(input)
      const otherTenant = yield* storeFor(yield* simulator.connect, { tenant: "tenant%2Fone" })
      const otherEnvironment = yield* storeFor(yield* simulator.connect, { environment: "test%2Fenvironment" })
      expect(yield* Effect.flip(otherTenant.get(ref.sha256))).toBeInstanceOf(BlobNotFound)
      expect(yield* Effect.flip(otherEnvironment.get(ref.sha256))).toBeInstanceOf(BlobNotFound)
      const otherRef = yield* otherTenant.put({ ...input, filename: "other-tenant.png" })
      expect(otherRef.filename).toBe("other-tenant.png")
      expect((yield* store.get(ref.sha256)).ref).toEqual(ref)
    }),
  )

  it.effect("keeps case-variant tenant names isolated over the local-directory transport", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-blob-case-" })
      const storeForTenant = (tenant: string) =>
        BlobStore.pipe(Effect.provide(layer({ ...options, tenant }).pipe(Layer.provide(fsLayer({ dir })))))
      const owner = yield* storeForTenant("Team")
      const ref = yield* owner.put(input)
      expect(yield* Effect.flip((yield* storeForTenant("team")).get(ref.sha256))).toBeInstanceOf(BlobNotFound)
      expect(yield* Effect.flip((yield* storeForTenant("unrelated")).get(ref.sha256))).toBeInstanceOf(BlobNotFound)
    }).pipe(Effect.provide(BunServices.layer)),
  )

  it.effect("stores a snapshot of caller bytes rather than a mutable upload buffer", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const store = yield* storeFor(simulator)
      const data = input.data.slice()
      const pause = yield* simulator.faults.pauseNextCreate(key)
      const pending = yield* store.put({ ...input, data }).pipe(Effect.forkChild({ startImmediately: true }))
      yield* pause.entered
      data.fill(0)
      yield* pause.release
      const ref = yield* Fiber.join(pending)
      expect(ref.sha256).toBe(digest)
      const blob = yield* store.get(ref.sha256)
      expect(blob.data).toEqual(input.data)
      blob.data.fill(0)
      expect((yield* store.get(ref.sha256)).data).toEqual(input.data)
    }),
  )

  it.effect("round-trips large binary content and enforces the exact configured byte boundary", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const data = new Uint8Array(1024 * 1024 + 17)
      for (let index = 0; index < data.length; index += 1) data[index] = index % 256
      const store = yield* storeFor(simulator, { maxBytes: data.byteLength })
      const ref = yield* store.put({ data, mediaType: "application/octet-stream" })
      const reopened = yield* storeFor(yield* simulator.connect, { maxBytes: data.byteLength })
      expect((yield* reopened.get(ref.sha256)).data).toEqual(data)
      const smaller = yield* storeFor(yield* simulator.connect, { maxBytes: data.byteLength - 1 })
      expect(yield* Effect.flip(smaller.get(ref.sha256))).toMatchObject({
        _tag: "generalist/blob-store/BlobStoreError",
        operation: "integrity",
      })
      const tooLarge = yield* Effect.flip(
        store.put({ data: new Uint8Array(data.byteLength + 1), mediaType: "application/octet-stream" }),
      )
      expect(tooLarge).toMatchObject({
        _tag: "generalist/blob-store/BlobTooLarge",
        bytes: data.byteLength + 1,
        maxBytes: data.byteLength,
      })
    }),
  )

  it.effect("stores empty content at its SHA-256 address with a zero-byte limit", () =>
    Effect.gen(function* () {
      const simulator = yield* make()
      const store = yield* storeFor(simulator, { maxBytes: 0 })
      const data = new Uint8Array()
      const ref = yield* store.put({ data, mediaType: "application/octet-stream" })
      expect(ref.sha256).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
      const reopened = yield* storeFor(yield* simulator.connect, { maxBytes: 0 })
      expect(yield* reopened.get(ref.sha256)).toEqual({ ref, data })
    }),
  )
})
