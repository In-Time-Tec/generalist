import { Crypto, Duration, Effect, FileSystem, Layer, Option, Path, PlatformError, Schema } from "effect"
import {
  type Capabilities,
  type ListOptions,
  ObjectMaintenance,
  type ObjectPage,
  ObjectStore,
  ObjectStoreFailure,
  type ReadOptions,
  type Service,
  type StoredObject,
  validateReadOptions,
} from "./object-store.js"

/**
 * Local-directory transport options. The directory is single-host canonical state:
 * it requires a POSIX-style filesystem with atomic hard links, and a replacement
 * host cannot reach it. Use a dedicated directory; the transport owns its contents.
 * @experimental
 */
export interface Options {
  readonly dir: string
  /** Defaults to 30 seconds. A timed-out create may still commit and must be reconciled. */
  readonly requestTimeoutMs?: number
  /** Defaults to 1000 keys per page. */
  readonly pageSize?: number
}

const capabilities: Capabilities = {
  conditionalCreate: true,
  strongReadAfterWrite: true,
  consistentListing: true,
}

const failure = (operation: string, key: string, reason: ObjectStoreFailure["reason"], message: string) =>
  ObjectStoreFailure.make({ operation, key, reason, message })

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

const platformError = Schema.instanceOf(PlatformError.PlatformError)

/** A missing name or a path segment occupied by a file both mean the object is absent. */
const isAbsent = (cause: PlatformError.PlatformError): boolean =>
  cause.reason._tag === "NotFound" || cause.reason._tag === "BadResource"

const mapError = (operation: string, key: string, cause: unknown): ObjectStoreFailure => {
  if (Schema.is(ObjectStoreFailure)(cause)) return cause
  const tag = Schema.is(platformError)(cause) ? cause.reason._tag : undefined
  let reason: ObjectStoreFailure["reason"] = "unavailable"
  switch (tag) {
    case "PermissionDenied":
      reason = "authentication"
      break
    case "TimedOut":
      reason = "timeout"
      break
    case "InvalidData":
    case "BadArgument":
      reason = "invalid-response"
      break
  }
  const message = Schema.is(platformError)(cause) ? cause.message : String(cause)
  return ObjectStoreFailure.make({ operation, key, reason, message })
}

const withDeadline = <A>(
  operation: string,
  key: string,
  timeoutMs: number,
  effect: Effect.Effect<A, ObjectStoreFailure>,
): Effect.Effect<A, ObjectStoreFailure> =>
  effect.pipe(
    Effect.timeoutOption(Duration.millis(timeoutMs)),
    Effect.flatMap((result) =>
      Option.isNone(result)
        ? Effect.fail(
            failure(operation, key, "timeout", `Filesystem ${operation} did not settle within ${timeoutMs}ms`),
          )
        : Effect.succeed(result.value),
    ),
  )

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * One object key segment maps to one filesystem name: UTF-8 bytes outside
 * [a-z0-9._~-] become %XX escapes, and a leading dot is always escaped so no
 * stored name ever starts with "." — dot-prefixed names are transport-internal
 * (write temporaries) and never listed as objects. ASCII uppercase letters are
 * escaped too, so the namespace this encoding writes stays injective under
 * filesystem case folding: case-variant keys cannot alias one file on a
 * case-insensitive volume. Names stored by earlier unreleased encodings are
 * not decoded or migrated; the transport is unreleased and a fresh directory
 * is required across this change.
 */
const encodeSegment = (segment: string): string => {
  const bytes = encoder.encode(segment)
  const last = bytes.length - 1
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!
    const char = String.fromCharCode(byte)
    const safe =
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      char === "_" ||
      char === "~" ||
      char === "-" ||
      (char === "." && i > 0 && i < last)
    out += safe ? char : "%" + byte.toString(16).toUpperCase().padStart(2, "0")
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) {
    out = "%" + out.charCodeAt(0).toString(16).toUpperCase() + out.slice(1)
  }
  return out
}

const encodedSegment = /^[A-Za-z0-9_~%-]+(?:\.[A-Za-z0-9_~%-]*)*$/

const decodeSegment = (name: string): string | undefined => {
  if (name.startsWith(".") || !encodedSegment.test(name)) return undefined
  const bytes = new Uint8Array(name.length)
  let length = 0
  for (let i = 0; i < name.length; i++) {
    const char = name[i]!
    if (char === "%") {
      if (!/^[0-9A-F]{2}$/.test(name.slice(i + 1, i + 3))) return undefined
      bytes[length++] = parseInt(name.slice(i + 1, i + 3), 16)
      i += 2
    } else {
      bytes[length++] = char.charCodeAt(0)
    }
  }
  const decoded = decoder.decode(bytes.subarray(0, length))
  if (decoded === "." || decoded === "..") return undefined
  return encodeSegment(decoded) === name ? decoded : undefined
}

const listingCursor = Schema.fromJsonString(Schema.Tuple([Schema.String, Schema.String]))
const encodeListingCursor = Schema.encodeSync(listingCursor)

