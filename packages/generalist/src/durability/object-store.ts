import { Context, Duration, Effect, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"

/** Classified object transport failure; a failed request may have committed. @experimental */
export class ObjectStoreFailure extends ActionableTaggedError<ObjectStoreFailure>()(
  "generalist/durability/ObjectStoreFailure",
  {
    operation: Schema.String,
    key: Schema.String,
    reason: Schema.Literals(["authentication", "rate-limit", "timeout", "unavailable", "invalid-response", "limit"]),
    message: Schema.String,
    hint: errorHint(
      "Check object transport credentials and availability; reconcile uncertain writes before retrying effects.",
    ),
  },
) {}

/** Bounded object bytes and opaque provider conditional token. @experimental */
export interface StoredObject {
  readonly bytes: Uint8Array
  readonly etag: string
}

/** Every read has an explicit byte budget; ranges may be shorter only at EOF. @experimental */
export interface ReadOptions {
  readonly maxBytes: number
  readonly range?: { readonly offset: number; readonly length: number }
}

/** Enforces caller read bounds; transport implementations apply it before honoring a read. @experimental */
export const validateReadOptions = ({
  key,
  options,
}: {
  readonly key: string
  readonly options: ReadOptions
}): Effect.Effect<void, ObjectStoreFailure> =>
  Effect.suspend(() => {
    const range = options?.range
    if (
      !Number.isSafeInteger(options?.maxBytes) ||
      options.maxBytes <= 0 ||
      (range !== undefined &&
        (range === null ||
          !Number.isSafeInteger(range.offset) ||
          range.offset < 0 ||
          !Number.isSafeInteger(range.length) ||
          range.length <= 0 ||
          range.length > options.maxBytes ||
          !Number.isSafeInteger(range.offset + range.length)))
    ) {
      return Effect.fail(
        ObjectStoreFailure.make({
          operation: "read",
          key,
          reason: "invalid-response",
          message:
            "Reads require a positive safe-integer maxBytes and a bounded range with a safe nonnegative offset and end.",
        }),
      )
    }
    return Effect.void
  })

const byteStream = Schema.instanceOf(ReadableStream)
const byteChunk = Schema.instanceOf(Uint8Array)

/**
 * Cancel without awaiting a provider's potentially stalled cancellation acknowledgement.
 * Best-effort: body.cancel() is a hint; the stream controls whether it actually stops.
 * @experimental
 */
export const cancelReadBody = ({ body }: { readonly body: ReadableStream<unknown> | undefined }): void => {
  if (body !== undefined && !body.locked) void body.cancel().catch(() => {})
}

const invalid = (key: string, message: string): ObjectStoreFailure =>
  ObjectStoreFailure.make({ operation: "read", key, reason: "invalid-response", message })

const limit = (key: string): ObjectStoreFailure =>
  ObjectStoreFailure.make({
    operation: "read",
    key,
    reason: "limit",
    message: "Object response exceeds the read byte budget.",
  })

const unavailable = (key: string): ObjectStoreFailure =>
  ObjectStoreFailure.make({
    operation: "read",
    key,
    reason: "unavailable",
    message: "Object response body could not be read completely.",
  })

const collectChunks = (
  key: string,
  reader: ReadableStreamDefaultReader<unknown>,
  maxBytes: number,
  expectedLength: number | undefined,
): Effect.Effect<{ readonly chunks: ReadonlyArray<Uint8Array>; readonly length: number }, ObjectStoreFailure> =>
  Effect.gen(function* () {
    const chunks: Array<Uint8Array> = []
    let length = 0
    while (true) {
      const result = yield* Effect.tryPromise({ try: () => reader.read(), catch: () => unavailable(key) })
      if (result.done) return { chunks, length }
      if (!Schema.is(byteChunk)(result.value))
        return yield* invalid(key, "Object response contains a non-byte stream chunk.")
      if (result.value.byteLength > maxBytes - length) return yield* limit(key)
      length += result.value.byteLength
      if (expectedLength !== undefined && length > expectedLength) {
        return yield* invalid(key, "Object body exceeds its declared size.")
      }
      if (result.value.byteLength > 0) chunks.push(result.value)
    }
  })

const joinChunks = (chunks: ReadonlyArray<Uint8Array>, length: number): Uint8Array => {
  if (chunks.length === 1) return chunks[0]!
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Consume only bounded streaming chunks, including when a provider omits or lies about its size. @experimental */
export const readObjectBytes = ({
  key,
  body,
  maxBytes,
  signal,
  expectedLength,
}: {
  readonly key: string
  readonly body: unknown
  readonly maxBytes: number
  readonly signal: AbortSignal
  readonly expectedLength?: number | undefined
}): Effect.Effect<Uint8Array, ObjectStoreFailure> => {
  if (!Schema.is(byteStream)(body)) return Effect.fail(invalid(key, "Object response has no readable byte stream."))
  if (expectedLength !== undefined && (!Number.isSafeInteger(expectedLength) || expectedLength < 0)) {
    return Effect.fail(invalid(key, "Object response has an invalid declared size."))
  }
  if (expectedLength !== undefined && expectedLength > maxBytes) return Effect.fail(limit(key))
  return Effect.acquireUseRelease(
    Effect.try({
      try: () => body.getReader(),
      catch: () => invalid(key, "Object response has no readable byte stream."),
    }),
    (reader) =>
      collectChunks(key, reader, maxBytes, expectedLength).pipe(
        Effect.flatMap((result) => {
          if (expectedLength !== undefined && result.length !== expectedLength) {
            return Effect.fail(invalid(key, "Object body differs from its declared size."))
          }
          return Effect.succeed(joinChunks(result.chunks, result.length))
        }),
        Effect.onError(() => Effect.sync(() => void reader.cancel().catch(() => {}))),
        Effect.onInterrupt(() => Effect.sync(() => void reader.cancel().catch(() => {}))),
      ),
    (reader) => Effect.sync(() => reader.releaseLock()),
  ).pipe(Effect.tap(() => Effect.sync(() => signal.throwIfAborted())))
}

/** Single-deadline request wrapper shared by transport implementations. @experimental */
export const request = <A>({
  timeoutMs,
  operation,
  key,
  execute,
}: {
  readonly timeoutMs: number
  readonly operation: string
  readonly key: string
  readonly execute: (signal: AbortSignal) => Effect.Effect<A, ObjectStoreFailure>
}): Effect.Effect<A, ObjectStoreFailure> => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    return Effect.fail(
      ObjectStoreFailure.make({
        operation,
        key,
        reason: "invalid-response",
        message: "Request timeout must be a positive integer within the timer range.",
      }),
    )
  }
  return Effect.suspend(() => {
    const controller = new AbortController()
    return execute(controller.signal).pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(timeoutMs),
        orElse: () =>
          Effect.fail(
            ObjectStoreFailure.make({
              operation,
              key,
              reason: "timeout",
              message: `Object ${operation} request deadline exceeded.`,
            }),
          ),
      }),
      Effect.ensuring(Effect.sync(() => controller.abort())),
    )
  })
}

