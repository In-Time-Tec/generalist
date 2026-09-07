import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { probe } from "../../packages/generalist/src/durability/internal/probe.js"
import { ObjectStoreFailure, type Service } from "../../packages/generalist/src/durability/object-store.js"
import * as S3 from "../../packages/generalist/src/durability/s3.js"
import * as Durability from "../../packages/generalist/src/testing/durability/index.js"

describe("ObjectStore conformance", () => {
  it.effect("arbitrates independent atomic creates without overwriting the winner", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    yield* Durability.atomicCreates({ connect: simulator.connect.pipe(Effect.map((client) => client.store)), prefix: "atomic" })
  }))

  it.effect("exposes acknowledged writes to fresh clients and distinguishes absence", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    yield* Durability.freshReads({ connect: simulator.connect.pipe(Effect.map((client) => client.store)), prefix: "fresh" })
  }))

  it.effect("discovers every acknowledged key through continuation cursors", () => Effect.gen(function* () {
    const simulator = yield* Durability.make({ pageSize: 2 })
    yield* Durability.listing({ connect: simulator.connect.pipe(Effect.map((client) => client.store)), prefix: "list", count: 5 })
  }))

  it.effect("preserves all binary bytes, sliced buffers and empty objects", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    yield* Durability.byteIntegrity({ connect: simulator.connect.pipe(Effect.map((client) => client.store)), prefix: "bytes" })
  }))

  it.effect("rejects unsupported conditional writes during provider initialization", () =>
    Durability.unsupportedPreconditions(S3.make({
      bucket: "durability-test",
      region: "us-east-1",
      endpoint: "https://objects.example.test",
      capabilities: { conditionalCreate: false, strongReadAfterWrite: true, consistentListing: true },
    })),
  )

  it.effect("fails conformance for an unconditional overwrite transport", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const unsafe: Service = {
      ...simulator.store,
      create: (key, bytes) => simulator.maintenance.remove(key).pipe(Effect.andThen(simulator.store.create(key, bytes))),
    }
    const error = yield* Effect.flip(Durability.atomicCreates({ connect: Effect.succeed(unsafe), prefix: "unsafe" }))
    expect(error).toBeInstanceOf(Durability.ObjectStoreConformanceFailure)
  }))
})