const decodeEntry = (path: Path.Path, entry: string): string | undefined => {
  const segments = entry.split(path.sep).join("/").split("/")
  if (segments.some((segment) => segment.startsWith("."))) return undefined
  const decoded: Array<string> = []
  for (const segment of segments) {
    const value = decodeSegment(segment)
    if (value === undefined) return undefined
    decoded.push(value)
  }
  return decoded.join("/")
}

const resolveFloor = (
  prefix: string,
  options: ListOptions | undefined,
): Effect.Effect<string | undefined, ObjectStoreFailure> =>
  Effect.gen(function* () {
    let floor: string | undefined
    const cursor = options?.cursor
    if (cursor !== undefined) {
      const decoded = yield* Schema.decodeEffect(listingCursor)(cursor).pipe(
        Effect.mapError(() => failure("list", prefix, "invalid-response", "Invalid listing cursor")),
      )
      if (decoded[0] !== prefix || !decoded[1].startsWith(prefix)) {
        return yield* failure("list", prefix, "invalid-response", "Listing cursor belongs to another prefix")
      }
      floor = decoded[1]
    }
    const startAfter = options?.startAfter
    if (startAfter !== undefined && (floor === undefined || startAfter > floor)) floor = startAfter
    return floor
  })

export const make = (
  options: Options,
): Effect.Effect<Service, ObjectStoreFailure, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const crypto = yield* Crypto.Crypto
    const timeoutMs = options.requestTimeoutMs ?? 30_000
    const pageSize = options.pageSize ?? 1000
    if (
      options.dir.length === 0 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1
    ) {
      return yield* failure(
        "initialize",
        "",
        "invalid-response",
        "dir must be nonempty and pageSize and requestTimeoutMs must be positive safe integers",
      )
    }
    yield* fs
      .makeDirectory(options.dir, { recursive: true })
      .pipe(Effect.mapError((cause) => mapError("initialize", options.dir, cause)))
    const root = yield* fs
      .realPath(options.dir)
      .pipe(Effect.mapError((cause) => mapError("initialize", options.dir, cause)))

    const keyToPath = (operation: string, key: string): Effect.Effect<string, ObjectStoreFailure> =>
      Effect.suspend(() => {
        const segments = key.split("/").map(encodeSegment)
        return segments.some((segment) => encoder.encode(segment).length > 255)
          ? Effect.fail(failure(operation, key, "invalid-response", "Object key exceeds filesystem name limits"))
          : Effect.succeed(path.join(root, ...segments))
      })

    const etag = (info: FileSystem.File.Info): string =>
      `${info.size}:${Option.match(info.mtime, { onNone: () => 0, onSome: (at) => at.getTime() })}:${Option.getOrElse(info.ino, () => 0)}`

    const read = (key: string, readOptions: ReadOptions) =>
      withDeadline(
        "read",
        key,
        timeoutMs,
        Effect.gen(function* () {
          yield* Effect.try({
            try: () => checkKey("read", key),
            catch: (cause) => mapError("read", key, cause),
          })
          yield* validateReadOptions({ key, options: readOptions })
          const target = yield* keyToPath("read", key)
          const info = yield* fs.stat(target)
          if (info.type !== "File") return undefined
          const size = Number(info.size)
          if (!Number.isSafeInteger(size)) {
            return yield* failure("read", key, "invalid-response", "Stored object size is not a safe integer")
          }
          const token = etag(info)
          const range = readOptions.range
          if (range !== undefined) {
            if (range.offset >= size) {
              return yield* failure("read", key, "invalid-response", "Requested range starts beyond stored bytes")
            }
            const length = Math.min(range.length, size - range.offset)
            const bytes = yield* Effect.scoped(
              Effect.gen(function* () {
                const file = yield* fs.open(target, { flag: "r" })
                yield* file.seek(range.offset, "start")
                const chunks: Array<Uint8Array> = []
                let remaining = length
                while (remaining > 0) {
                  const chunk = yield* file.readAlloc(remaining)
                  if (Option.isNone(chunk)) break
                  chunks.push(chunk.value)
                  remaining -= chunk.value.length
                }
                const collected = new Uint8Array(length - remaining)
                let offset = 0
                for (const chunk of chunks) {
                  collected.set(chunk, offset)
                  offset += chunk.length
                }
                return collected
              }),
            )
            return { bytes, etag: token } satisfies StoredObject
          }
          if (size > readOptions.maxBytes) {
            return yield* failure(
              "read",
              key,
              "limit",
              `Stored object size ${size} exceeds the ${readOptions.maxBytes}-byte read budget`,
            )
          }
          return { bytes: yield* fs.readFile(target), etag: token } satisfies StoredObject
        }).pipe(
          Effect.catchTag("PlatformError", (cause) =>
            isAbsent(cause) ? Effect.as(Effect.void, undefined) : Effect.fail(mapError("read", key, cause)),
          ),
        ),
      )

    const create = (key: string, bytes: Uint8Array) =>
      withDeadline(
        "create",
        key,
        timeoutMs,
        Effect.gen(function* () {
          yield* Effect.try({
            try: () => checkKey("create", key),
            catch: (cause) => mapError("create", key, cause),
          })
          const target = yield* keyToPath("create", key)
          const parent = path.dirname(target)
          const tmp = path.join(parent, `.tmp-${yield* crypto.randomUUIDv4}`)
          yield* fs.makeDirectory(parent, { recursive: true })
          yield* Effect.scoped(
            Effect.gen(function* () {
              const file = yield* fs.open(tmp, { flag: "wx", mode: 0o666 })
              if (bytes.length > 0) yield* file.writeAll(bytes)
              yield* file.sync
            }),
          )
          const outcome = yield* fs.link(tmp, target).pipe(
            Effect.as("created" as const),
            Effect.catchTag("PlatformError", (cause) =>
              cause.reason._tag === "AlreadyExists" ? Effect.succeed("conflict" as const) : Effect.fail(cause),
            ),
          )
          yield* fs.remove(tmp, { force: true }).pipe(Effect.ignore)
          return outcome
        }).pipe(
          Effect.catchTag("PlatformError", (cause) =>
            Effect.fail(
              cause.reason._tag === "BadResource"
                ? failure("create", key, "invalid-response", "A stored object occupies a segment of this key")
                : mapError("create", key, cause),
            ),
          ),
        ),
      )

    const list = (prefix: string, listOptions?: ListOptions) =>
      withDeadline(
        "list",
        prefix,
        timeoutMs,
        Effect.gen(function* () {
          const floor = yield* resolveFloor(prefix, listOptions)
          const dirPart = prefix.slice(0, prefix.lastIndexOf("/") + 1)
          const walkRoot =
            dirPart.length === 0 ? root : path.join(root, ...dirPart.split("/").filter(Boolean).map(encodeSegment))
          const entries = yield* fs.readDirectory(walkRoot, { recursive: true })
          const keys: Array<string> = []
          for (const entry of entries) {
            const suffix = decodeEntry(path, entry)
            if (suffix === undefined) continue
            const key = dirPart + suffix
            if (!key.startsWith(prefix) || (floor !== undefined && key <= floor)) continue
            const info = yield* fs
              .stat(path.join(walkRoot, entry))
              .pipe(
                Effect.catchTag("PlatformError", (cause) =>
                  isAbsent(cause) ? Effect.as(Effect.void, undefined) : Effect.fail(cause),
                ),
              )
            if (info?.type !== "File") continue
            keys.push(key)
          }
          keys.sort()
          const page = keys.slice(0, pageSize)
          const lastKey = page[page.length - 1]
          const result: ObjectPage =
            keys.length > pageSize && lastKey !== undefined
              ? { keys: page, cursor: encodeListingCursor([prefix, lastKey]) }
              : { keys: page }
          return result
        }).pipe(
          Effect.catchTag("PlatformError", (cause) =>
            isAbsent(cause)
              ? Effect.succeed({ keys: [] } satisfies ObjectPage)
              : Effect.fail(mapError("list", prefix, cause)),
          ),
        ),
      )

    return { capabilities, read, create, list } satisfies Service
  })

