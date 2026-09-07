import { Context, Effect, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"

/** Classified object transport failure; a failed request may have committed. @experimental */
export class ObjectStoreFailure extends ActionableTaggedError<ObjectStoreFailure>()(
  "generalist/durability/ObjectStoreFailure",
  {
    operation: Schema.String,
    key: Schema.String,
    reason: Schema.Literals(["authentication", "rate-limit", "timeout", "unavailable", "invalid-response", "limit"]),
    message: Schema.String,
    hint: errorHint("Check object transport credentials and availability; reconcile uncertain writes before retrying effects."),
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

/** @internal */
export const validateReadOptions = (key: string, options: ReadOptions): Effect.Effect<void, ObjectStoreFailure> =>
  Effect.suspend(() => {
    const range = options?.range
    if (
      !Number.isSafeInteger(options?.maxBytes) ||
      options.maxBytes <= 0 ||
      (range !== undefined && (
        range === null ||
        !Number.isSafeInteger(range.offset) ||
        range.offset < 0 ||
        !Number.isSafeInteger(range.length) ||
        range.length <= 0 ||
        range.length > options.maxBytes ||
        !Number.isSafeInteger(range.offset + range.length)
      ))
    ) {
      return Effect.fail(ObjectStoreFailure.make({
        operation: "read", key, reason: "invalid-response",
        message: "Reads require a positive safe-integer maxBytes and a bounded range with a safe nonnegative offset and end.",
      }))
    }
    return Effect.void
  })

/** Cancel without awaiting a provider's potentially stalled cancellation acknowledgement. @internal */
export const cancelReadBody = (body: ReadableStream<Uint8Array> | undefined, reason?: unknown): void => {
  if (body !== undefined && body !== null && typeof body.cancel === "function" && !body.locked) {
    void body.cancel(reason).catch(() => {})
  }
}

/** Consume only bounded streaming chunks, including when a provider omits or lies about its size. @internal */
export const readObjectBytes = async (
  key: string,
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal: AbortSignal,
  expectedLength?: number,
): Promise<Uint8Array> => {
  const invalid = (message: string) => ObjectStoreFailure.make({ operation: "read", key, reason: "invalid-response", message })
  const limit = () => ObjectStoreFailure.make({
    operation: "read", key, reason: "limit", message: "Object response exceeds the read byte budget.",
  })
  if (body === undefined || body === null || typeof body.getReader !== "function") {
    throw invalid("Object response has no readable byte stream.")
  }
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const cancel = () => {
    if (reader !== undefined) void reader.cancel(signal.reason).catch(() => {})
  }
  try {
    signal.throwIfAborted()
    if (expectedLength !== undefined) {
      if (!Number.isSafeInteger(expectedLength) || expectedLength < 0) throw invalid("Object response has an invalid declared size.")
      if (expectedLength > maxBytes) throw limit()
    }
    reader = body.getReader()
    signal.addEventListener("abort", cancel, { once: true })
    const chunks: Array<Uint8Array> = []
    let length = 0
    while (true) {
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) break
      if (!(chunk.value instanceof Uint8Array)) throw invalid("Object response contains a non-byte stream chunk.")
      if (chunk.value.byteLength > maxBytes - length) throw limit()
      length += chunk.value.byteLength
      if (expectedLength !== undefined && length > expectedLength) throw invalid("Object body exceeds its declared size.")
      if (chunk.value.byteLength > 0) chunks.push(chunk.value)
    }
    if (expectedLength !== undefined && length !== expectedLength) throw invalid("Object body differs from its declared size.")
    if (chunks.length === 1) return chunks[0]!
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } catch (cause) {
    if (reader !== undefined) void reader.cancel(cause).catch(() => {})
    else cancelReadBody(body, cause)
    throw cause
  } finally {
    signal.removeEventListener("abort", cancel)
    reader?.releaseLock()
  }
}

/** A page is exhausted only when its cursor is absent. @experimental */
export interface ObjectPage {
  readonly keys: ReadonlyArray<string>
  readonly cursor?: string
}

/** Required provider guarantees, not inferred from an S3-shaped API. @experimental */
export interface Capabilities {
  readonly conditionalCreate: true
  readonly strongReadAfterWrite: true
  readonly consistentListing: true
}

/** Canonical storage has no unconditional overwrite operation. @experimental */
export interface Service {
  readonly capabilities: Capabilities
  readonly read: (key: string, options: ReadOptions) => Effect.Effect<StoredObject | undefined, ObjectStoreFailure>
  readonly create: (
    key: string,
    bytes: Uint8Array,
  ) => Effect.Effect<"created" | "conflict", ObjectStoreFailure>
  readonly list: (prefix: string, cursor?: string) => Effect.Effect<ObjectPage, ObjectStoreFailure>
}

/** Runtime credentials need no deletion permission. @experimental */
export class ObjectStore extends Context.Service<ObjectStore, Service>()("generalist/durability/ObjectStore") {}

/** Deletion is a separately supplied maintenance capability, never a normal commit. @experimental */
export class ObjectMaintenance extends Context.Service<
  ObjectMaintenance,
  { readonly remove: (key: string) => Effect.Effect<void, ObjectStoreFailure> }
>()("generalist/durability/ObjectMaintenance") {}
