import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type DeleteObjectCommandInput,
  type DeleteObjectCommandOutput,
  type GetObjectCommandInput,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandInput,
  type ListObjectsV2CommandOutput,
  type PutObjectCommandInput,
  type PutObjectCommandOutput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3"
import { FetchHttpHandler } from "@smithy/fetch-http-handler"
import { Effect, Layer } from "effect"
import {
  ObjectMaintenance,
  ObjectStore,
  ObjectStoreFailure,
  cancelReadBody,
  readObjectBytes,
  validateReadOptions,
  type Capabilities,
  type ObjectPage,
  type ReadOptions,
  type Service,
  type StoredObject,
} from "./object-store.js"

/** Advanced clients must preserve abort signals and must not retry or follow redirects. @experimental */
export interface ClientGuarantees {
  readonly singleAttempt: boolean
  readonly noRedirects: boolean
}

/** Injectable signed client; conditional writes have no unconditional counterpart. @experimental */
export interface Client {
  readonly guarantees: ClientGuarantees
  readonly getObject: (input: GetObjectCommandInput, signal: AbortSignal) => Promise<GetObjectCommandOutput>
  readonly createObject: (
    input: PutObjectCommandInput & { readonly IfNoneMatch: "*" },
    signal: AbortSignal,
  ) => Promise<PutObjectCommandOutput>
  readonly listObjects: (input: ListObjectsV2CommandInput, signal: AbortSignal) => Promise<ListObjectsV2CommandOutput>
}

/** Deletion is supplied only to a separately constructed maintenance service. @experimental */
export interface MaintenanceClient {
  readonly guarantees: ClientGuarantees
  readonly deleteObject: (input: DeleteObjectCommandInput, signal: AbortSignal) => Promise<DeleteObjectCommandOutput>
}

/** S3 general-purpose bucket connection; custom providers must attest the durability contract. @experimental */
export interface ConnectionOptions {
  readonly bucket: string
  readonly region: string
  /** A direct object API endpoint, never a public cached domain. Use HTTPS outside local development. */
  readonly endpoint?: string
  readonly forcePathStyle?: boolean
  /** Static credentials (including sessionToken) or a refreshing AWS SDK credential provider. */
  readonly credentials?: S3ClientConfig["credentials"]
  /** Required for custom endpoints and injected clients; an assertion, not a conformance probe. */
  readonly capabilities?: { readonly [K in keyof Capabilities]: boolean }
  /** Deadline for signing, request, and complete response consumption. Defaults to 30 seconds. */
  readonly requestTimeoutMs?: number
}

/** Default SDK signing or an explicitly qualified advanced client. @experimental */
export interface Options extends ConnectionOptions {
  readonly client?: Client
}

/** Maintenance credentials can be different from ordinary runtime credentials. @experimental */
export interface MaintenanceOptions extends ConnectionOptions {
  readonly client?: MaintenanceClient
}

const capabilities: Capabilities = {
  conditionalCreate: true,
  strongReadAfterWrite: true,
  consistentListing: true,
}

const failure = (operation: string, key: string, reason: ObjectStoreFailure["reason"], message: string) =>
  new ObjectStoreFailure({ operation, key, reason, message })

const errorDetails = (error: unknown) => {
  if (typeof error !== "object" || error === null) return { name: undefined, status: undefined }
  const value = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } }
  return { name: value.name === undefined || value.name === "Error" ? value.code : value.name, status: value.$metadata?.httpStatusCode }
}

