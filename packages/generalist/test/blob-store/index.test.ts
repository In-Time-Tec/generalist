/* oxlint-disable effecttsgo/strict-effect-provide -- This adapter test is the Layer composition root. */
import { BunCrypto } from "@effect/platform-bun"
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-bun/SqliteClient"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Option, Path, PlatformError, Schema } from "effect"
import {
  BlobStore,
  layerFileSystem,
  layerMemory,
  layerS3,
  layerSql,
  type S3Client,
  type S3Object,
} from "../../src/blob-store/index.js"
import { Testing } from "../../src/testing/index.js"
import fixtureData from "./s3.fixture.json" with { type: "json" }

const maxBytes = 4
const withCrypto = <A, E, R>(layer: Layer.Layer<A, E, R | import("effect/Crypto").Crypto>) =>
  layer.pipe(Layer.provide(BunCrypto.layer))

Testing.blobStore({ layer: withCrypto(layerMemory({ maxBytes })), maxBytes })

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "BlobStoreTest",
    method,
    pathOrDescriptor: path,
    description: "not found",
  })

const files = new Map<string, Uint8Array>()
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const fileSystem = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.makeNoop({
    exists: (path) => Effect.succeed(files.has(path)),
    makeDirectory: () => Effect.void,
    readFile: (path) => {
      const value = files.get(path)
      return value === undefined ? Effect.fail(notFound("readFile", path)) : Effect.succeed(value.slice())
    },
    readFileString: (path) => {
      const value = files.get(path)
      return value === undefined ? Effect.fail(notFound("readFileString", path)) : Effect.succeed(decoder.decode(value))
    },
    writeFile: (path, data) => Effect.sync(() => files.set(path, data.slice())).pipe(Effect.asVoid),
    writeFileString: (path, data) => Effect.sync(() => files.set(path, encoder.encode(data))).pipe(Effect.asVoid),
  }),
)
const fileLayer = layerFileSystem({ dir: "/blobs", maxBytes }).pipe(
  Layer.provide(Layer.mergeAll(BunCrypto.layer, fileSystem, Path.layer)),
)
Testing.blobStore({ layer: fileLayer, maxBytes, persistent: true })

const sqliteFilename = `/tmp/generalist-blob-store-${process.pid}.sqlite`
const sqlLayer = layerSql({ maxBytes }).pipe(
  Layer.provide(Layer.merge(BunCrypto.layer, sqliteClientLayer({ filename: sqliteFilename }))),
)
Testing.blobStore({ layer: sqlLayer, maxBytes, persistent: true })

const fixture = Schema.decodeSync(
  Schema.Struct({
    bucket: Schema.String,
    keyPrefix: Schema.String,
    publicBaseUrl: Schema.String,
    body: Schema.String,
    mediaType: Schema.String,
    sha256: Schema.String,
  }),
)(fixtureData)

const makeS3 = () => {
  const objects = new Map<string, S3Object>()
  let puts = 0
  const client: S3Client = {
    head: (_bucket, key) => Effect.succeed(objects.has(key)),
    put: (_bucket, key, object) =>
      Effect.sync(() => {
        puts += 1
        objects.set(key, { ...object, data: object.data.slice(), url: new URL(`${fixture.publicBaseUrl}${key}`) })
      }),
    get: (_bucket, key) => Effect.succeed(Option.fromUndefinedOr(objects.get(key))),
  }
  return { client, puts: () => puts }
}

const s3Conformance = makeS3()
Testing.blobStore({
  layer: layerS3({ bucket: fixture.bucket, client: s3Conformance.client, maxBytes }).pipe(
    Layer.provide(BunCrypto.layer),
  ),
  maxBytes,
  persistent: true,
})

describe("S3 BlobStore adapter", () => {
  it.effect("uses the recorded key contract, deduplicates, and resolves provider URLs", () => {
    const fake = makeS3()
    const layer = layerS3({ bucket: fixture.bucket, client: fake.client, maxBytes }).pipe(
      Layer.provide(BunCrypto.layer),
    )
    return Effect.gen(function* () {
      const store = yield* BlobStore
      const input = { data: new TextEncoder().encode(fixture.body), mediaType: fixture.mediaType }
      const refs = yield* Effect.all([store.put(input), store.put(input)], { concurrency: "unbounded" })
      const ref = refs[0]
      expect(refs[1]).toEqual(ref)
      expect(fake.puts()).toBe(1)
      expect(ref.sha256).toBe(fixture.sha256)
      expect((yield* store.resolve(ref, { prefer: "url" })).data).toEqual(
        new URL(`${fixture.publicBaseUrl}${fixture.keyPrefix}${ref.sha256}`),
      )
      expect((yield* store.get(ref.sha256)).data).toEqual(input.data)
    }).pipe(Effect.provide(layer))
  })
})
