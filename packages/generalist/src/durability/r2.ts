import { Effect, Layer, Schema } from "effect"
import {
  ObjectMaintenance,
  ObjectStore,
  ObjectStoreFailure,
  cancelReadBody,
  readObjectBytes,
  request,
  validateReadOptions,
  type Service,
} from "./object-store.js"

/** Native metadata used to verify complete reads and write acknowledgements. @experimental */
export interface ObjectMetadata {
  readonly key: string
  readonly size: number
  readonly etag: string
}

/** Native R2 body is consumed incrementally rather than with arrayBuffer(). @experimental */
export interface ObjectBody extends ObjectMetadata {
  readonly body: ReadableStream<Uint8Array>
  readonly range?: { readonly offset?: number; readonly length?: number; readonly suffix?: number | undefined }
}

/** Native listing fields consumed by the canonical transport. @experimental */
export interface ObjectList {
  readonly objects: ReadonlyArray<{ readonly key: string }>
  readonly truncated: boolean
  readonly cursor?: string | undefined
}

/** Minimal native R2Bucket binding; no Workers globals or deletion permission required. @experimental */
export interface Bucket {
  get(
    key: string,
    options?: { readonly range: { readonly offset: number; readonly length: number } },
  ): Promise<ObjectBody | null>
  put(
    key: string,
    value: Uint8Array,
    options: { readonly onlyIf: { readonly etagDoesNotMatch: "*" } },
  ): Promise<ObjectMetadata | null>
  list(options: { readonly prefix: string; readonly cursor?: string }): Promise<ObjectList>
}

/** Supply separately, with maintenance credentials and a retired namespace. @experimental */
export interface MaintenanceBucket {
  delete(key: string): Promise<void>
}

/** Native binding request deadlines also cover complete body consumption. @experimental */
export interface Options {
  /** Defaults to 30 seconds. A timed-out native PUT may still commit and must be reconciled. */
  readonly requestTimeoutMs?: number
}

const nonEmptyString = Schema.String.check(Schema.isNonEmpty())
const metadata = Schema.Struct({ key: Schema.String, size: Schema.Int, etag: nonEmptyString })
const rangeMetadata = Schema.Struct({
  offset: Schema.optionalKey(Schema.Int),
  length: Schema.optionalKey(Schema.Int),
  suffix: Schema.optional(Schema.Int),
})
const bodyMetadata = Schema.Struct({
  ...metadata.fields,
  range: Schema.optionalKey(rangeMetadata),
})
const readableStream = Schema.instanceOf(ReadableStream)
const objectList = Schema.Struct({
  objects: Schema.Array(Schema.Struct({ key: nonEmptyString })),
  truncated: Schema.Boolean,
  cursor: Schema.optional(Schema.String),
})

const invalidResponse = (operation: string, key: string, message: string) =>
  ObjectStoreFailure.make({ operation, key, reason: "invalid-response", message })

const error = Schema.instanceOf(Error)

const failure = (operation: string, key: string, cause: unknown): ObjectStoreFailure => {
  if (Schema.is(ObjectStoreFailure)(cause)) return cause
  const message = Schema.is(error)(cause) ? cause.message : String(cause)
  const code = /\((\d+)\)$/.exec(message)?.[1]
  let reason: ObjectStoreFailure["reason"] = "unavailable"
  switch (code) {
    case "10002":
    case "10003":
    case "10018":
    case "10035":
    case "10042":
    case "10069":
      reason = "authentication"
      break
    case "10058":
      reason = "rate-limit"
      break
    case "10039":
      reason = "invalid-response"
      break
    default:
      if (Schema.is(error)(cause) && (cause.name === "TimeoutError" || /\b(?:timed out|timeout)\b/i.test(message))) {
        reason = "timeout"
      }
  }
  return ObjectStoreFailure.make({ operation, key, reason, message })
}

const native = <A>(operation: string, key: string, execute: () => Promise<A>): Effect.Effect<A, ObjectStoreFailure> =>
  Effect.tryPromise({ try: execute, catch: (cause) => failure(operation, key, cause) })

const rangeLength = (
  key: string,
  object: typeof bodyMetadata.Type,
  range: { readonly offset: number; readonly length: number } | undefined,
): number => {
  if (range === undefined) {
    if (
      object.range !== undefined &&
      (object.range.offset !== 0 || object.range.length !== object.size || object.range.suffix !== undefined)
    ) {
      throw invalidResponse("read", key, "R2 returned a partial body for a complete read")
    }
    return object.size
  }
  const expectedLength = Math.min(range.length, object.size - range.offset)
  if (
    range.offset >= object.size ||
    object.range?.offset !== range.offset ||
    object.range.length !== expectedLength ||
    object.range.suffix !== undefined
  ) {
    throw invalidResponse("read", key, "R2 did not return the requested byte range")
  }
  return expectedLength
}

const readResponse = (
  key: string,
  object: ObjectBody,
  readOptions: { readonly maxBytes: number; readonly range?: { readonly offset: number; readonly length: number } },
  signal: AbortSignal,
): Effect.Effect<{ readonly bytes: Uint8Array; readonly etag: string }, ObjectStoreFailure> => {
  if (
    !Schema.is(bodyMetadata)(object) ||
    !Schema.is(readableStream)(object.body) ||
    !Number.isSafeInteger(object.size) ||
    object.size < 0
  ) {
    return Effect.fail(invalidResponse("read", key, "R2 returned an incomplete object response"))
  }
  if (object.key !== key) return Effect.fail(invalidResponse("read", key, "R2 returned an object for a different key"))
  return Effect.try({
    try: () => rangeLength(key, object, readOptions.range),
    catch: (cause) => failure("read", key, cause),
  }).pipe(
    Effect.flatMap((expectedLength) =>
      readObjectBytes({
        key,
        body: object.body,
        maxBytes: readOptions.range?.length ?? readOptions.maxBytes,
        signal,
        expectedLength,
      }),
    ),
    Effect.map((bytes) => ({ bytes, etag: object.etag })),
  )
}

