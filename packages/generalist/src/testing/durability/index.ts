import { Deferred, Effect, Layer, Ref, Schema, Scope } from "effect"
import {
  ObjectStoreFailure,
  ObjectStore,
  validateReadOptions,
  type Service,
  type StoredObject,
} from "../../durability/object-store.js"

/** A create held before publication until the test explicitly releases it. @experimental */
export interface CreatePause {
  readonly entered: Effect.Effect<{ readonly key: string; readonly bytes: Uint8Array }>
  readonly release: Effect.Effect<void>
}

/** A provider request owned by the fixture scope after its caller is interrupted. @experimental */
export interface CreateDispatch {
  readonly entered: Effect.Effect<{ readonly key: string; readonly bytes: Uint8Array }>
  readonly release: Effect.Effect<void>
  readonly completed: Effect.Effect<"created" | "conflict", ObjectStoreFailure>
}

/** One-shot faults are local to a client; corruption changes the shared bucket. @experimental */
export interface Faults {
  readonly pauseNextCreate: (key?: string) => Effect.Effect<CreatePause>
  /** Fork the provider request into the current fixture scope before awaiting it. @experimental */
  readonly dispatchNextCreate: (key?: string) => Effect.Effect<CreateDispatch, never, Scope.Scope>
  readonly failNextCreate: (options: {
    readonly key?: string
    readonly phase: "before" | "after"
    readonly reason?: ObjectStoreFailure["reason"]
  }) => Effect.Effect<void>
  readonly conflictNextCreate: (key: string, bytes: Uint8Array) => Effect.Effect<void>
  readonly failNextRead: (options?: {
    readonly key?: string
    readonly reason?: ObjectStoreFailure["reason"]
  }) => Effect.Effect<void>
  readonly corrupt: (key: string, bytes: Uint8Array) => Effect.Effect<void, ObjectStoreFailure>
}

/** An independent transport client, with a separate fault queue. @experimental */
export interface Client {
  readonly store: Service
  readonly maintenance: { readonly remove: (key: string) => Effect.Effect<void, ObjectStoreFailure> }
  readonly faults: Faults
}

/** Testing-only object storage; fresh clients share bytes, never fault queues. @experimental */
export interface Simulator extends Client {
  readonly connect: Effect.Effect<Client>
}

/** Provide a simulator client to the production object Runtime in a test scope. @experimental */
export const layer = (client: Client): Layer.Layer<ObjectStore> => Layer.succeed(ObjectStore, client.store)

interface Bucket {
  readonly objects: Map<string, StoredObject>
  readonly keys: Array<string>
  revision: bigint
}

const keyIndex = (keys: ReadonlyArray<string>, key: string): number => {
  let start = 0
  let end = keys.length
  while (start < end) {
    const middle = start + Math.floor((end - start) / 2)
    if (keys[middle]! < key) start = middle + 1
    else end = middle
  }
  return start
}

type CreateFault =
  | {
      readonly kind: "pause"
      readonly key: string | undefined
      readonly entered: Deferred.Deferred<{ readonly key: string; readonly bytes: Uint8Array }>
      readonly release: Deferred.Deferred<void>
    }
  | {
      readonly kind: "dispatch"
      readonly key: string | undefined
      readonly entered: Deferred.Deferred<{ readonly key: string; readonly bytes: Uint8Array }>
      readonly release: Deferred.Deferred<void>
      readonly completed: Deferred.Deferred<"created" | "conflict", ObjectStoreFailure>
      readonly scope: Scope.Scope
    }
  | {
      readonly kind: "failure"
      readonly key: string | undefined
      readonly phase: "before" | "after"
      readonly reason: ObjectStoreFailure["reason"]
    }
  | { readonly kind: "conflict"; readonly key: string; readonly bytes: Uint8Array }

interface ReadFault {
  readonly key: string | undefined
  readonly reason: ObjectStoreFailure["reason"]
}

const failure = (operation: string, key: string, reason: ObjectStoreFailure["reason"], message: string) =>
  ObjectStoreFailure.make({ operation, key, reason, message })