/** A page is exhausted only when its cursor is absent. @experimental */
export interface ObjectPage {
  readonly keys: ReadonlyArray<string>
  readonly cursor?: string
}

/**
 * Optional listing bounds. `cursor` resumes an earlier page; `startAfter` restricts every page to
 * keys strictly after the named key, so a verified immutable prefix never has to be re-listed.
 * @experimental
 */
export interface ListOptions {
  readonly cursor?: string | undefined
  readonly startAfter?: string | undefined
}

/** Required provider guarantees, not inferred from an S3-shaped API. @experimental */
export interface Capabilities {
  readonly conditionalCreate: true
  readonly strongReadAfterWrite: true
  readonly consistentListing: true
}

/**
 * Canonical object transport contract; storage has no unconditional overwrite operation.
 * Implement it to provide a custom transport, then qualify the implementation with the
 * `generalist/testing/durability` conformance suite before trusting a real namespace.
 * @experimental
 */
export interface Service {
  readonly capabilities: Capabilities
  readonly read: (key: string, options: ReadOptions) => Effect.Effect<StoredObject | undefined, ObjectStoreFailure>
  readonly create: (key: string, bytes: Uint8Array) => Effect.Effect<"created" | "conflict", ObjectStoreFailure>
  readonly list: (prefix: string, options?: ListOptions) => Effect.Effect<ObjectPage, ObjectStoreFailure>
}

/** Runtime credentials need no deletion permission. @experimental */
export class ObjectStore extends Context.Service<ObjectStore, Service>()(
  "generalist/durability/object-store/ObjectStore",
) {}

/** Deletion is a separately supplied maintenance capability, never a normal commit. @experimental */
export class ObjectMaintenance extends Context.Service<
  ObjectMaintenance,
  { readonly remove: (key: string) => Effect.Effect<void, ObjectStoreFailure> }
>()("generalist/durability/object-store/ObjectMaintenance") {}
