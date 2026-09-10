import { Deferred, Effect, Fiber, Result, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import type { ObjectStoreFailure, Service } from "../../durability/object-store.js"

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

const check = (
  condition: boolean,
  name: string,
  message: string,
): Effect.Effect<void, ObjectStoreConformanceFailure> =>
  condition ? Effect.void : Effect.fail(ObjectStoreConformanceFailure.make({ check: name, message }))

const equalBytes = (left: Uint8Array | undefined, right: Uint8Array): boolean =>
  left !== undefined && left.length === right.length && left.every((value, index) => value === right[index])

/** Concurrent independent writers must produce exactly one immutable winner. @experimental */
export const atomicCreates = <E, R>(options: ConformanceOptions<E, R>) =>
  Effect.gen(function* () {
    const key = `${options.prefix}/atomic/slot`
    const payloads = Array.from({ length: 8 }, (_, index) => Uint8Array.of(index, 0, 255))
    const clients = yield* Effect.forEach(payloads, (payload) =>
      options.connect.pipe(Effect.map((client) => ({ client, payload }))),
    )
    const start = yield* Deferred.make<void>()
    const writers = yield* Effect.forEach(clients, ({ client, payload }) =>
      Effect.forkChild(
        Deferred.await(start).pipe(
          Effect.andThen(client.create(key, payload)),
          Effect.map((outcome) => ({ outcome, payload })),
        ),
      ),
    )
    yield* Deferred.succeed(start, undefined)
    const outcomes = yield* Effect.forEach(writers, Fiber.join)
    const winners = outcomes.filter(({ outcome }) => outcome === "created")
    const winner = winners[0]
    if (winners.length !== 1 || winner === undefined) {
      return yield* ObjectStoreConformanceFailure.make({
        check: "atomicCreates",
        message: "Conditional creates did not produce exactly one winner",
      })
    }
    const fresh = yield* options.connect
    const stored = yield* fresh.read(key, { maxBytes: winner.payload.byteLength })
    yield* check(
      equalBytes(stored?.bytes, winner.payload),
      "atomicCreates",
      "Stored bytes do not belong to the acknowledged winner",
    )
    yield* check(
      (yield* fresh.create(key, Uint8Array.of(99))) === "conflict",
      "atomicCreates",
      "An existing key was overwritten",
    )
    yield* check(
      equalBytes((yield* fresh.read(key, { maxBytes: winner.payload.byteLength }))?.bytes, winner.payload),
      "atomicCreates",
      "Conflicting create changed the winner's bytes",
    )
  })

/** A new client must see acknowledged writes and distinguish absence. @experimental */
export const freshReads = <E, R>(options: ConformanceOptions<E, R>) =>
  Effect.gen(function* () {
    const key = `${options.prefix}/fresh/世界 + %?#`
    const client = yield* options.connect
    yield* check((yield* client.read(key, { maxBytes: 3 })) === undefined, "freshReads", "Unused key was not missing")
    const bytes = Uint8Array.of(10, 20, 30)
    yield* check((yield* client.create(key, bytes)) === "created", "freshReads", "Fresh key could not be created")
    const fresh = yield* options.connect
    yield* check(
      equalBytes((yield* fresh.read(key, { maxBytes: bytes.byteLength }))?.bytes, bytes),
      "freshReads",
      "Acknowledged bytes were invisible to a fresh client",
    )
    yield* check(
      (yield* fresh.read(`${key}/missing`, { maxBytes: 1 })) === undefined,
      "freshReads",
      "Missing object was not distinguishable",
    )
  })

/** Complete paginated discovery must neither skip nor duplicate acknowledged keys. @experimental */
export const listing = <E, R>(options: ConformanceOptions<E, R> & { readonly count?: number }) =>
  Effect.gen(function* () {
    const count = options.count ?? 1003
    yield* check(Number.isSafeInteger(count) && count > 0, "listing", "count must be a positive safe integer")
    const prefix = `${options.prefix}/listing/`
    const keys = Array.from({ length: count }, (_, index) => `${prefix}${index.toString().padStart(8, "0")}`)
    const client = yield* options.connect
    yield* Effect.forEach(
      keys,
      (key) =>
        client
          .create(key, Uint8Array.of(1))
          .pipe(
            Effect.flatMap((outcome) =>
              check(outcome === "created", "listing", "Listing requires an isolated unused prefix"),
            ),
          ),
      { concurrency: 16, discard: true },
    )
    yield* client.create(`${options.prefix}/outside`, Uint8Array.of(2))
    const fresh = yield* options.connect
    const found = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const page = yield* fresh.list(prefix, { cursor })
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
    yield* check(
      found.size === keys.length && keys.every((key) => found.has(key)),
      "listing",
      "Listing omitted or invented acknowledged keys",
    )
    const anchor = keys[Math.floor(keys.length / 2)]!
    const tail = new Set<string>()
    let tailCursor: string | undefined
    do {
      const page = yield* fresh.list(prefix, { cursor: tailCursor, startAfter: anchor })
      for (const key of page.keys) {
        yield* check(key > anchor, "listing", "Listing ignored the requested startAfter bound")
        tail.add(key)
      }
      tailCursor = page.cursor
    } while (tailCursor !== undefined)
    yield* check(
      tail.size === keys.length - keys.indexOf(anchor) - 1 &&
        keys.slice(keys.indexOf(anchor) + 1).every((key) => tail.has(key)),
      "listing",
      "A startAfter listing omitted or invented keys after the bound",
    )
  })

/** Binary and empty objects must round-trip without aliases into stored bytes. @experimental */
export const byteIntegrity = <E, R>(options: ConformanceOptions<E, R>) =>
  Effect.gen(function* () {
    const client = yield* options.connect
    const expected = Uint8Array.from({ length: 256 }, (_, index) => index)
    const backing = new Uint8Array(258)
    backing.set(expected, 1)
    const input = backing.subarray(1, 257)
    const key = `${options.prefix}/integrity/binary`
    yield* check((yield* client.create(key, input)) === "created", "byteIntegrity", "Binary object was not created")
    input.fill(0)
    const first = yield* client.read(key, { maxBytes: expected.byteLength })
    yield* check(
      equalBytes(first?.bytes, expected),
      "byteIntegrity",
      "Input mutation changed stored bytes or binary bytes were altered",
    )
    first?.bytes.fill(0)
    const fresh = yield* options.connect
    const second = yield* fresh.read(key, { maxBytes: expected.byteLength })
    yield* check(equalBytes(second?.bytes, expected), "byteIntegrity", "Returned bytes alias stored bytes")
    yield* check(
      first?.etag === second?.etag,
      "byteIntegrity",
      "Unchanged immutable object changed its conditional token",
    )
    const limited = yield* Effect.result(fresh.read(key, { maxBytes: expected.byteLength - 1 }))
    yield* check(
      Result.isFailure(limited) && limited.failure.reason === "limit",
      "byteIntegrity",
      "An oversized full read did not fail with a typed byte-limit error",
    )
    const range = yield* fresh.read(key, { maxBytes: 3, range: { offset: 128, length: 3 } })
    yield* check(
      equalBytes(range?.bytes, expected.subarray(128, 131)) && range?.etag === second?.etag,
      "byteIntegrity",
      "A bounded range did not return the requested immutable bytes",
    )
    const eof = yield* fresh.read(key, { maxBytes: 3, range: { offset: 255, length: 3 } })
    yield* check(
      equalBytes(eof?.bytes, expected.subarray(255)),
      "byteIntegrity",
      "A range crossing EOF did not return the remaining bytes",
    )
    const exhausted = yield* Effect.result(
      fresh.read(key, { maxBytes: 1, range: { offset: expected.byteLength, length: 1 } }),
    )
    yield* check(
      Result.isFailure(exhausted) && exhausted.failure.reason === "invalid-response",
      "byteIntegrity",
      "An unsatisfiable range was not rejected as a typed invalid response",
    )
    const empty = `${options.prefix}/integrity/empty`
    yield* check(
      (yield* client.create(empty, new Uint8Array())) === "created",
      "byteIntegrity",
      "Empty object was not created",
    )
    yield* check(
      equalBytes((yield* fresh.read(empty, { maxBytes: 1 }))?.bytes, new Uint8Array()),
      "byteIntegrity",
      "Empty object was confused with absence",
    )
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