const classify = (operation: string, key: string, error: unknown): ObjectStoreFailure => {
  if (error instanceof ObjectStoreFailure) return error
  const { name, status } = errorDetails(error)
  const reason =
    status === 401 ||
    status === 403 ||
    name === "CredentialsProviderError" ||
    name === "TokenProviderError" ||
    name === "ExpiredToken" ||
    name === "InvalidAccessKeyId" ||
    name === "SignatureDoesNotMatch"
      ? "authentication"
      : status === 429 || name === "SlowDown" || name === "Throttling" || name === "ThrottlingException"
        ? "rate-limit"
        : status === 408 ||
            status === 504 ||
            name === "TimeoutError" ||
            name === "RequestTimeout" ||
            name === "AbortError" ||
            name === "ETIMEDOUT"
          ? "timeout"
          : status !== undefined && status >= 300 && status < 500 && status !== 409
            ? "invalid-response"
            : "unavailable"
  // Do not expose SDK messages: providers can echo signed URLs or credential material.
  return failure(operation, key, reason, `S3 ${operation} failed (${reason}); writes may require reconciliation.`)
}

const validate = (options: ConnectionOptions, client: { readonly guarantees: ClientGuarantees } | undefined) => {
  const reject = (message: string): never => {
    throw failure("initialize", options.bucket, "invalid-response", message)
  }
  // Restrict this transport to ordinary buckets, avoiding ARN/access-point/directory-bucket endpoint rewriting.
  if (
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(options.bucket) ||
    options.bucket.includes("..") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(options.bucket) ||
    options.bucket.endsWith("--x-s3") ||
    options.bucket.endsWith("-s3alias") ||
    options.bucket.endsWith("--ol-s3") ||
    options.bucket.endsWith("--table-s3")
  ) reject("S3 durability requires a general-purpose bucket name, not an ARN or an endpoint alias.")
  if (options.region.trim().length === 0) reject("An explicit S3 region is required.")
  const timeout = options.requestTimeoutMs ?? 30_000
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
    reject("S3 requestTimeoutMs must be a positive integer within the timer range.")
  }
  if (options.endpoint !== undefined) {
    let endpoint: URL
    try {
      endpoint = new URL(options.endpoint)
    } catch {
      return reject("S3 endpoints must be absolute HTTP(S) URLs.")
    }
    if (
      (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") ||
      endpoint.username !== "" || endpoint.password !== "" || endpoint.search !== "" || endpoint.hash !== ""
    ) reject("S3 endpoints must be HTTP(S) URLs without embedded credentials, query strings, or fragments.")
  }
  const asserted = options.capabilities
  if (
    (options.endpoint !== undefined || client !== undefined || asserted !== undefined) &&
    (asserted?.conditionalCreate !== true || asserted.strongReadAfterWrite !== true || asserted.consistentListing !== true)
  ) reject("The provider must guarantee atomic conditional create, strong reads, and consistent listing.")
  if (client !== undefined && (client.guarantees.singleAttempt !== true || client.guarantees.noRedirects !== true)) {
    reject("Injected S3 clients must disable automatic retries and all redirects.")
  }
}

const sdkClient = (options: ConnectionOptions): Client & MaintenanceClient => {
  const sdk = new S3Client({
    region: options.region,
    ignoreConfiguredEndpointUrls: true,
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
    maxAttempts: 1,
    followRegionRedirects: false,
    useArnRegion: false,
    disableS3ExpressSessionAuth: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: new FetchHttpHandler({
      cache: "no-store",
      credentials: "omit",
      requestInit: () => ({ redirect: "error" }),
    }),
  })
  return {
    guarantees: { singleAttempt: true, noRedirects: true },
    getObject: (input, signal) => sdk.send(new GetObjectCommand(input), { abortSignal: signal }),
    createObject: (input, signal) => sdk.send(new PutObjectCommand(input), { abortSignal: signal }),
    listObjects: (input, signal) => sdk.send(new ListObjectsV2Command(input), { abortSignal: signal }),
    deleteObject: (input, signal) => sdk.send(new DeleteObjectCommand(input), { abortSignal: signal }),
  }
}

