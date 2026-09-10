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
import { Data, Effect, Layer, Schema } from "effect"
import {
  ObjectMaintenance,
  ObjectStore,
  ObjectStoreFailure,
  cancelReadBody,
  readObjectBytes,
  request,
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
  readonly endpoint?: string
  readonly forcePathStyle?: boolean
  readonly credentials?: S3ClientConfig["credentials"]
  readonly capabilities?: { readonly [K in keyof Capabilities]: boolean }
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

const capabilities: Capabilities = { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true }
const nonEmptyString = Schema.String.check(Schema.isNonEmpty())
const awsError = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  code: Schema.optionalKey(Schema.String),
  $metadata: Schema.optionalKey(Schema.Struct({ httpStatusCode: Schema.optionalKey(Schema.Int) })),
})

const failure = (operation: string, key: string, reason: ObjectStoreFailure["reason"], message: string) =>
  ObjectStoreFailure.make({ operation, key, reason, message })

class S3NativeFailure extends Data.TaggedError("generalist/durability/S3NativeFailure")<{
  readonly name?: string | undefined
  readonly status?: number | undefined
}> {}

const errorDetails = (cause: unknown) => {
  if (!Schema.is(awsError)(cause)) return { name: undefined, status: undefined }
  return {
    name: cause.name === undefined || cause.name === "Error" ? cause.code : cause.name,
    status: cause.$metadata?.httpStatusCode,
  }
}

const authentication = (status: number | undefined, name: string | undefined): boolean =>
  status === 401 ||
  status === 403 ||
  [
    "CredentialsProviderError",
    "TokenProviderError",
    "ExpiredToken",
    "InvalidAccessKeyId",
    "SignatureDoesNotMatch",
  ].includes(name ?? "")
const rateLimited = (status: number | undefined, name: string | undefined): boolean =>
  status === 429 || ["SlowDown", "Throttling", "ThrottlingException"].includes(name ?? "")
const timedOut = (status: number | undefined, name: string | undefined): boolean =>
  status === 408 || status === 504 || ["TimeoutError", "RequestTimeout", "AbortError", "ETIMEDOUT"].includes(name ?? "")

const classify = (operation: string, key: string, cause: unknown): ObjectStoreFailure => {
  if (Schema.is(ObjectStoreFailure)(cause)) return cause
  const { name, status } = errorDetails(cause)
  return classifyDetails(operation, key, name, status)
}

const classifyDetails = (
  operation: string,
  key: string,
  name: string | undefined,
  status: number | undefined,
): ObjectStoreFailure => {
  let reason: ObjectStoreFailure["reason"] = "unavailable"
  if (authentication(status, name)) reason = "authentication"
  else if (rateLimited(status, name)) reason = "rate-limit"
  else if (timedOut(status, name)) reason = "timeout"
  else if (status !== undefined && status >= 300 && status < 500 && status !== 409) reason = "invalid-response"
  return failure(operation, key, reason, `S3 ${operation} failed (${reason}); writes may require reconciliation.`)
}

const native = <A>(execute: () => Promise<A>): Effect.Effect<A, S3NativeFailure> =>
  Effect.tryPromise({ try: execute, catch: (cause) => new S3NativeFailure(errorDetails(cause)) })

const mapNativeFailure = (operation: string, key: string) =>
  Effect.mapError((cause: S3NativeFailure) => classifyDetails(operation, key, cause.name, cause.status))

const invalid = (options: ConnectionOptions, message: string): never => {
  throw failure("initialize", options.bucket, "invalid-response", message)
}
const validBucket = (bucket: string): boolean =>
  /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) &&
  !bucket.includes("..") &&
  !/^\d+\.\d+\.\d+\.\d+$/.test(bucket) &&
  !["--x-s3", "-s3alias", "--ol-s3", "--table-s3"].some((suffix) => bucket.endsWith(suffix))
