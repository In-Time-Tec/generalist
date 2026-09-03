import { Context, Crypto, Effect, Encoding, FileSystem, Layer, Option, Path, Schema, Semaphore } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { Ref, Sha256, type Ref as RefValue } from "../media/ref.js"

const defaultMaxBytes = 100 * 1024 * 1024

/** Stored content and its canonical reference. @experimental */
export const Blob = Schema.Struct({
  ref: Ref,
  data: Schema.Uint8Array,
}).annotate({ identifier: "GeneralistBlob" })
/** Stored content and its canonical reference. @experimental */
export type Blob = typeof Blob.Type

/** Input accepted by `BlobStore.put`. @experimental */
export const Put = Schema.Struct({
  data: Schema.Uint8Array,
  mediaType: Schema.String,
  filename: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "GeneralistBlobPut" })
/** Input accepted by `BlobStore.put`. @experimental */
export type Put = typeof Put.Type

/** No content exists for the requested SHA-256 digest. @experimental */
export class BlobNotFound extends ActionableTaggedError<BlobNotFound>()("generalist/blob-store/BlobNotFound", {
  sha256: Schema.String,
  hint: errorHint("Upload the attachment before using its reference, or check the SHA-256 digest."),
}) {}

/** Content exceeds the configured byte limit. @experimental */
export class BlobTooLarge extends ActionableTaggedError<BlobTooLarge>()("generalist/blob-store/BlobTooLarge", {
  bytes: Schema.Int,
  maxBytes: Schema.Int,
  hint: errorHint("Reduce the attachment size or configure a larger BlobStore maxBytes limit."),
}) {}

/** A BlobStore backend operation failed. @experimental */
export class BlobStoreError extends ActionableTaggedError<BlobStoreError>()("generalist/blob-store/BlobStoreError", {
  operation: Schema.String,
  reason: Schema.String,
  hint: errorHint("Check the BlobStore backend configuration and availability, then retry."),
}) {}

/** Provider transport preference for resolving a reference. @experimental */
export interface ResolveOptions {
  readonly prefer: "bytes" | "url"
}

/** Provider-ready content and its canonical stored reference. @experimental */
export interface ResolvedBlob {
  readonly ref: RefValue
  readonly data: Uint8Array | URL
}

/** Content-addressed storage operations. @experimental */
export interface Service {
  readonly put: (input: Put) => Effect.Effect<RefValue, BlobTooLarge | BlobStoreError>
  readonly get: (sha256: string) => Effect.Effect<Blob, BlobNotFound | BlobStoreError>
  readonly resolve: (
    ref: RefValue,
    options: ResolveOptions,
  ) => Effect.Effect<ResolvedBlob, BlobNotFound | BlobStoreError>
}

/** Content-addressed BlobStore service. @experimental */
export class BlobStore extends Context.Service<BlobStore, Service>()("generalist/blob-store/BlobStore") {}

/** Shared BlobStore Layer options. @experimental */
export interface LayerOptions {
  readonly maxBytes?: number
}

const maxBytes = (options: LayerOptions): number => options.maxBytes ?? defaultMaxBytes
const error = (operation: string, cause: unknown): BlobStoreError =>
  BlobStoreError.make({ operation, reason: String(cause) })
const sha256 = (crypto: Crypto.Crypto, data: Uint8Array) =>
  crypto.digest("SHA-256", data).pipe(
    Effect.map((digest) => [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")),
    Effect.mapError((cause) => error("hash", cause)),
  )
const reference = (hash: string, input: Put): RefValue => ({
  sha256: hash,
  mediaType: input.mediaType,
  bytes: input.data.byteLength,
  ...(input.filename === undefined ? undefined : { filename: input.filename }),
})
const checkSize = (limit: number, bytes: number): Effect.Effect<void, BlobTooLarge> =>
  bytes <= limit ? Effect.void : Effect.fail(BlobTooLarge.make({ bytes, maxBytes: limit }))

/** Process-local content-addressed storage. @experimental */
export const layerMemory = (options: LayerOptions = {}): Layer.Layer<BlobStore, never, Crypto.Crypto> =>
  Layer.effect(
    BlobStore,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      const values = new Map<string, Blob>()
      const limit = maxBytes(options)
      return BlobStore.of({
        put: (input) =>
          Effect.gen(function* () {
            yield* checkSize(limit, input.data.byteLength)
            const hash = yield* sha256(crypto, input.data)
            const ref = reference(hash, input)
            if (!values.has(hash)) values.set(hash, { ref, data: input.data.slice() })
            return values.get(hash)?.ref ?? ref
          }),
        get: (hash) =>
          Effect.suspend(() => {
            const value = values.get(hash)
            return value === undefined
              ? Effect.fail(BlobNotFound.make({ sha256: hash }))
              : Effect.succeed({ ref: value.ref, data: value.data.slice() })
          }),
        resolve: (ref) =>
          Effect.map(
            values.has(ref.sha256)
              ? Effect.succeed(values.get(ref.sha256)!)
              : Effect.fail(BlobNotFound.make({ sha256: ref.sha256 })),
            (value) => ({ ref: value.ref, data: value.data.slice() }),
          ),
      })
    }),
  )

