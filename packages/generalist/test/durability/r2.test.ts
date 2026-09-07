import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import type { ObjectStoreFailure } from "../../src/durability/object-store.js"
import {
  type Bucket,
  type MaintenanceBucket,
  type ObjectBody as Body,
  type ObjectList as Page,
  type ObjectMetadata as Metadata,
  make,
  makeMaintenance,
} from "../../src/durability/r2.js"

// Stateful native API double: conditions decide storage mutation, and reads consume a body stream.
class NativeBucket implements Bucket, MaintenanceBucket {
  readonly objects = new Map<string, { readonly metadata: Metadata; readonly bytes: Uint8Array }>()
  private version = 0

  async get(key: string, options?: { readonly range: { readonly offset: number; readonly length: number } }): Promise<Body | null> {
    const object = this.objects.get(key)
    if (object === undefined) return null
    const requested = options?.range
    if (requested !== undefined && requested.offset >= object.bytes.byteLength) {
      throw new Error("get: Requested byte range is not satisfiable. (10039)")
    }
    const bytes = requested === undefined
      ? object.bytes
      : object.bytes.subarray(requested.offset, requested.offset + requested.length)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2))
        controller.enqueue(bytes.slice(2))
        controller.close()
      },
    })
    return {
      ...object.metadata,
      body,
      ...(requested === undefined ? {} : { range: { offset: requested.offset, length: bytes.byteLength } }),
    }
  }

  async put(
    key: string,
    value: Uint8Array,
    options?: { readonly onlyIf?: { readonly etagDoesNotMatch?: string } },
  ): Promise<Metadata | null> {
    const current = this.objects.get(key)
    const condition = options?.onlyIf?.etagDoesNotMatch
    if (current !== undefined && (condition === "*" || condition === current.metadata.etag)) return null
    const bytes = value.slice()
    const metadata = { key, size: bytes.byteLength, etag: `opaque-upload-${++this.version}` }
    this.objects.set(key, { metadata, bytes })
    return metadata
  }

  async list(options: { readonly prefix: string; readonly cursor?: string }): Promise<Page> {
    return {
      objects: [...this.objects.keys()]
        .filter((key) => key.startsWith(options.prefix))
        .sort()
        .map((key) => ({ key })),
      truncated: false,
    }
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key)
  }
}

// Deliberately corrupt a native response at the protocol boundary, not production data types.
const malformed = <A>(value: unknown): A => value as A

const metadata = { key: "journal/0", size: 3, etag: "opaque-token" }

const failureOf = <A>(effect: Effect.Effect<A, ObjectStoreFailure>) => Effect.flip(effect)