const validateEndpoint = (options: ConnectionOptions): void => {
  if (options.endpoint === undefined) return
  let endpoint: URL
  try {
    endpoint = new URL(options.endpoint)
  } catch {
    return invalid(options, "S3 endpoints must be absolute HTTP(S) URLs.")
  }
  if (
    (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.search !== "" ||
    endpoint.hash !== ""
  )
    invalid(options, "S3 endpoints must be HTTP(S) URLs without embedded credentials, query strings, or fragments.")
}
const requiresCapabilityAttestation = (
  options: ConnectionOptions,
  client: { readonly guarantees: ClientGuarantees } | undefined,
): boolean => options.endpoint !== undefined || client !== undefined || options.capabilities !== undefined
const validCapabilities = (asserted: ConnectionOptions["capabilities"]): boolean =>
  asserted?.conditionalCreate === true && asserted.strongReadAfterWrite === true && asserted.consistentListing === true
const validate = (options: ConnectionOptions, client: { readonly guarantees: ClientGuarantees } | undefined): void => {
  if (!validBucket(options.bucket))
    invalid(options, "S3 durability requires a general-purpose bucket name, not an ARN or an endpoint alias.")
  if (options.region.trim().length === 0) invalid(options, "An explicit S3 region is required.")
  const timeout = options.requestTimeoutMs ?? 30_000
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647)
    invalid(options, "S3 requestTimeoutMs must be a positive integer within the timer range.")
  validateEndpoint(options)
  if (requiresCapabilityAttestation(options, client) && !validCapabilities(options.capabilities))
    invalid(options, "The provider must guarantee atomic conditional create, strong reads, and consistent listing.")
  if (client !== undefined && (client.guarantees.singleAttempt !== true || client.guarantees.noRedirects !== true)) {
    invalid(options, "Injected S3 clients must disable automatic retries and all redirects.")
  }
}

const sdkClient = (options: ConnectionOptions): Client & MaintenanceClient => {
  const config: S3ClientConfig = {
    region: options.region,
    ignoreConfiguredEndpointUrls: true,
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
  }
  if (options.endpoint !== undefined) config.endpoint = options.endpoint
  if (options.forcePathStyle !== undefined) config.forcePathStyle = options.forcePathStyle
  if (options.credentials !== undefined) config.credentials = options.credentials
  const sdk = new S3Client(config)
  return {
    guarantees: { singleAttempt: true, noRedirects: true },
    getObject: (input, signal) => sdk.send(new GetObjectCommand(input), { abortSignal: signal }),
    createObject: (input, signal) => sdk.send(new PutObjectCommand(input), { abortSignal: signal }),
    listObjects: (input, signal) => sdk.send(new ListObjectsV2Command(input), { abortSignal: signal }),
    deleteObject: (input, signal) => sdk.send(new DeleteObjectCommand(input), { abortSignal: signal }),
  }
}

const checkKey = (operation: string, key: string): void => {
  if (key.length === 0 || /(?:^|\/)\.{1,2}(?:\/|$)/.test(key)) {
    throw failure(
      operation,
      key,
      "invalid-response",
      "Object keys must be nonempty and contain no dot-only path segments.",
    )
  }
}
const getInput = (bucket: string, key: string, range: ReadOptions["range"]): GetObjectCommandInput => {
  const input: GetObjectCommandInput = { Bucket: bucket, Key: key }
  if (range !== undefined) input.Range = `bytes=${range.offset}-${range.offset + range.length - 1}`
  return input
}
const streamFrom = (
  key: string,
  body: GetObjectCommandOutput["Body"],
): Effect.Effect<ReadableStream<unknown>, ObjectStoreFailure> =>
  Effect.try({
    try: () => body?.transformToWebStream(),
    catch: () => failure("read", key, "invalid-response", "S3 did not return a streaming object body."),
  }).pipe(
    Effect.flatMap((stream) =>
      Schema.is(Schema.instanceOf(ReadableStream))(stream)
        ? Effect.succeed(stream)
        : Effect.fail(failure("read", key, "invalid-response", "S3 did not return a streaming object body.")),
    ),
  )