/** Single-host canonical objects in a local directory. @experimental */
export const layer = (
  options: Options,
): Layer.Layer<ObjectStore, ObjectStoreFailure, FileSystem.FileSystem | Path.Path | Crypto.Crypto> =>
  Layer.effect(ObjectStore, make(options))

/** Removal is a separate maintenance capability, never a normal commit. @experimental */
export const makeMaintenance = (
  options: Pick<Options, "dir" | "requestTimeoutMs">,
): Effect.Effect<
  { readonly remove: (key: string) => Effect.Effect<void, ObjectStoreFailure> },
  ObjectStoreFailure,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const timeoutMs = options.requestTimeoutMs ?? 30_000
    const root = yield* fs
      .realPath(options.dir)
      .pipe(Effect.mapError((cause) => mapError("initialize", options.dir, cause)))
    return {
      remove: (key) =>
        withDeadline(
          "remove",
          key,
          timeoutMs,
          Effect.gen(function* () {
            yield* Effect.try({
              try: () => checkKey("remove", key),
              catch: (cause) => mapError("remove", key, cause),
            })
            const target = path.join(root, ...key.split("/").map(encodeSegment))
            yield* fs.remove(target, { force: true })
          }).pipe(
            Effect.catchTag("PlatformError", (cause) =>
              isAbsent(cause) ? Effect.void : Effect.fail(mapError("remove", key, cause)),
            ),
          ),
        ),
    }
  })

/** @experimental */
export const layerMaintenance = (
  options: Pick<Options, "dir" | "requestTimeoutMs">,
): Layer.Layer<ObjectMaintenance, ObjectStoreFailure, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(ObjectMaintenance, makeMaintenance(options))
