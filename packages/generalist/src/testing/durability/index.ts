import { Deferred, Effect, Fiber, Ref, Result, Schema, Scope } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import { ObjectStoreFailure, validateReadOptions, type Service, type StoredObject } from "../../durability/object-store.js"

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

interface Bucket {
  readonly objects: Map<string, StoredObject>
  revision: bigint
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
  new ObjectStoreFailure({ operation, key, reason, message })

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
export const make = (options: { readonly pageSize?: number } = {}): Effect.Effect<Simulator, ObjectStoreFailure> =>
  Effect.gen(function* () {
    const pageSize = options.pageSize ?? 1000
    if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
      return yield* Effect.fail(failure("initialize", "", "invalid-response", "pageSize must be a positive safe integer"))
    }
    const bucket = yield* Ref.make<Bucket>({ objects: new Map(), revision: 0n })
    const maintenance: Client["maintenance"] = {
      remove: (key) => Ref.update(bucket, (current) => {
        current.objects.delete(key)
        return current
      }),
    }
    const publish = (key: string, bytes: Uint8Array): Effect.Effect<"created" | "conflict"> =>
      Ref.modify(bucket, (current) => {
        if (current.objects.has(key)) return ["conflict", current]
        current.revision += 1n
        current.objects.set(key, { bytes, etag: `test-object-${current.revision}` })
        return ["created", current]
      })
    const connect: Effect.Effect<Client> = Effect.gen(function* () {
      const createFaults = yield* Ref.make<Array<CreateFault>>([])
      const readFaults = yield* Ref.make<Array<ReadFault>>([])
      const store: Service = {
        capabilities: { conditionalCreate: true, strongReadAfterWrite: true, consistentListing: true },
        read: (key, options) => Effect.gen(function* () {
          yield* validateReadOptions(key, options)
          const fault = yield* takeFault(readFaults, key)
          if (fault !== undefined) {
            return yield* Effect.fail(failure("read", key, fault.reason, "Injected read failure"))
          }
          const object = (yield* Ref.get(bucket)).objects.get(key)
          if (object === undefined) return undefined
          if (options.range === undefined && object.bytes.byteLength > options.maxBytes) {
            return yield* Effect.fail(failure("read", key, "limit", `Object exceeds ${options.maxBytes} bytes`))
          }
          if (options.range !== undefined && options.range.offset >= object.bytes.byteLength) {
            return yield* Effect.fail(failure("read", key, "invalid-response", "Requested range starts at or beyond object EOF"))
          }
          const bytes = options.range === undefined
            ? object.bytes.slice()
            : object.bytes.slice(options.range.offset, options.range.offset + options.range.length)
          return { bytes, etag: object.etag }
        }),
        create: (key, bytes) => Effect.gen(function* () {
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
            return yield* Effect.fail(failure("create", key, fault.reason, "Injected rejection before publication"))
          }
          if (fault?.kind === "conflict") {
            yield* publish(key, fault.bytes)
            return "conflict"
          }
          const result = yield* publish(key, payload)
          if (result === "created" && fault?.kind === "failure" && fault.phase === "after") {
            return yield* Effect.fail(failure("create", key, fault.reason, "Injected lost acknowledgement after publication"))
          }
          return result
        }),
        list: (prefix, cursor) => Effect.gen(function* () {
          let after: string | undefined
          if (cursor !== undefined) {
            const decoded = yield* Effect.try({
              try: () => decodeCursor(cursor),
              catch: () => failure("list", prefix, "invalid-response", "Invalid listing cursor"),
            })
            if (decoded[0] !== prefix || !decoded[1].startsWith(prefix)) {
              return yield* Effect.fail(failure("list", prefix, "invalid-response", "Listing cursor belongs to another prefix"))
            }
            after = decoded[1]
          }
          return yield* Ref.modify(bucket, (current) => {
            const keys = Array.from(current.objects.keys())
              .filter((key) => key.startsWith(prefix) && (after === undefined || key > after))
              .sort()
            const page = keys.slice(0, pageSize)
            const last = page[page.length - 1]
            return [
              keys.length > pageSize && last !== undefined
                ? { keys: page, cursor: JSON.stringify([prefix, last]) }
                : { keys: page },
              current,
            ]
          })
        }),
      }
      const faults: Faults = {
        pauseNextCreate: (key) => Effect.gen(function* () {
          const entered = yield* Deferred.make<{ readonly key: string; readonly bytes: Uint8Array }>()
          const release = yield* Deferred.make<void>()
          yield* enqueue(createFaults, { kind: "pause", key, entered, release })
          return { entered: Deferred.await(entered), release: Deferred.succeed(release, undefined).pipe(Effect.asVoid) }
        }),
        dispatchNextCreate: (key) => Effect.gen(function* () {
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

        failNextCreate: (input) => enqueue(createFaults, {
          kind: "failure", key: input.key, phase: input.phase, reason: input.reason ?? "timeout",
        }),
        conflictNextCreate: (key, bytes) => Effect.suspend(() =>
          enqueue(createFaults, { kind: "conflict", key, bytes: bytes.slice() }),
        ),
        failNextRead: (input = {}) => enqueue(readFaults, { key: input.key, reason: input.reason ?? "unavailable" }),
        corrupt: (key, bytes) => Effect.gen(function* () {
          const found = yield* Ref.modify(bucket, (current) => {
            const object = current.objects.get(key)
            if (object === undefined) return [false, current]
            current.objects.set(key, { bytes: bytes.slice(), etag: object.etag })
            return [true, current]
          })
          if (!found) {
            return yield* Effect.fail(failure("corrupt", key, "invalid-response", "Cannot corrupt a missing object"))
          }
        }),
      }
      return { store, maintenance, faults }
    })
    return { ...yield* connect, connect }
  })

/** Observable provider-contract violation, distinct from transport failure. @experimental */
export class ObjectStoreConformanceFailure extends ActionableTaggedError<ObjectStoreConformanceFailure>()(
  "generalist/testing/durability/ObjectStoreConformanceFailure",
  {
    check: Schema.String,
    message: Schema.String,
    hint: errorHint("Do not use this provider for canonical durability until its object-storage guarantees conform."),
  },
) {}

/** Supply isolated empty prefixes and genuinely new provider clients. @experimental */
export interface ConformanceOptions<E = never, R = never> {
  readonly connect: Effect.Effect<Service, E, R>
  readonly prefix: string
}

const check = (condition: boolean, name: string, message: string): Effect.Effect<void, ObjectStoreConformanceFailure> =>
  condition ? Effect.void : Effect.fail(new ObjectStoreConformanceFailure({ check: name, message }))

const equalBytes = (left: Uint8Array | undefined, right: Uint8Array): boolean =>
  left !== undefined && left.length === right.length && left.every((value, index) => value === right[index])

/** Concurrent independent writers must produce exactly one immutable winner. @experimental */
export const atomicCreates = <E, R>(options: ConformanceOptions<E, R>) => Effect.gen(function* () {
  const key = `${options.prefix}/atomic/slot`
  const payloads = Array.from({ length: 8 }, (_, index) => Uint8Array.of(index, 0, 255))
  const clients = yield* Effect.forEach(payloads, (payload) =>
    options.connect.pipe(Effect.map((client) => ({ client, payload }))),
  )
  const start = yield* Deferred.make<void>()
  const writers = yield* Effect.forEach(clients, ({ client, payload }) =>
    Effect.forkChild(Deferred.await(start).pipe(
      Effect.andThen(client.create(key, payload)),
      Effect.map((outcome) => ({ outcome, payload })),
    )),
  )
  yield* Deferred.succeed(start, undefined)
  const outcomes = yield* Effect.forEach(writers, Fiber.join)
  const winners = outcomes.filter(({ outcome }) => outcome === "created")
  const winner = winners[0]
  if (winners.length !== 1 || winner === undefined) {
    return yield* Effect.fail(new ObjectStoreConformanceFailure({
      check: "atomicCreates", message: "Conditional creates did not produce exactly one winner",
    }))
  }
  const fresh = yield* options.connect
  const stored = yield* fresh.read(key, { maxBytes: winner.payload.byteLength })
  yield* check(equalBytes(stored?.bytes, winner.payload), "atomicCreates", "Stored bytes do not belong to the acknowledged winner")
  yield* check((yield* fresh.create(key, Uint8Array.of(99))) === "conflict", "atomicCreates", "An existing key was overwritten")
  yield* check(equalBytes((yield* fresh.read(key, { maxBytes: winner.payload.byteLength }))?.bytes, winner.payload), "atomicCreates", "Conflicting create changed the winner's bytes")
})

/** A new client must see acknowledged writes and distinguish absence. @experimental */
export const freshReads = <E, R>(options: ConformanceOptions<E, R>) => Effect.gen(function* () {
  const key = `${options.prefix}/fresh/世界 + %?#`
  const client = yield* options.connect
  yield* check((yield* client.read(key, { maxBytes: 3 })) === undefined, "freshReads", "Unused key was not missing")
  const bytes = Uint8Array.of(10, 20, 30)
  yield* check((yield* client.create(key, bytes)) === "created", "freshReads", "Fresh key could not be created")
  const fresh = yield* options.connect
  yield* check(equalBytes((yield* fresh.read(key, { maxBytes: bytes.byteLength }))?.bytes, bytes), "freshReads", "Acknowledged bytes were invisible to a fresh client")
  yield* check((yield* fresh.read(`${key}/missing`, { maxBytes: 1 })) === undefined, "freshReads", "Missing object was not distinguishable")
})

/** Complete paginated discovery must neither skip nor duplicate acknowledged keys. @experimental */
export const listing = <E, R>(options: ConformanceOptions<E, R> & { readonly count?: number }) => Effect.gen(function* () {
  const count = options.count ?? 1003
  yield* check(Number.isSafeInteger(count) && count > 0, "listing", "count must be a positive safe integer")
  const prefix = `${options.prefix}/listing/`
  const keys = Array.from({ length: count }, (_, index) => `${prefix}${index.toString().padStart(8, "0")}`)
  const client = yield* options.connect
  yield* Effect.forEach(keys, (key) => client.create(key, Uint8Array.of(1)).pipe(
    Effect.flatMap((outcome) => check(outcome === "created", "listing", "Listing requires an isolated unused prefix")),
  ), { concurrency: 16, discard: true })
  yield* client.create(`${options.prefix}/outside`, Uint8Array.of(2))
  const fresh = yield* options.connect
  const found = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    const page = yield* fresh.list(prefix, cursor)
    for (const key of page.keys) {
      yield* check(key.startsWith(prefix), "listing", "Listing included a key outside the requested prefix")
      yield* check(!found.has(key), "listing", "Listing returned a duplicate key")
      found.add(key)
    }
    cursor = page.cursor
    if (cursor !== undefined) {
      yield* check(!cursors.has(cursor), "listing", "Listing repeated a continuation cursor")
      cursors.add(cursor)
    }
  } while (cursor !== undefined)
  yield* check(found.size === keys.length && keys.every((key) => found.has(key)), "listing", "Listing omitted or invented acknowledged keys")
})