const rangeLength = (key: string, object: GetObjectCommandOutput, range: ReadOptions["range"]): number | undefined => {
  if (object.ContentLength !== undefined && (!Number.isSafeInteger(object.ContentLength) || object.ContentLength < 0)) {
    throw failure("read", key, "invalid-response", "S3 returned invalid Content-Length metadata.")
  }
  if (range === undefined) {
    if (object.ContentRange !== undefined || object.$metadata.httpStatusCode === 206) {
      throw failure("read", key, "invalid-response", "S3 returned a partial body for a complete read.")
    }
    return object.ContentLength
  }
  return validateRange(key, object, range)
}
const validateRange = (
  key: string,
  object: GetObjectCommandOutput,
  range: NonNullable<ReadOptions["range"]>,
): number => {
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
  )
    throw failure("read", key, "invalid-response", "S3 did not return the requested byte range.")
  const expectedLength = end - start + 1
  if (object.ContentLength !== undefined && object.ContentLength !== expectedLength) {
    throw failure("read", key, "invalid-response", "S3 range length differs from Content-Length.")
  }
  return expectedLength
}
const readResponse = (
  key: string,
  object: GetObjectCommandOutput,
  options: ReadOptions,
  signal: AbortSignal,
): Effect.Effect<StoredObject, ObjectStoreFailure> => {
  const etag = object.ETag
  if (!Schema.is(nonEmptyString)(etag))
    return Effect.fail(failure("read", key, "invalid-response", "S3 did not return an opaque ETag."))
  const maxBytes = options.range?.length ?? options.maxBytes
  return streamFrom(key, object.Body).pipe(
    Effect.flatMap((body) =>
      Effect.try({
        try: () => rangeLength(key, object, options.range),
        catch: (cause) => classify("read", key, cause),
      }).pipe(
        Effect.flatMap((expectedLength) => {
          if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
            return Effect.fail(failure("read", key, "limit", "S3 response exceeds the read byte budget."))
          }
          return readObjectBytes({ key, body, maxBytes, signal, expectedLength })
        }),
        Effect.map((bytes) => ({ bytes, etag })),
        Effect.onError(() => Effect.sync(() => cancelReadBody({ body }))),
      ),
    ),
  )
}

const listResponse = (
  prefix: string,
  cursor: string | undefined,
  startAfter: string | undefined,
  page: ListObjectsV2CommandOutput,
): Effect.Effect<ObjectPage, ObjectStoreFailure> => {
  if (
    !Schema.is(Schema.Boolean)(page.IsTruncated) ||
    !Schema.is(Schema.UndefinedOr(Schema.Literal("url")))(page.EncodingType)
  ) {
    return Effect.fail(
      failure("list", prefix, "invalid-response", "S3 listing omitted valid pagination or encoding metadata."),
    )
  }
  const nextCursor = page.IsTruncated ? page.NextContinuationToken : undefined
  if (page.IsTruncated && (nextCursor === undefined || nextCursor.length === 0 || nextCursor === cursor)) {
    return Effect.fail(
      failure("list", prefix, "invalid-response", "Truncated S3 listing did not advance its continuation token."),
    )
  }
  return Effect.try({
    try: () =>
      (page.Contents ?? []).map((object) => {
        if (object.Key === undefined)
          throw failure("list", prefix, "invalid-response", "S3 listing contained an object without a key.")
        let key: string
        try {
          key = page.EncodingType === "url" ? decodeURIComponent(object.Key) : object.Key
        } catch {
          throw failure("list", prefix, "invalid-response", "S3 listing contained malformed URL-encoded keys.")
        }
        if (!key.startsWith(prefix))
          throw failure("list", prefix, "invalid-response", "S3 listing returned a key outside the requested prefix.")
        if (startAfter !== undefined && key <= startAfter)
          throw failure("list", prefix, "invalid-response", "S3 listing ignored the requested StartAfter bound.")
        return key
      }),
    catch: (cause) => classify("list", prefix, cause),
  }).pipe(Effect.map((keys) => (nextCursor === undefined ? { keys } : { keys, cursor: nextCursor })))
}