const listResponse = (
  prefix: string,
  cursor: string | undefined,
  page: ObjectList,
): Effect.Effect<{ readonly keys: ReadonlyArray<string>; readonly cursor?: string }, ObjectStoreFailure> => {
  if (!Schema.is(objectList)(page))
    return Effect.fail(invalidResponse("list", prefix, "R2 returned invalid pagination metadata"))
  if (page.truncated && (page.cursor === undefined || page.cursor.length === 0 || page.cursor === cursor)) {
    return Effect.fail(invalidResponse("list", prefix, "R2 returned invalid pagination metadata"))
  }
  if (!page.truncated && page.cursor !== undefined)
    return Effect.fail(invalidResponse("list", prefix, "R2 returned invalid pagination metadata"))
  if (page.objects.some((object) => !object.key.startsWith(prefix))) {
    return Effect.fail(invalidResponse("list", prefix, "R2 returned an invalid object key in a listing"))
  }
  const keys = page.objects.map((object) => object.key)
  return page.cursor === undefined ? Effect.succeed({ keys }) : Effect.succeed({ keys, cursor: page.cursor })
}

const makeService = (bucket: Bucket, options: Options): Service => ({
  capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
  read: (key, readOptions) =>
    validateReadOptions({ key, options: readOptions }).pipe(
      Effect.andThen(
        request({
          timeoutMs: options.requestTimeoutMs ?? 30_000,
          operation: "read",
          key,
          execute: (signal) =>
            native("read", key, () =>
              bucket
                .get(key, readOptions.range === undefined ? undefined : { range: readOptions.range })
                .then((object) => {
                  if (signal.aborted && object !== null) cancelReadBody({ body: object.body })
                  return object
                }),
            ).pipe(
              Effect.flatMap((object) => {
                if (object === null) return Effect.void.pipe(Effect.as(undefined))
                return readResponse(key, object, readOptions, signal).pipe(
                  Effect.onError(() => Effect.sync(() => cancelReadBody({ body: object.body }))),
                )
              }),
            ),
        }),
      ),
    ),
  create: (key, bytes) =>
    request({
      timeoutMs: options.requestTimeoutMs ?? 30_000,
      operation: "create",
      key,
      execute: () =>
        native("create", key, () => bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: "*" } })).pipe(
          Effect.flatMap((object) => {
            if (object === null) return Effect.succeed("conflict" as const)
            if (
              !Schema.is(metadata)(object) ||
              !Number.isSafeInteger(object.size) ||
              object.size < 0 ||
              object.key !== key ||
              object.size !== bytes.byteLength
            ) {
              return Effect.fail(invalidResponse("create", key, "R2 returned an incomplete create acknowledgement"))
            }
            return Effect.succeed("created" as const)
          }),
        ),
    }),
  list: (prefix, cursor) =>
    request({
      timeoutMs: options.requestTimeoutMs ?? 30_000,
      operation: "list",
      key: prefix,
      execute: () =>
        native("list", prefix, () => bucket.list(cursor === undefined ? { prefix } : { prefix, cursor })).pipe(
          Effect.flatMap((page) => listResponse(prefix, cursor, page)),
        ),
    }),
})

/** Native reads bypass public-domain caches; writes are always atomic create-only PUTs. @experimental */
export function make(bucket: Bucket, options?: Options): Service
export function make(options?: Options): (bucket: Bucket) => Service
export function make(
  bucketOrOptions: Bucket | Options = {},
  options: Options = {},
): Service | ((bucket: Bucket) => Service) {
  if ("get" in bucketOrOptions) return makeService(bucketOrOptions, options)
  return (bucket) => makeService(bucket, bucketOrOptions)
}

/** Provide canonical object transport from a native R2Bucket binding. @experimental */
export function layer(bucket: Bucket, options?: Options): Layer.Layer<ObjectStore>
export function layer(options?: Options): (bucket: Bucket) => Layer.Layer<ObjectStore>
export function layer(
  bucketOrOptions: Bucket | Options = {},
  options: Options = {},
): Layer.Layer<ObjectStore> | ((bucket: Bucket) => Layer.Layer<ObjectStore>) {
  if ("get" in bucketOrOptions) return Layer.succeed(ObjectStore, makeService(bucketOrOptions, options))
  return (bucket) => Layer.succeed(ObjectStore, makeService(bucket, bucketOrOptions))
}

/** Construct deletion capability independently of canonical runtime access. @experimental */
export const makeMaintenance = (bucket: MaintenanceBucket) => ({
  remove: (key: string): Effect.Effect<void, ObjectStoreFailure> => native("remove", key, () => bucket.delete(key)),
})

/** Provide explicitly authorized, offline maintenance deletion. @experimental */
export const layerMaintenance = (bucket: MaintenanceBucket): Layer.Layer<ObjectMaintenance> =>
  Layer.succeed(ObjectMaintenance, makeMaintenance(bucket))