/** Binary and empty objects must round-trip without aliases into stored bytes. @experimental */
export const byteIntegrity = <E, R>(options: ConformanceOptions<E, R>) => Effect.gen(function* () {
  const client = yield* options.connect
  const expected = Uint8Array.from({ length: 256 }, (_, index) => index)
  const backing = new Uint8Array(258)
  backing.set(expected, 1)
  const input = backing.subarray(1, 257)
  const key = `${options.prefix}/integrity/binary`
  yield* check((yield* client.create(key, input)) === "created", "byteIntegrity", "Binary object was not created")
  input.fill(0)
  const first = yield* client.read(key, { maxBytes: expected.byteLength })
  yield* check(equalBytes(first?.bytes, expected), "byteIntegrity", "Input mutation changed stored bytes or binary bytes were altered")
  first?.bytes.fill(0)
  const fresh = yield* options.connect
  const second = yield* fresh.read(key, { maxBytes: expected.byteLength })
  yield* check(equalBytes(second?.bytes, expected), "byteIntegrity", "Returned bytes alias stored bytes")
  yield* check(first?.etag === second?.etag, "byteIntegrity", "Unchanged immutable object changed its conditional token")
  const limited = yield* Effect.result(fresh.read(key, { maxBytes: expected.byteLength - 1 }))
  yield* check(Result.isFailure(limited) && limited.failure.reason === "limit", "byteIntegrity", "An oversized full read did not fail with a typed byte-limit error")
  const range = yield* fresh.read(key, { maxBytes: 3, range: { offset: 128, length: 3 } })
  yield* check(equalBytes(range?.bytes, expected.subarray(128, 131)) && range?.etag === second?.etag, "byteIntegrity", "A bounded range did not return the requested immutable bytes")
  const eof = yield* fresh.read(key, { maxBytes: 3, range: { offset: 255, length: 3 } })
  yield* check(equalBytes(eof?.bytes, expected.subarray(255)), "byteIntegrity", "A range crossing EOF did not return the remaining bytes")
  const exhausted = yield* Effect.result(fresh.read(key, { maxBytes: 1, range: { offset: expected.byteLength, length: 1 } }))
  yield* check(Result.isFailure(exhausted) && exhausted.failure.reason === "invalid-response", "byteIntegrity", "An unsatisfiable range was not rejected as a typed invalid response")
  const empty = `${options.prefix}/integrity/empty`
  yield* check((yield* client.create(empty, new Uint8Array())) === "created", "byteIntegrity", "Empty object was not created")
  yield* check(equalBytes((yield* fresh.read(empty, { maxBytes: 1 }))?.bytes, new Uint8Array()), "byteIntegrity", "Empty object was confused with absence")
})

/** Pass initialization configured with unsupported conditional-create semantics. @experimental */
export const unsupportedPreconditions = <A, R>(initialize: Effect.Effect<A, ObjectStoreFailure, R>) =>
  Effect.gen(function* () {
    const result = yield* Effect.result(initialize)
    yield* check(
      Result.isFailure(result) && result.failure.reason === "invalid-response",
      "unsupportedPreconditions",
      "Initialization did not reject unsupported conditional-create semantics with a typed invalid-response failure",
    )
  })