const StoredRef = Schema.fromJsonString(Ref)

/** Content-addressed filesystem Layer options. @experimental */
export interface FileSystemOptions extends LayerOptions {
  readonly dir: string
}

/** Content-addressed files with a schema-encoded metadata sidecar. @experimental */
export const layerFileSystem = (
  options: FileSystemOptions,
): Layer.Layer<BlobStore, BlobStoreError, Crypto.Crypto | FileSystem.FileSystem | Path.Path> =>
  Layer.effect(
    BlobStore,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const writes = yield* Semaphore.make(1)
      const limit = maxBytes(options)
      const paths = (hash: string) => ({
        data: path.join(options.dir, `${hash}.blob`),
        metadata: path.join(options.dir, `${hash}.json`),
      })
      yield* fileSystem
        .makeDirectory(options.dir, { recursive: true })
        .pipe(Effect.mapError((cause) => error("filesystem initialization", cause)))
      const read = (hash: string) =>
        Effect.gen(function* () {
          if (!Schema.is(Sha256)(hash)) return yield* BlobNotFound.make({ sha256: hash })
          const location = paths(hash)
          if (!(yield* fileSystem.exists(location.metadata))) return yield* BlobNotFound.make({ sha256: hash })
          const [encoded, data] = yield* Effect.all([
            fileSystem.readFileString(location.metadata),
            fileSystem.readFile(location.data),
          ])
          const ref = yield* Schema.decodeEffect(StoredRef)(encoded)
          return { ref, data }
        }).pipe(Effect.mapError((cause) => (Schema.is(BlobNotFound)(cause) ? cause : error("filesystem read", cause))))
      return BlobStore.of({
        put: (input) =>
          Effect.gen(function* () {
            yield* checkSize(limit, input.data.byteLength)
            const hash = yield* sha256(crypto, input.data)
            const ref = reference(hash, input)
            return yield* writes.withPermit(
              Effect.gen(function* () {
                const location = paths(hash)
                if (yield* fileSystem.exists(location.metadata)) return (yield* read(hash)).ref
                const encoded = yield* Schema.encodeEffect(StoredRef)(ref)
                yield* fileSystem.writeFile(location.data, input.data)
                yield* fileSystem.writeFileString(location.metadata, encoded)
                return ref
              }),
            )
          }).pipe(
            Effect.mapError((cause) => (Schema.is(BlobTooLarge)(cause) ? cause : error("filesystem write", cause))),
          ),
        get: read,
        resolve: (ref) => Effect.map(read(ref.sha256), (blob) => ({ ref: blob.ref, data: blob.data })),
      })
    }),
  )

const SqlRow = Schema.Struct({
  sha256: Schema.String,
  media_type: Schema.String,
  bytes: Schema.Union([Schema.Int, Schema.String]),
  filename: Schema.NullOr(Schema.String),
  data_base64: Schema.String,
})