describe("native R2 object transport", () => {
  it.effect("arbitrates independent creators without overwriting the winning bytes", () =>
    Effect.gen(function* () {
      const bucket = new NativeBucket()
      const first = make(bucket)
      const second = make(bucket)
      const firstBytes = new Uint8Array([0, 255, 128, 1, 0])
      const secondBytes = new Uint8Array([8, 9, 10])
      const results = yield* Effect.all(
        [first.create("journal/0", firstBytes), second.create("journal/0", secondBytes)],
        { concurrency: "unbounded" },
      )
      expect(results.filter((result) => result === "created")).toHaveLength(1)
      expect(results.filter((result) => result === "conflict")).toHaveLength(1)
      const winner = results[0] === "created" ? firstBytes : secondBytes
      const committed = yield* make(bucket).read("journal/0", { maxBytes: 1024 })
      expect(committed?.bytes).toEqual(winner)
      expect(yield* second.create("journal/0", new Uint8Array([6]))).toBe("conflict")
      expect(yield* first.read("journal/0", { maxBytes: 1024 })).toEqual(committed)
    }),
  )

  it.effect("reads complete binary bodies and preserves byte views, empty objects, and missing objects", () =>
    Effect.gen(function* () {
      const store = make(new NativeBucket())
      const buffer = new Uint8Array([99, 0, 255, 128, 1, 77])
      yield* store.create("journal/0", buffer.subarray(1, 5))
      expect((yield* store.read("journal/0", { maxBytes: 1024 }))?.bytes).toEqual(new Uint8Array([0, 255, 128, 1]))
      yield* store.create("empty", new Uint8Array())
      expect((yield* store.read("empty", { maxBytes: 1024 }))?.bytes).toEqual(new Uint8Array())
      expect(yield* store.read("absent", { maxBytes: 1024 })).toBeUndefined()
    }),
  )

  it.effect("continues through empty and short truncated pages until the cursor is absent", () =>
    Effect.gen(function* () {
      const bucket = new NativeBucket()
      bucket.list = async ({ prefix, cursor }) => {
        if (prefix !== "journal/") throw new Error("Unexpected namespace")
        switch (cursor) {
          case undefined:
            return { objects: [{ key: "journal/0" }], truncated: true, cursor: "opaque-A" }
          case "opaque-A":
            return { objects: [], truncated: true, cursor: "opaque-B" }
          case "opaque-B":
            return { objects: [{ key: "journal/1" }], truncated: false }
          default:
            throw new Error("Invalid cursor")
        }
      }
      const store = make(bucket)
      const keys: Array<string> = []
      let cursor: string | undefined
      for (let pages = 0; pages < 4; pages++) {
        const page = yield* store.list("journal/", cursor)
        keys.push(...page.keys)
        cursor = page.cursor
        if (cursor === undefined) break
      }
      expect(keys).toEqual(["journal/0", "journal/1"])
      expect(cursor).toBeUndefined()
    }),
  )

  it.effect("accepts a terminal empty page", () =>
    Effect.gen(function* () {
      expect(yield* make(new NativeBucket()).list("absent/")).toEqual({ keys: [] })
    }),
  )

  for (const [name, page, cursor] of [
    ["missing truncated flag", { objects: [] }, undefined],
    ["missing continuation", { objects: [], truncated: true }, undefined],
    ["empty continuation", { objects: [], truncated: true, cursor: "" }, undefined],
    ["non-string continuation", { objects: [], truncated: true, cursor: 2 }, undefined],
    ["non-advancing continuation", { objects: [], truncated: true, cursor: "same" }, "same"],
    ["continuation on a terminal page", { objects: [], truncated: false, cursor: "extra" }, undefined],
    ["missing objects", { truncated: false }, undefined],
    ["missing object key", { objects: [{}], truncated: false }, undefined],
    ["foreign namespace", { objects: [{ key: "other/0" }], truncated: false }, undefined],
  ] as const) {
    it.effect(`rejects ${name} instead of reporting an exhausted or incomplete listing`, () =>
      Effect.gen(function* () {
        const bucket = new NativeBucket()
        bucket.list = async () => malformed<Page>(page)
        const error = yield* failureOf(make(bucket).list("journal/", cursor))
        expect(error.reason).toBe("invalid-response")
      }),
    )
  }

  for (const [name, response] of [
    ["metadata without a body", metadata],
    ["missing object response", undefined],
    ["missing ETag", { ...metadata, etag: "", body: new Response(new Uint8Array(3)).body }],
    ["foreign object", { ...metadata, key: "other", body: new Response(new Uint8Array(3)).body }],
    ["incomplete body", { ...metadata, body: new Response(new Uint8Array(2)).body }],
    ["oversized body", { ...metadata, body: new Response(new Uint8Array(4)).body }],
    ["invalid byte container", { ...metadata, body: new ReadableStream({ start(controller) { controller.enqueue("not bytes"); controller.close() } }) }],
    ["invalid size", { ...metadata, size: Number.NaN, body: new Response(new Uint8Array(3)).body }],
    ["missing size", { key: metadata.key, etag: metadata.etag, body: new Response(new Uint8Array(3)).body }],
  ] as const) {
    it.effect(`rejects ${name} without treating the object as absent`, () =>
      Effect.gen(function* () {
        const bucket = new NativeBucket()
        bucket.get = async () => malformed<Body>(response)
        expect((yield* failureOf(make(bucket).read("journal/0", { maxBytes: 1024 }))).reason).toBe("invalid-response")
      }),
    )
  }

  it.effect("does not acknowledge a create with incomplete provider metadata", () =>
    Effect.gen(function* () {
      const bucket = new NativeBucket()
      bucket.put = async () => ({ ...metadata, size: 2 })
      expect((yield* failureOf(make(bucket).create("journal/0", new Uint8Array(3)))).reason).toBe("invalid-response")
    }),
  )

  it.effect("classifies native authorization, throttling, timeout, and unavailable errors across operations", () =>
    Effect.gen(function* () {
      const bucket = new NativeBucket()
      bucket.get = async () => {
        throw new Error("get: Insufficient permissions for the requested operation. (10003)")
      }
      bucket.put = async () => {
        throw new Error("put: Rate limit exceeded. (10058)")
      }
      bucket.list = async () => {
        throw new DOMException("The operation timed out", "TimeoutError")
      }
      bucket.delete = async () => {
        throw new Error("delete: Service is temporarily unavailable. (10043)")
      }
      const store = make(bucket)
      const errors = yield* Effect.all([
        failureOf(store.read("journal/0", { maxBytes: 1024 })),
        failureOf(store.create("journal/0", new Uint8Array(3))),
        failureOf(store.list("journal/")),
        failureOf(makeMaintenance(bucket).remove("journal/0")),
      ])
      expect(errors.map((error) => [error.operation, error.reason, error.key])).toEqual([
        ["read", "authentication", "journal/0"],
        ["create", "rate-limit", "journal/0"],
        ["list", "timeout", "journal/"],
        ["remove", "unavailable", "journal/0"],
      ])
    }),
  )

  it.effect("propagates failure during body consumption rather than returning partial bytes", () =>
    Effect.gen(function* () {
      const bucket = new NativeBucket()
      bucket.get = async () => ({
        ...metadata,
        body: new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new Error("Network connection lost"))
          },
        }),
      })
      const error = yield* failureOf(make(bucket).read("journal/0", { maxBytes: 1024 }))
      expect(error.reason).toBe("unavailable")
      expect(error.operation).toBe("read")
    }),
  )

  it.effect("keeps a lost create acknowledgement uncertain and allows a fresh read to reconcile", () =>
    Effect.gen(function* () {
      const bucket = new NativeBucket()
      const put = bucket.put.bind(bucket)
      bucket.put = async (...args) => {
        await put(...args)
        throw new DOMException("The acknowledgement timed out", "TimeoutError")
      }
      const bytes = new Uint8Array([1, 2, 3])
      expect((yield* failureOf(make(bucket).create("journal/0", bytes))).reason).toBe("timeout")
      expect((yield* make(bucket).read("journal/0", { maxBytes: 1024 }))?.bytes).toEqual(bytes)
    }),
  )

  it.effect("deletes only through the separately supplied maintenance capability", () =>
    Effect.gen(function* () {
      const bucket = new NativeBucket()
      const runtime = make(bucket)
      yield* runtime.create("retired/0", new Uint8Array([1]))
      yield* makeMaintenance(bucket).remove("retired/0")
      expect(yield* runtime.read("retired/0", { maxBytes: 1024 })).toBeUndefined()
      expect(yield* runtime.list("retired/")).toEqual({ keys: [] })
    }),
  )

  it("rejects an oversized declared object without consuming the body", async () => {
    let pulls = 0
    let canceled = false
    const bucket = new NativeBucket()
    bucket.get = async () => ({
      ...metadata,
      body: new ReadableStream<Uint8Array>({
        pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(3)) },
        cancel() { canceled = true },
      }, { highWaterMark: 0 }),
    })
    expect((await Effect.runPromise(failureOf(make(bucket).read("journal/0", { maxBytes: 2 })))).reason).toBe("limit")
    expect(pulls).toBe(0)
    expect(canceled).toBe(true)
  })

  it("cancels a lying-size response as soon as a chunk crosses the byte budget", async () => {
    let pulls = 0
    let canceled = false
    const bucket = new NativeBucket()
    bucket.get = async () => ({
      ...metadata,
      size: 1,
      body: new ReadableStream<Uint8Array>({
        pull(controller) { pulls += 1; controller.enqueue(new Uint8Array([1, 2, 3])) },
        cancel() { canceled = true },
      }, { highWaterMark: 0 }),
    })
    expect((await Effect.runPromise(failureOf(make(bucket).read("journal/0", { maxBytes: 2 })))).reason).toBe("limit")
    expect(pulls).toBe(1)
    expect(canceled).toBe(true)
  })

  it.effect("reads a bounded range of a larger object and permits EOF truncation", () =>
    Effect.gen(function* () {
      const store = make(new NativeBucket())
      yield* store.create("journal/0", new Uint8Array([0, 1, 2, 3, 4, 5]))
      const interior = yield* store.read("journal/0", { maxBytes: 2, range: { offset: 2, length: 2 } })
      const ending = yield* store.read("journal/0", { maxBytes: 4, range: { offset: 4, length: 4 } })
      expect(interior?.bytes).toEqual(new Uint8Array([2, 3]))
      expect(ending).toEqual({ bytes: new Uint8Array([4, 5]), etag: interior?.etag })
      expect((yield* failureOf(store.read("journal/0", { maxBytes: 1, range: { offset: 6, length: 1 } }))).reason).toBe("invalid-response")
    }),
  )

  for (const [name, range] of [
    ["ignored range", undefined],
    ["wrong offset", { offset: 0, length: 2 }],
    ["short before EOF", { offset: 2, length: 1 }],
    ["suffix instead of offset", { suffix: 2 }],
  ] as const) {
    it.effect(`rejects ${name} rather than returning bytes from a different range`, () =>
      Effect.gen(function* () {
        const bucket = new NativeBucket()
        bucket.get = async () => ({
          ...metadata, size: 6, range, body: new Response(new Uint8Array([2, 3])).body!,
        })
        expect((yield* failureOf(make(bucket).read("journal/0", {
          maxBytes: 2, range: { offset: 2, length: 2 },
        }))).reason).toBe("invalid-response")
      }),
    )
  }

  it("bounds stalled native metadata reads and listings with typed timeouts", async () => {
    const bucket = new NativeBucket()
    bucket.get = () => new Promise(() => {})
    bucket.list = () => new Promise(() => {})
    const store = make(bucket, { requestTimeoutMs: 15 })
    const errors = await Effect.runPromise(Effect.all([
      failureOf(store.read("journal/0", { maxBytes: 3 })),
      failureOf(store.list("journal/")),
    ], { concurrency: "unbounded" }))
    expect(errors.map((error) => [error.operation, error.reason])).toEqual([["read", "timeout"], ["list", "timeout"]])
  })

  it("cancels a body that stalls after metadata without waiting for cancellation acknowledgement", async () => {
    let canceled = false
    const bucket = new NativeBucket()
    bucket.get = async () => ({
      ...metadata,
      body: new ReadableStream<Uint8Array>({
        pull: () => new Promise<void>(() => {}),
        cancel() { canceled = true; return new Promise<void>(() => {}) },
      }, { highWaterMark: 0 }),
    })
    const store = make(bucket, { requestTimeoutMs: 15 })
    expect((await Effect.runPromise(failureOf(store.read("journal/0", { maxBytes: 3 })))).reason).toBe("timeout")
    expect(canceled).toBe(true)
  })

  it("cancels a read body that arrives after its request deadline", async () => {
    let resolveGet!: (body: Body) => void
    let resolveCanceled!: () => void
    const canceled = new Promise<void>((resolve) => { resolveCanceled = resolve })
    const bucket = new NativeBucket()
    bucket.get = () => new Promise((resolve) => { resolveGet = resolve })
    const store = make(bucket, { requestTimeoutMs: 15 })
    expect((await Effect.runPromise(failureOf(store.read("journal/0", { maxBytes: 3 })))).reason).toBe("timeout")
    resolveGet({
      ...metadata,
      body: new ReadableStream<Uint8Array>({ cancel: resolveCanceled }, { highWaterMark: 0 }),
    })
    await canceled
  })

  it("keeps a stalled create acknowledgement uncertain and reconciles committed bytes", async () => {
    const bucket = new NativeBucket()
    const put = bucket.put.bind(bucket)
    bucket.put = async (...args) => {
      await put(...args)
      return new Promise(() => {})
    }
    const store = make(bucket, { requestTimeoutMs: 15 })
    const bytes = new Uint8Array([7, 8, 9])
    expect((await Effect.runPromise(failureOf(store.create("journal/0", bytes)))).reason).toBe("timeout")
    expect((await Effect.runPromise(store.read("journal/0", { maxBytes: 3 })))?.bytes).toEqual(bytes)
  })
})
