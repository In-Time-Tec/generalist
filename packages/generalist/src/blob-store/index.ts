import { Context, Crypto, Effect, Encoding, Layer, Result, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { ObjectStore } from "../durability/object-store.js"
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

/** Object access, encoding, or content integrity failed. @experimental */
export class BlobStoreError extends ActionableTaggedError<BlobStoreError>()("generalist/blob-store/BlobStoreError", {
  operation: Schema.String,
  reason: Schema.String,
  hint: errorHint(
    "Check object storage configuration and availability; investigate integrity failures without overwriting content.",
  ),
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

/** Explicit journal-compatible tenant namespace and maximum payload size for uploads and reads. @experimental */
export interface LayerOptions {
  readonly environment: string
  readonly tenant: string
  readonly maxBytes?: number
}

const Options = Schema.Struct({
  environment: Schema.String.check(Schema.isNonEmpty()),
  tenant: Schema.String.check(Schema.isNonEmpty()),
  maxBytes: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
})
const StoredRef = Schema.fromJsonString(Ref)
const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })
const magic = 0x474c4231 // GLB1: versioned reference JSON followed by unencoded payload bytes.
const headerBytes = 8
// Bound reference JSON independently so metadata cannot consume an unlimited read budget.
const maxMetadataBytes = 64 * 1024
const error = (operation: string, cause: unknown): BlobStoreError =>
  BlobStoreError.make({ operation, reason: String(cause) })
const sha256 = (crypto: Crypto.Crypto, data: Uint8Array) =>
  crypto.digest("SHA-256", data).pipe(
    Effect.map(Encoding.encodeHex),
    Effect.mapError((cause) => error("hash", cause)),
  )

// One conditional create publishes both bytes and metadata. The winning envelope's
// reference is canonical, so a different filename or media type never mutates a digest key.
const encode = (ref: RefValue, data: Uint8Array): Effect.Effect<Uint8Array, BlobStoreError> =>
  Schema.encodeEffect(StoredRef)(ref).pipe(
    Effect.mapError((cause) => error("encode", cause)),
    Effect.flatMap((json) =>
      Effect.try({
        try: () => {
          if (json.length > maxMetadataBytes) throw new Error(`Blob reference exceeds ${maxMetadataBytes} bytes`)
          const metadata = encoder.encode(json)
          if (metadata.byteLength > maxMetadataBytes)
            throw new Error(`Blob reference exceeds ${maxMetadataBytes} bytes`)
          const bytes = new Uint8Array(headerBytes + metadata.byteLength + data.byteLength)
          const header = new DataView(bytes.buffer)
          header.setUint32(0, magic)
          header.setUint32(4, metadata.byteLength)
          bytes.set(metadata, headerBytes)
          bytes.set(data, headerBytes + metadata.byteLength)
          return bytes
        },
        catch: (cause) => error("encode", cause),
      }),
    ),
  )

const decode = (
  crypto: Crypto.Crypto,
  hash: string,
  bytes: Uint8Array,
  maxBytes: number,
): Effect.Effect<Blob, BlobStoreError> =>
  Effect.gen(function* () {
    const envelope = yield* Effect.try({
      try: () => {
        if (bytes.byteLength < headerBytes) throw new Error("Truncated blob envelope")
        const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        if (header.getUint32(0) !== magic) throw new Error("Unsupported blob envelope version")
        const metadataBytes = header.getUint32(4)
        if (metadataBytes > maxMetadataBytes) throw new Error(`Blob reference exceeds ${maxMetadataBytes} bytes`)
        const offset = headerBytes + metadataBytes
        if (offset > bytes.byteLength) throw new Error("Truncated blob reference")
        if (bytes.byteLength - offset > maxBytes) throw new Error(`Stored payload exceeds ${maxBytes} bytes`)
        return {
          json: decoder.decode(bytes.subarray(headerBytes, offset)),
          data: bytes.subarray(offset),
        }
      },
      catch: (cause) => error("integrity", cause),
    })
    const ref = yield* Schema.decodeEffect(StoredRef)(envelope.json).pipe(
      Effect.mapError((cause) => error("integrity", cause)),
    )
    if (ref.sha256 !== hash || ref.bytes !== envelope.data.byteLength) {
      return yield* error("integrity", "Stored reference does not describe the requested payload")
    }
    if ((yield* sha256(crypto, envelope.data)) !== hash) {
      return yield* error("integrity", "Stored payload SHA-256 does not match its content address")
    }
    return { ref, data: envelope.data }
  })

/** Immutable object-backed content storage; requires no maintenance credentials. @experimental */
export const layer = (options: LayerOptions): Layer.Layer<BlobStore, BlobStoreError, Crypto.Crypto | ObjectStore> =>
  Layer.effect(
    BlobStore,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      const objects = yield* ObjectStore
      const settings = yield* Schema.decodeEffect(Options)(options).pipe(
        Effect.mapError((cause) => error("initialize", cause)),
      )
      const limit = settings.maxBytes ?? defaultMaxBytes
      const maxObjectBytes = limit + headerBytes + maxMetadataBytes
      if (!Number.isSafeInteger(maxObjectBytes)) {
        return yield* error("initialize", "maxBytes plus blob envelope overhead must be a safe integer")
      }
      const prefix = yield* Effect.try({
        try: () =>
          `environments/${encodeURIComponent(settings.environment).replaceAll(".", "%2E")}/v1/tenants/${encodeURIComponent(settings.tenant).replaceAll(".", "%2E")}/blobs/sha256/`,
        catch: (cause) => error("initialize", cause),
      })
      const key = (hash: string) => `${prefix}${hash.slice(0, 2)}/${hash}`
      const read = (hash: string): Effect.Effect<Blob, BlobNotFound | BlobStoreError> =>
        Effect.gen(function* () {
          if (!Schema.is(Sha256)(hash)) return yield* BlobNotFound.make({ sha256: hash })
          const object = yield* objects
            .read(key(hash), { maxBytes: maxObjectBytes })
            .pipe(Effect.mapError((cause) => error("read", cause)))
          if (object === undefined) return yield* BlobNotFound.make({ sha256: hash })
          return yield* decode(crypto, hash, object.bytes, limit)
        })
      return BlobStore.of({
        put: (input) =>
          Effect.gen(function* () {
            if (input.data.byteLength > limit) {
              return yield* BlobTooLarge.make({ bytes: input.data.byteLength, maxBytes: limit })
            }
            // Snapshot caller-owned bytes before the asynchronous hash and upload.
            const data = input.data.slice()
            const hash = yield* sha256(crypto, data)
            const ref: RefValue = {
              sha256: hash,
              mediaType: input.mediaType,
              bytes: data.byteLength,
              ...(input.filename === undefined ? undefined : { filename: input.filename }),
            }
            const bytes = yield* encode(ref, data)
            const result = yield* Effect.result(objects.create(key(hash), bytes))
            if (Result.isSuccess(result) && result.success === "created") return ref
            // A timeout may have published, and a conflict may carry other metadata.
            // Only a verified immutable payload permits publishing a reference.
            const stored = yield* read(hash).pipe(
              Effect.catchTag("generalist/blob-store/BlobNotFound", () =>
                Effect.fail(
                  Result.isFailure(result)
                    ? error("create", result.failure)
                    : error("integrity", "Conditional create conflicted but the object is absent"),
                ),
              ),
            )
            if (
              stored.data.byteLength !== data.byteLength ||
              !stored.data.every((value, index) => value === data[index])
            ) {
              return yield* error("integrity", "Existing immutable payload differs from the uploaded bytes")
            }
            return stored.ref
          }),
        get: read,
        // ObjectStore deliberately has no public/signed URL capability. A URL
        // preference falls back to verified bytes, as for any unavailable URL.
        resolve: (ref) => Effect.map(read(ref.sha256), (blob) => ({ ref: blob.ref, data: blob.data })),
      })
    }),
  )