const takeFault = <A extends { readonly key: string | undefined }>(
  faults: Ref.Ref<Array<A>>,
  key: string,
): Effect.Effect<A | undefined> =>
  Ref.modify(faults, (queue) => {
    const index = queue.findIndex((fault) => fault.key === undefined || fault.key === key)
    return [index < 0 ? undefined : queue.splice(index, 1)[0], queue]
  })

const enqueue = <A>(faults: Ref.Ref<Array<A>>, fault: A): Effect.Effect<void> =>
  Ref.update(faults, (queue) => {
    queue.push(fault)
    return queue
  })

const decodeCursor = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Tuple([Schema.String, Schema.String])))

/**
 * Creates a private test bucket and its first client. Each evaluation of `connect`
 * returns an independent client over the same bucket. Faults are consumed by the
 * first matching request, in queue order. No timers or process-global state are used.
 * @experimental
 */
export const make = (
  configuration: { readonly pageSize?: number } = {},
): Effect.Effect<Simulator, ObjectStoreFailure> =>
  Effect.gen(function* () {
    const pageSize = configuration.pageSize ?? 1000
    if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
      return yield* failure("initialize", "", "invalid-response", "pageSize must be a positive safe integer")
    }
    const bucket = yield* Ref.make<Bucket>({ objects: new Map(), keys: [], revision: 0n })
    const maintenance: Client["maintenance"] = {
      remove: (key) =>
        Ref.update(bucket, (current) => {
          if (current.objects.delete(key)) current.keys.splice(keyIndex(current.keys, key), 1)
          return current
        }),
    }
    const publish = (key: string, bytes: Uint8Array): Effect.Effect<"created" | "conflict"> =>
      Ref.modify(bucket, (current) => {
        if (current.objects.has(key)) return ["conflict", current]
        current.revision += 1n
        current.objects.set(key, { bytes, etag: `test-object-${current.revision}` })
        current.keys.splice(keyIndex(current.keys, key), 0, key)
        return ["created", current]
      })
    const connect: Effect.Effect<Client> = Effect.gen(function* () {
      const createFaults = yield* Ref.make<Array<CreateFault>>([])
      const readFaults = yield* Ref.make<Array<ReadFault>>([])
      const store: Service = {
        capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
        read: (key, options) =>
          Effect.gen(function* () {
            yield* validateReadOptions({ key, options })
            const fault = yield* takeFault(readFaults, key)
            if (fault !== undefined) {
              return yield* failure("read", key, fault.reason, "Injected read failure")
            }
            const object = (yield* Ref.get(bucket)).objects.get(key)
            if (object === undefined) return undefined
            if (options.range === undefined && object.bytes.byteLength > options.maxBytes) {
              return yield* failure("read", key, "limit", `Object exceeds ${options.maxBytes} bytes`)
            }
            if (options.range !== undefined && options.range.offset >= object.bytes.byteLength) {
              return yield* failure("read", key, "invalid-response", "Requested range starts at or beyond object EOF")
            }
            const bytes =
              options.range === undefined
                ? object.bytes.slice()
                : object.bytes.slice(options.range.offset, options.range.offset + options.range.length)
            return { bytes, etag: object.etag }
          }),
        create: (key, bytes) =>
          Effect.gen(function* () {
            const payload = bytes.slice()
            const fault = yield* takeFault(createFaults, key)
            if (fault?.kind === "dispatch") {
              const provider = Effect.gen(function* () {
                yield* Deferred.succeed(fault.entered, { key, bytes: payload.slice() })
                yield* Deferred.await(fault.release)
                return yield* publish(key, payload)
              }).pipe(
                Effect.exit,
                Effect.flatMap((exit) => Deferred.done(fault.completed, exit).pipe(Effect.asVoid)),
              )
              yield* Effect.forkIn(provider, fault.scope, { startImmediately: true })
              return yield* Deferred.await(fault.completed)
            }

            if (fault?.kind === "pause") {
              yield* Deferred.succeed(fault.entered, { key, bytes: payload.slice() })
              yield* Deferred.await(fault.release)
            }
            if (fault?.kind === "failure" && fault.phase === "before") {
              return yield* failure("create", key, fault.reason, "Injected rejection before publication")
            }
            if (fault?.kind === "conflict") {
              yield* publish(key, fault.bytes)
              return "conflict"
            }
            const result = yield* publish(key, payload)
            if (result === "created" && fault?.kind === "failure" && fault.phase === "after") {
              return yield* failure("create", key, fault.reason, "Injected lost acknowledgement after publication")
            }
            return result
          }),
        list: (prefix, options) =>
          Effect.gen(function* () {
            let after: string | undefined
            const cursor = options?.cursor
            if (cursor !== undefined) {
              const decoded = yield* Effect.try({
                try: () => decodeCursor(cursor),
                catch: () => failure("list", prefix, "invalid-response", "Invalid listing cursor"),
              })
              if (decoded[0] !== prefix || !decoded[1].startsWith(prefix)) {
                return yield* failure("list", prefix, "invalid-response", "Listing cursor belongs to another prefix")
              }
              after = decoded[1]
            }
            return yield* Ref.modify(bucket, (current) => {
              // Cursor and startAfter are both strict lower bounds; the greater one wins.
              const startAfter = options?.startAfter
              const floor =
                after !== undefined && (startAfter === undefined || after >= startAfter) ? after : startAfter
              const bound = floor !== undefined && floor > prefix ? floor : prefix
              let start = keyIndex(current.keys, bound)
              if (bound === floor && current.keys[start] === bound) start += 1
              const page: Array<string> = []
              let index = start
              while (page.length < pageSize) {
                if (current.keys[index]?.startsWith(prefix) !== true) break
                page.push(current.keys[index++]!)
              }
              const last = page[page.length - 1]
              return [
                current.keys[index]?.startsWith(prefix) === true && last !== undefined
                  ? { keys: page, cursor: JSON.stringify([prefix, last]) }
                  : { keys: page },
                current,
              ]
            })
          }),
      }
      const faults: Faults = {
        pauseNextCreate: (key) =>
          Effect.gen(function* () {
            const entered = yield* Deferred.make<{ readonly key: string; readonly bytes: Uint8Array }>()
            const release = yield* Deferred.make<void>()
            yield* enqueue(createFaults, { kind: "pause", key, entered, release })
            return {
              entered: Deferred.await(entered),
              release: Deferred.succeed(release, undefined).pipe(Effect.asVoid),
            }
          }),
        dispatchNextCreate: (key) =>
          Effect.gen(function* () {
            const scope = yield* Effect.scope
            const entered = yield* Deferred.make<{ readonly key: string; readonly bytes: Uint8Array }>()
            const release = yield* Deferred.make<void>()
            const completed = yield* Deferred.make<"created" | "conflict", ObjectStoreFailure>()
            yield* enqueue(createFaults, { kind: "dispatch", key, entered, release, completed, scope })
            return {
              entered: Deferred.await(entered),
              release: Deferred.succeed(release, undefined).pipe(Effect.asVoid),
              completed: Deferred.await(completed),
            }
          }),

        failNextCreate: (input) =>
          enqueue(createFaults, {
            kind: "failure",
            key: input.key,
            phase: input.phase,
            reason: input.reason ?? "timeout",
          }),
        conflictNextCreate: (key, bytes) =>
          Effect.suspend(() => enqueue(createFaults, { kind: "conflict", key, bytes: bytes.slice() })),
        failNextRead: (input = {}) => enqueue(readFaults, { key: input.key, reason: input.reason ?? "unavailable" }),
        corrupt: (key, bytes) =>
          Effect.gen(function* () {
            const found = yield* Ref.modify(bucket, (current) => {
              const object = current.objects.get(key)
              if (object === undefined) return [false, current]
              current.objects.set(key, { bytes: bytes.slice(), etag: object.etag })
              return [true, current]
            })
            if (!found) {
              return yield* failure("corrupt", key, "invalid-response", "Cannot corrupt a missing object")
            }
          }),
      }
      return { store, maintenance, faults }
    })
    return { ...(yield* connect), connect }
  })

export {
  ObjectStoreConformanceFailure,
  atomicCreates,
  freshReads,
  caseEquivalentKeys,
  listing,
  byteIntegrity,
  unsupportedPreconditions,
  type ConformanceOptions,
} from "./conformance.js"