describe("testing-only ObjectStore simulator", () => {
  it.effect("publishes a write before losing its acknowledgement, without allowing a retry to overwrite", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const fresh = yield* simulator.connect
    const bytes = Uint8Array.of(1, 2, 3)
    yield* simulator.faults.failNextCreate({ key: "slot", phase: "after" })
    const error = yield* Effect.flip(simulator.store.create("slot", bytes))
    expect(error).toBeInstanceOf(ObjectStoreFailure)
    expect(error.reason).toBe("timeout")
    expect((yield* fresh.store.read("slot", { maxBytes: 16 }))?.bytes).toEqual(bytes)
    expect(yield* simulator.store.create("slot", Uint8Array.of(9))).toBe("conflict")
    expect((yield* fresh.store.read("slot", { maxBytes: 16 }))?.bytes).toEqual(bytes)
  }))

  it.effect("rejects before publication and consumes only the matching client's fault", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const fresh = yield* simulator.connect
    yield* simulator.faults.failNextCreate({ key: "blocked", phase: "before", reason: "rate-limit" })
    expect(yield* fresh.store.create("other-client", Uint8Array.of(1))).toBe("created")
    expect(yield* simulator.store.create("other-key", Uint8Array.of(2))).toBe("created")
    const error = yield* Effect.flip(simulator.store.create("blocked", Uint8Array.of(3)))
    expect(error.reason).toBe("rate-limit")
    expect(yield* fresh.store.read("blocked", { maxBytes: 16 })).toBeUndefined()
    expect(yield* simulator.store.create("blocked", Uint8Array.of(4))).toBe("created")
    expect((yield* fresh.store.read("blocked", { maxBytes: 16 }))?.bytes).toEqual(Uint8Array.of(4))
  }))

  it.effect("holds publication while another client wins and copies paused bytes at both boundaries", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const competitor = yield* simulator.connect
    const pause = yield* simulator.faults.pauseNextCreate("slot")
    const bytes = Uint8Array.of(1, 2)
    const pending = yield* Effect.forkChild(simulator.store.create("slot", bytes))
    const observed = yield* pause.entered
    expect(observed.key).toBe("slot")
    expect(observed.bytes).toEqual(Uint8Array.of(1, 2))
    bytes.fill(9)
    observed.bytes.fill(8)
    expect(yield* competitor.store.read("slot", { maxBytes: 16 })).toBeUndefined()
    expect(yield* competitor.store.create("slot", Uint8Array.of(3, 4))).toBe("created")
    yield* pause.release
    expect(yield* Fiber.join(pending)).toBe("conflict")
    expect((yield* simulator.store.read("slot", { maxBytes: 16 }))?.bytes).toEqual(Uint8Array.of(3, 4))
  }))

  it.effect("keeps a delayed create's original bytes even when caller and observer mutate buffers", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const pause = yield* simulator.faults.pauseNextCreate()
    const bytes = Uint8Array.of(5, 6)
    const pending = yield* Effect.forkChild(simulator.store.create("delayed", bytes))
    const observed = yield* pause.entered
    bytes.fill(9)
    observed.bytes.fill(8)
    yield* pause.release
    expect(yield* Fiber.join(pending)).toBe("created")
    expect((yield* simulator.store.read("delayed", { maxBytes: 16 }))?.bytes).toEqual(Uint8Array.of(5, 6))
  }))

  it.effect("interrupts a paused create without publishing when its gate is later released", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const pause = yield* simulator.faults.pauseNextCreate("cancelled")
    const pending = yield* Effect.forkChild(simulator.store.create("cancelled", Uint8Array.of(1)))
    yield* pause.entered
    yield* Fiber.interrupt(pending)
    yield* pause.release
    expect(yield* simulator.store.read("cancelled", { maxBytes: 16 })).toBeUndefined()
    expect(yield* simulator.store.create("cancelled", Uint8Array.of(2))).toBe("created")
    expect((yield* simulator.store.read("cancelled", { maxBytes: 16 }))?.bytes).toEqual(Uint8Array.of(2))
  }))

  it.effect("injects a real competing object and leaves an existing winner untouched", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const competitor = Uint8Array.of(7)
    yield* simulator.faults.conflictNextCreate("slot", competitor)
    competitor.fill(9)
    expect(yield* simulator.store.create("slot", Uint8Array.of(1))).toBe("conflict")
    expect((yield* simulator.store.read("slot", { maxBytes: 16 }))?.bytes).toEqual(Uint8Array.of(7))
    yield* simulator.faults.conflictNextCreate("slot", Uint8Array.of(8))
    expect(yield* simulator.store.create("slot", Uint8Array.of(2))).toBe("conflict")
    expect((yield* simulator.store.read("slot", { maxBytes: 16 }))?.bytes).toEqual(Uint8Array.of(7))
  }))

  it.effect("classifies read failures without hiding the object from independent clients", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const fresh = yield* simulator.connect
    yield* simulator.store.create("object", Uint8Array.of(4))
    yield* simulator.faults.failNextRead({ key: "object", reason: "authentication" })
    expect((yield* fresh.store.read("object", { maxBytes: 16 }))?.bytes).toEqual(Uint8Array.of(4))
    expect(yield* simulator.store.read("unrelated", { maxBytes: 16 })).toBeUndefined()
    const error = yield* Effect.flip(simulator.store.read("object", { maxBytes: 16 }))
    expect(error.reason).toBe("authentication")
    expect((yield* simulator.store.read("object", { maxBytes: 16 }))?.bytes).toEqual(Uint8Array.of(4))
  }))

  it.effect("corrupts stored bytes independently of opaque tokens and copies supplied corruption", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    yield* simulator.store.create("object", Uint8Array.of(1))
    const before = yield* simulator.store.read("object", { maxBytes: 16 })
    const corruption = Uint8Array.of(255, 0)
    yield* simulator.faults.corrupt("object", corruption)
    corruption.fill(0)
    const fresh = yield* simulator.connect
    const after = yield* fresh.store.read("object", { maxBytes: 16 })
    expect(after?.etag).toBe(before?.etag)
    expect(after?.bytes).toEqual(Uint8Array.of(255, 0))
    expect(before?.bytes).toEqual(Uint8Array.of(1))
    const error = yield* Effect.flip(simulator.faults.corrupt("missing", Uint8Array.of(1)))
    expect(error.reason).toBe("invalid-response")
  }))

  it.effect("continues by key when maintenance deletes earlier keys between pages", () => Effect.gen(function* () {
    const simulator = yield* Durability.make({ pageSize: 2 })
    for (const key of ["p/a", "p/b", "p/c", "p/d", "p/e", "outside"]) {
      yield* simulator.store.create(key, Uint8Array.of(1))
    }
    const first = yield* simulator.store.list("p/")
    expect(first.keys).toEqual(["p/a", "p/b"])
    expect(first.cursor).toBeDefined()
    yield* simulator.maintenance.remove("p/b")
    yield* simulator.maintenance.remove("p/c")
    yield* simulator.store.create("p/bb", Uint8Array.of(2))
    const second = yield* simulator.store.list("p/", first.cursor)
    expect(second.keys).toEqual(["p/bb", "p/d"])
    const third = yield* simulator.store.list("p/", second.cursor)
    expect(third).toEqual({ keys: ["p/e"] })
    expect(yield* simulator.store.list("missing/")).toEqual({ keys: [] })
    const wrongPrefix = yield* Effect.flip(simulator.store.list("other/", first.cursor))
    expect(wrongPrefix.reason).toBe("invalid-response")
    const malformed = yield* Effect.flip(simulator.store.list("p/", "not-a-cursor"))
    expect(malformed.reason).toBe("invalid-response")
  }))

  it.effect("rejects a zero page size rather than returning a non-progressing cursor", () => Effect.gen(function* () {
    const error = yield* Effect.flip(Durability.make({ pageSize: 0 }))
    expect(error.reason).toBe("invalid-response")
  }))
})

