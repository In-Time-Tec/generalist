import { Effect, Layer } from "effect"
import {
  ObjectMaintenance,
  ObjectStore,
  ObjectStoreFailure,
  cancelReadBody,
  readObjectBytes,
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
  readonly range?: { readonly offset?: number; readonly length?: number; readonly suffix?: number }
}

/** Native listing fields consumed by the canonical transport. @experimental */
export interface ObjectList {
  readonly objects: ReadonlyArray<{ readonly key: string }>
  readonly truncated: boolean
  readonly cursor?: string
}

/** Minimal native R2Bucket binding; no Workers globals or deletion permission required. @experimental */
export interface Bucket {
  get(key: string, options?: { readonly range: { readonly offset: number; readonly length: number } }): Promise<ObjectBody | null>
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

const invalidResponse = (operation: string, key: string, message: string) =>
  ObjectStoreFailure.make({ operation, key, reason: "invalid-response", message })

const failure = (operation: string, key: string, cause: unknown): ObjectStoreFailure => {
  if (cause instanceof ObjectStoreFailure) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  // The native binding exposes the R2 code in the message, not an HTTP status or a code property.
  // https://developers.cloudflare.com/r2/api/error-codes/
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
      if (cause instanceof Error && (cause.name === "TimeoutError" || /\b(?:timed out|timeout)\b/i.test(message))) {
        reason = "timeout"
      }
  }
  return ObjectStoreFailure.make({ operation, key, reason, message })
}

const validMetadata = (object: ObjectMetadata, key: string): boolean =>
  object !== null &&
  typeof object === "object" &&
  object.key === key &&
  typeof object.etag === "string" &&
  object.etag.length > 0 &&
  Number.isSafeInteger(object.size) &&
  object.size >= 0

const request = <A>(
  options: Options,
  operation: string,
  key: string,
  execute: (signal: AbortSignal) => Promise<A>,
): Effect.Effect<A, ObjectStoreFailure> =>
  Effect.tryPromise({
    try: async (interruption) => {
      interruption.throwIfAborted()
      const timeoutMs = options.requestTimeoutMs ?? 30_000
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
        throw invalidResponse(operation, key, "R2 requestTimeoutMs must be a positive integer within the timer range.")
      }
      const controller = new AbortController()
      const interrupt = () => controller.abort(interruption.reason)
      interruption.addEventListener("abort", interrupt, { once: true })
      const timeout = setTimeout(
        () => controller.abort(new DOMException("R2 request deadline exceeded", "TimeoutError")),
        timeoutMs,
      )
      let rejectAbort!: (reason: unknown) => void
      const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
      const onAbort = () => rejectAbort(controller.signal.reason)
      controller.signal.addEventListener("abort", onAbort, { once: true })
      try {
        // Native bindings have no AbortSignal option. Stop waiting, cancel available read
        // bodies, and leave a pending write uncertain rather than inventing a conflict.
        return await Promise.race([execute(controller.signal), aborted])
      } finally {
        clearTimeout(timeout)
        interruption.removeEventListener("abort", interrupt)
        controller.signal.removeEventListener("abort", onAbort)
        controller.abort()
      }
    },
    catch: (cause) => failure(operation, key, cause),
  })

/** Native reads bypass public-domain caches; writes are always atomic create-only PUTs. @experimental */
export const make = (bucket: Bucket, options: Options = {}): Service => ({
  capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
  read: (key, readOptions) => Effect.flatMap(
    validateReadOptions(key, readOptions),
    () => request(options, "read", key, async (signal) => {
      const range = readOptions.range
      const object = await bucket.get(key, range === undefined ? undefined : { range })
      if (object === null) {
        signal.throwIfAborted()
        return undefined
      }
      try {
        signal.throwIfAborted()
        if (!validMetadata(object, key) || object.body === undefined || typeof object.body.getReader !== "function") {
          throw invalidResponse("read", key, "R2 returned an incomplete object response")
        }
        let expectedLength = object.size
        if (range === undefined) {
          if (
            object.range !== undefined &&
            (object.range.offset !== 0 || object.range.length !== object.size || object.range.suffix !== undefined)
          ) {
            throw invalidResponse("read", key, "R2 returned a partial body for a complete read")
          }
        } else {
          expectedLength = Math.min(range.length, object.size - range.offset)
          if (
            range.offset >= object.size ||
            object.range?.offset !== range.offset ||
            object.range.length !== expectedLength ||
            object.range.suffix !== undefined
          ) {
            throw invalidResponse("read", key, "R2 did not return the requested byte range")
          }
        }
        const bytes = await readObjectBytes(key, object.body, range?.length ?? readOptions.maxBytes, signal, expectedLength)
        return { bytes, etag: object.etag }
      } catch (cause) {
        cancelReadBody(object?.body, cause)
        throw cause
      }
    }),
  ),
  create: (key, bytes) => request(options, "create", key, async () => {
    // R2's unquoted wildcard is If-None-Match: *. A failed condition returns null.
    // https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations
    const object = await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: "*" } })
    if (object === null) return "conflict" as const
    if (!validMetadata(object, key) || object.size !== bytes.byteLength) {
      throw invalidResponse("create", key, "R2 returned an incomplete create acknowledgement")
    }
    return "created" as const
  }),
  list: (prefix, cursor) => request(options, "list", prefix, async () => {
        const page = await bucket.list(cursor === undefined ? { prefix } : { prefix, cursor })
        if (
          page === null ||
          typeof page !== "object" ||
          !Array.isArray(page.objects) ||
          typeof page.truncated !== "boolean" ||
          (page.truncated
            ? typeof page.cursor !== "string" || page.cursor.length === 0 || page.cursor === cursor
            : page.cursor !== undefined)
        ) {
          throw invalidResponse("list", prefix, "R2 returned invalid pagination metadata")
        }
        const keys: Array<string> = []
        for (const object of page.objects) {
          if (
            object === null ||
            typeof object !== "object" ||
            typeof object.key !== "string" ||
            object.key.length === 0 ||
            !object.key.startsWith(prefix)
          ) {
            throw invalidResponse("list", prefix, "R2 returned an invalid object key in a listing")
          }
          keys.push(object.key)
        }
        // Empty and short pages can be truncated; only the provider's cursor ends pagination.
        return page.cursor === undefined ? { keys } : { keys, cursor: page.cursor }
  }),
})

/** Provide canonical object transport from a native R2Bucket binding. @experimental */
export const layer = (bucket: Bucket, options: Options = {}): Layer.Layer<ObjectStore> =>
  Layer.succeed(ObjectStore, make(bucket, options))

/** Construct deletion capability independently of canonical runtime access. @experimental */
export const makeMaintenance = (bucket: MaintenanceBucket) => ({
  remove: (key: string): Effect.Effect<void, ObjectStoreFailure> =>
    Effect.tryPromise({
      try: () => bucket.delete(key),
      catch: (cause) => failure("remove", key, cause),
    }),
})

/** Provide explicitly authorized, offline maintenance deletion. @experimental */
export const layerMaintenance = (bucket: MaintenanceBucket): Layer.Layer<ObjectMaintenance> =>
  Layer.succeed(ObjectMaintenance, makeMaintenance(bucket))