const request = <A>(
  options: ConnectionOptions,
  operation: string,
  key: string,
  execute: (signal: AbortSignal) => Promise<A>,
): Effect.Effect<A, ObjectStoreFailure> =>
  Effect.tryPromise({
    try: async (interruption) => {
      interruption.throwIfAborted()
      const controller = new AbortController()
      const interrupt = () => controller.abort(interruption.reason)
      interruption.addEventListener("abort", interrupt, { once: true })
      const timeout = setTimeout(
        () => controller.abort(new DOMException("S3 request deadline exceeded", "TimeoutError")),
        options.requestTimeoutMs ?? 30_000,
      )
      let rejectAbort!: (reason: unknown) => void
      const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
      const onAbort = () => rejectAbort(controller.signal.reason)
      controller.signal.addEventListener("abort", onAbort, { once: true })
      try {
        return await Promise.race([execute(controller.signal), aborted])
      } finally {
        clearTimeout(timeout)
        interruption.removeEventListener("abort", interrupt)
        controller.signal.removeEventListener("abort", onAbort)
        controller.abort()
      }
    },
    catch: (error) => classify(operation, key, error),
  })

const checkKey = (operation: string, key: string) => {
  // Fetch's URL parser normalizes dot-only segments even when percent-encoded. Never address a different object.
  if (key.length === 0 || /(?:^|\/)\.{1,2}(?:\/|$)/.test(key)) {
    throw failure(operation, key, "invalid-response", "Object keys must be nonempty and contain no dot-only path segments.")
  }
}

/**
 * Creates the signed transport. Every request is single-attempt: reconcile uncertain creates by reading the key.
 * Custom endpoints require documented provider guarantees and independent conformance qualification.
 * Uses single PUTs (no multipart); ETags remain opaque. Dot-only key segments are rejected, not normalized.
 * @experimental
 */