describe("provider capability diagnostic", () => {
  it.effect("permits concurrent and repeated probes over independent clients", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const other = yield* simulator.connect
    yield* Effect.all([probe(simulator.store, "diagnostic"), probe(other.store, "diagnostic")], { concurrency: "unbounded" })
    yield* probe(simulator.store, "diagnostic")
    expect((yield* simulator.store.list("diagnostic/")).keys).toEqual(["diagnostic/provider-probe"])
  }))

  it.effect("rejects a provider that overwrites and falsely reports a conflict", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const unsafe: Service = {
      ...simulator.store,
      create: (key, bytes) => simulator.maintenance.remove(key).pipe(
        Effect.andThen(simulator.store.create(key, bytes)), Effect.as("conflict" as const),
      ),
    }
    const error = yield* Effect.flip(probe(unsafe, "diagnostic"))
    expect(error.reason).toBe("invalid-response")
    expect(error.operation).toBe("probe")
  }))

  it.effect("rejects missing direct reads of acknowledged bytes", () => Effect.gen(function* () {
    const simulator = yield* Durability.make()
    const stale: Service = { ...simulator.store, read: () => Effect.succeed(undefined) }
    const error = yield* Effect.flip(probe(stale, "diagnostic"))
    expect(error.reason).toBe("invalid-response")
    expect(error.operation).toBe("probe")
  }))
})