/** Portable SQL storage over the runtime SqlClient seam. @experimental */
export const layerSql = (
  options: LayerOptions = {},
): Layer.Layer<BlobStore, BlobStoreError, Crypto.Crypto | SqlClient.SqlClient> =>
  Layer.effect(
    BlobStore,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      const sql = yield* SqlClient.SqlClient
      const writes = yield* Semaphore.make(1)
      const limit = maxBytes(options)
      yield* sql`
        CREATE TABLE IF NOT EXISTS generalist_blobs (
          sha256 VARCHAR(64) PRIMARY KEY,
          media_type VARCHAR(255) NOT NULL,
          bytes BIGINT NOT NULL,
          filename TEXT,
          data_base64 TEXT NOT NULL
        )
      `.pipe(Effect.mapError((cause) => error("sql initialization", cause)))
      const read = (hash: string) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT sha256, media_type, bytes, filename, data_base64
            FROM generalist_blobs WHERE sha256 = ${hash}
          `
          const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(SqlRow))(rows)
          const row = decoded[0]
          if (row === undefined) return yield* BlobNotFound.make({ sha256: hash })
          const data = yield* Schema.decodeEffect(Schema.Uint8ArrayFromBase64)(row.data_base64)
          return {
            ref: {
              sha256: row.sha256,
              mediaType: row.media_type,
              bytes: Number(row.bytes),
              ...(row.filename === null ? undefined : { filename: row.filename }),
            },
            data,
          }
        }).pipe(Effect.mapError((cause) => (Schema.is(BlobNotFound)(cause) ? cause : error("sql read", cause))))
      return BlobStore.of({
        put: (input) =>
          Effect.gen(function* () {
            yield* checkSize(limit, input.data.byteLength)
            const hash = yield* sha256(crypto, input.data)
            const ref = reference(hash, input)
            return yield* writes.withPermit(
              Effect.gen(function* () {
                const existing = yield* sql<{ readonly sha256: string }>`
                  SELECT sha256 FROM generalist_blobs WHERE sha256 = ${hash}
                `
                if (existing.length > 0) return (yield* read(hash)).ref
                yield* sql`
                  INSERT INTO generalist_blobs (sha256, media_type, bytes, filename, data_base64)
                  VALUES (${hash}, ${input.mediaType}, ${input.data.byteLength}, ${input.filename ?? null},
                    ${Encoding.encodeBase64(input.data)})
                `
                return ref
              }),
            )
          }).pipe(Effect.mapError((cause) => (Schema.is(BlobTooLarge)(cause) ? cause : error("sql write", cause)))),
        get: read,
        resolve: (ref) => Effect.map(read(ref.sha256), (blob) => ({ ref: blob.ref, data: blob.data })),
      })
    }),
  )

/** One object exchanged with an injected S3-compatible client. @experimental */
export interface S3Object {
  readonly data: Uint8Array
  readonly mediaType: string
  readonly filename?: string
  readonly url?: URL
}

/** Minimal S3-compatible client needed by BlobStore. @experimental */
export interface S3Client<E = unknown> {
  readonly head: (bucket: string, key: string) => Effect.Effect<boolean, E>
  readonly put: (bucket: string, key: string, object: S3Object) => Effect.Effect<void, E>
  readonly get: (bucket: string, key: string) => Effect.Effect<Option.Option<S3Object>, E>
}

/** S3-compatible BlobStore Layer options. @experimental */
export interface S3Options<E = unknown> extends LayerOptions {
  readonly bucket: string
  readonly client: S3Client<E>
}

/** S3-compatible storage through an injected client; no AWS SDK is required. @experimental */
export const layerS3 = <E>(options: S3Options<E>): Layer.Layer<BlobStore, never, Crypto.Crypto> =>
  Layer.effect(
    BlobStore,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      const writes = yield* Semaphore.make(1)
      const limit = maxBytes(options)
      const key = (hash: string) => `sha256/${hash}`
      const read = (hash: string) =>
        options.client.get(options.bucket, key(hash)).pipe(
          Effect.mapError((cause) => error("s3 get", cause)),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(BlobNotFound.make({ sha256: hash })),
              onSome: (object) =>
                Effect.succeed({
                  ref: reference(hash, {
                    data: object.data,
                    mediaType: object.mediaType,
                    ...(object.filename === undefined ? undefined : { filename: object.filename }),
                  }),
                  object,
                }),
            }),
          ),
        )
      return BlobStore.of({
        put: (input) =>
          Effect.gen(function* () {
            yield* checkSize(limit, input.data.byteLength)
            const hash = yield* sha256(crypto, input.data)
            return yield* writes.withPermit(
              Effect.gen(function* () {
                const exists = yield* options.client
                  .head(options.bucket, key(hash))
                  .pipe(Effect.mapError((cause) => error("s3 head", cause)))
                if (exists) {
                  const stored = yield* read(hash).pipe(
                    Effect.mapError((cause) =>
                      Schema.is(BlobNotFound)(cause) ? error("s3 deduplication", cause) : cause,
                    ),
                  )
                  return stored.ref
                }
                yield* options.client
                  .put(options.bucket, key(hash), input)
                  .pipe(Effect.mapError((cause) => error("s3 put", cause)))
                return reference(hash, input)
              }),
            )
          }),
        get: (hash) => Effect.map(read(hash), ({ object, ref }) => ({ ref, data: object.data })),
        resolve: (ref, resolveOptions) =>
          Effect.map(read(ref.sha256), ({ object, ref: storedRef }) => ({
            ref: storedRef,
            data: resolveOptions.prefer === "url" && object.url !== undefined ? object.url : object.data,
          })),
      })
    }),
  )