export const make = (options: Options): Effect.Effect<Service, ObjectStoreFailure> =>
  Effect.try({
    try: () => {
      validate(options, options.client)
      const client = options.client ?? sdkClient(options)
      return {
        capabilities,
        read: (key: string, readOptions: ReadOptions) => Effect.flatMap(
          validateReadOptions(key, readOptions),
          () => request(options, "read", key, async (signal): Promise<StoredObject | undefined> => {
            checkKey("read", key)
            const range = readOptions.range
            let object: GetObjectCommandOutput
            try {
              object = await client.getObject({
                Bucket: options.bucket,
                Key: key,
                ...(range === undefined ? {} : { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` }),
              }, signal)
            } catch (error) {
              const { name, status } = errorDetails(error)
              if (name === "NoSuchKey" || (status === 404 && name === "NotFound")) return undefined
              throw error
            }
            let body: ReadableStream<Uint8Array> | undefined
            try {
              if (object.Body === undefined || typeof object.Body.transformToWebStream !== "function") {
                throw failure("read", key, "invalid-response", "S3 did not return a streaming object body.")
              }
              body = object.Body.transformToWebStream()
              signal.throwIfAborted()
              if (typeof object.ETag !== "string" || object.ETag.length === 0) {
                throw failure("read", key, "invalid-response", "S3 did not return an opaque ETag.")
              }
              if (object.ContentLength !== undefined && (
                !Number.isSafeInteger(object.ContentLength) || object.ContentLength < 0
              )) {
                throw failure("read", key, "invalid-response", "S3 returned invalid Content-Length metadata.")
              }
              const maxBytes = range?.length ?? readOptions.maxBytes
              if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
                throw failure("read", key, "limit", "S3 response exceeds the read byte budget.")
              }
              let expectedLength = object.ContentLength
              if (range === undefined) {
                if (object.ContentRange !== undefined || object.$metadata.httpStatusCode === 206) {
                  throw failure("read", key, "invalid-response", "S3 returned a partial body for a complete read.")
                }
              } else {
                const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(object.ContentRange ?? "")
                const start = Number(match?.[1])
                const end = Number(match?.[2])
                const total = Number(match?.[3])
                if (
                  object.$metadata.httpStatusCode !== 206 ||
                  !Number.isSafeInteger(start) ||
                  !Number.isSafeInteger(end) ||
                  !Number.isSafeInteger(total) ||
                  start !== range.offset ||
                  start > end ||
                  end >= total ||
                  end !== Math.min(range.offset + range.length, total) - 1
                ) {
                  throw failure("read", key, "invalid-response", "S3 did not return the requested byte range.")
                }
                expectedLength = end - start + 1
                if (object.ContentLength !== undefined && object.ContentLength !== expectedLength) {
                  throw failure("read", key, "invalid-response", "S3 range length differs from Content-Length.")
                }
              }
              const bytes = await readObjectBytes(key, body, maxBytes, signal, expectedLength)
              return { bytes, etag: object.ETag }
            } catch (cause) {
              cancelReadBody(body, cause)
              throw cause
            }
          }),
        ),
        create: (key: string, bytes: Uint8Array) => request(options, "create", key, async (signal) => {
          checkKey("create", key)
          try {
            await client.createObject({ Bucket: options.bucket, Key: key, Body: bytes, IfNoneMatch: "*" }, signal)
            return "created" as const
          } catch (error) {
            const { name, status } = errorDetails(error)
            if (status === 412 || name === "PreconditionFailed") return "conflict" as const
            // A 409 can race a deletion; unlike 412, it does not prove a competing object exists.
            throw error
          }
        }),
        list: (prefix: string, cursor?: string) => request(options, "list", prefix, async (signal): Promise<ObjectPage> => {
          const page = await client.listObjects({
            Bucket: options.bucket,
            Prefix: prefix,
            ContinuationToken: cursor,
            EncodingType: "url",
          }, signal)
          if (typeof page.IsTruncated !== "boolean" || (page.EncodingType !== undefined && page.EncodingType !== "url")) {
            throw failure("list", prefix, "invalid-response", "S3 listing omitted valid pagination or encoding metadata.")
          }
          const nextCursor = page.IsTruncated ? page.NextContinuationToken : undefined
          if (page.IsTruncated && (!nextCursor || nextCursor === cursor)) {
            throw failure("list", prefix, "invalid-response", "Truncated S3 listing did not advance its continuation token.")
          }
          const keys = (page.Contents ?? []).map((object) => {
            if (object.Key === undefined) throw failure("list", prefix, "invalid-response", "S3 listing contained an object without a key.")
            let key: string
            try {
              key = page.EncodingType === "url" ? decodeURIComponent(object.Key) : object.Key
            } catch {
              throw failure("list", prefix, "invalid-response", "S3 listing contained malformed URL-encoded keys.")
            }
            if (!key.startsWith(prefix)) throw failure("list", prefix, "invalid-response", "S3 listing returned a key outside the requested prefix.")
            return key
          })
          return nextCursor === undefined ? { keys } : { keys, cursor: nextCursor }
        }),
      }
    },
    catch: (error) => classify("initialize", options.bucket, error),
  })

/** Signed S3 canonical transport layer. @experimental */
export const layer = (options: Options): Layer.Layer<ObjectStore, ObjectStoreFailure> => Layer.effect(ObjectStore, make(options))

/** Constructs separately authorized maintenance deletion; never included in the normal store. @experimental */
export const makeMaintenance = (options: MaintenanceOptions) =>
  Effect.try({
    try: () => {
      validate(options, options.client)
      const client = options.client ?? sdkClient(options)
      return {
        remove: (key: string) => request(options, "remove", key, async (signal) => {
          checkKey("remove", key)
          await client.deleteObject({ Bucket: options.bucket, Key: key }, signal)
        }),
      }
    },
    catch: (error) => classify("initialize", options.bucket, error),
  })

/** Separately authorized S3 deletion layer. @experimental */
export const layerMaintenance = (options: MaintenanceOptions): Layer.Layer<ObjectMaintenance, ObjectStoreFailure> =>
  Layer.effect(ObjectMaintenance, makeMaintenance(options))