const makeService = (options: Options, client: Client): Service => ({
  capabilities,
  read: (key, readOptions) =>
    validateReadOptions({ key, options: readOptions }).pipe(
      Effect.andThen(
        request({
          timeoutMs: options.requestTimeoutMs ?? 30_000,
          operation: "read",
          key,
          execute: (signal) =>
            Effect.try({ try: () => checkKey("read", key), catch: (cause) => classify("read", key, cause) }).pipe(
              Effect.andThen(
                native(() => client.getObject(getInput(options.bucket, key, readOptions.range), signal)).pipe(
                  Effect.catchTag("generalist/durability/S3NativeFailure", (cause) =>
                    cause.name === "NoSuchKey" || (cause.status === 404 && cause.name === "NotFound")
                      ? Effect.void.pipe(Effect.as(undefined))
                      : Effect.fail(classifyDetails("read", key, cause.name, cause.status)),
                  ),
                ),
              ),
              Effect.flatMap((object) =>
                object === undefined
                  ? Effect.void.pipe(Effect.as(undefined))
                  : readResponse(key, object, readOptions, signal),
              ),
            ),
        }),
      ),
    ),
  create: (key, bytes) =>
    request({
      timeoutMs: options.requestTimeoutMs ?? 30_000,
      operation: "create",
      key,
      execute: (signal) =>
        Effect.try({ try: () => checkKey("create", key), catch: (cause) => classify("create", key, cause) }).pipe(
          Effect.andThen(
            native(() =>
              client.createObject({ Bucket: options.bucket, Key: key, Body: bytes, IfNoneMatch: "*" }, signal),
            ).pipe(
              Effect.as("created" as const),
              Effect.catchTag("generalist/durability/S3NativeFailure", (cause) =>
                cause.status === 412 || cause.name === "PreconditionFailed"
                  ? Effect.succeed("conflict" as const)
                  : Effect.fail(classifyDetails("create", key, cause.name, cause.status)),
              ),
            ),
          ),
        ),
    }),
  list: (prefix, listOptions) =>
    request({
      timeoutMs: options.requestTimeoutMs ?? 30_000,
      operation: "list",
      key: prefix,
      execute: (signal) =>
        native(() =>
          client.listObjects(
            {
              Bucket: options.bucket,
              Prefix: prefix,
              ContinuationToken: listOptions?.cursor,
              StartAfter: listOptions?.startAfter,
              EncodingType: "url",
            },
            signal,
          ),
        ).pipe(
          mapNativeFailure("list", prefix),
          Effect.flatMap((page) => listResponse(prefix, listOptions?.cursor, listOptions?.startAfter, page)),
        ),
    }),
})

/** Creates the signed transport. Every request is single-attempt: reconcile uncertain creates by reading the key. @experimental */
export const make = (options: Options): Effect.Effect<Service, ObjectStoreFailure> =>
  Effect.try({
    try: () => {
      validate(options, options.client)
      return makeService(options, options.client ?? sdkClient(options))
    },
    catch: (cause) => classify("initialize", options.bucket, cause),
  })
/** Signed S3 canonical transport layer. @experimental */
export const layer = (options: Options): Layer.Layer<ObjectStore, ObjectStoreFailure> =>
  Layer.effect(ObjectStore, make(options))
/** Constructs separately authorized maintenance deletion; never included in the normal store. @experimental */
export const makeMaintenance = (options: MaintenanceOptions) =>
  Effect.try({
    try: () => {
      validate(options, options.client)
      const client = options.client ?? sdkClient(options)
      return {
        remove: (key: string) =>
          request({
            timeoutMs: options.requestTimeoutMs ?? 30_000,
            operation: "remove",
            key,
            execute: (signal) =>
              Effect.try({ try: () => checkKey("remove", key), catch: (cause) => classify("remove", key, cause) }).pipe(
                Effect.andThen(
                  native(() => client.deleteObject({ Bucket: options.bucket, Key: key }, signal)).pipe(
                    mapNativeFailure("remove", key),
                  ),
                ),
                Effect.asVoid,
              ),
          }),
      }
    },
    catch: (cause) => classify("initialize", options.bucket, cause),
  })
/** Separately authorized S3 deletion layer. @experimental */
export const layerMaintenance = (options: MaintenanceOptions): Layer.Layer<ObjectMaintenance, ObjectStoreFailure> =>
  Layer.effect(ObjectMaintenance, makeMaintenance(options))
