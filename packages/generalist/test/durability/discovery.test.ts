import { BunCrypto } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer } from "effect"
import { inspect, page as readPage } from "../../src/durability/discovery.js"
import { make } from "../../src/durability/internal/journal.js"
import { ensure, markerKey, maxMarkerBytes } from "../../src/durability/internal/discovery-marker.js"
import { bytes as protocolBytes } from "../../src/durability/internal/protocol.js"
import { ObjectStore, type Service } from "../../src/durability/object-store.js"
import { make as makeSimulator } from "../../src/testing/durability/index.js"

const scope = { environment: "test", tenant: "tenant" }
const identity = { ...scope, partition: "partition" }
const marker = "environments/test/v1/tenants/tenant/discovery/partition.json"
const slot = "environments/test/v1/tenants/tenant/partitions/partition/commits/00000000000000000000.json"
const command = { id: "first", input: null }
const evaluate = () =>
  Effect.succeed({ patches: [{ op: "set" as const, path: ["value"], value: 1 }], receipt: "accepted" })
const withStore = <A, E, R>(effect: Effect.Effect<A, E, R>, store: Service) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(BunCrypto.layer)
      return yield* effect.pipe(Effect.provideService(ObjectStore, store), Effect.provideContext(services))
    }),
  )
type Model = { readonly located: boolean; readonly verified: boolean; readonly committed: boolean }
type Action = "publish-marker" | "confirm-marker" | "publish-command" | "crash"
const initialModel: Model = { located: false, verified: false, committed: false }
const step = (model: Model, action: Action): Model | undefined => {
  switch (action) {
    case "publish-marker":
      return { ...model, located: true }
    case "confirm-marker":
      return model.located ? { ...model, verified: true } : undefined
    case "publish-command":
      return model.verified ? { ...model, committed: true } : undefined
    case "crash":
      return { ...model, verified: false }
  }
}

describe("tenant partition discovery", () => {
  it("exhaustively checks the independent marker-before-commit model including crash and retry", () => {
    const queue = [initialModel]
    const seen = new Set<string>()
    const actions: ReadonlyArray<Action> = ["publish-marker", "confirm-marker", "publish-command", "crash"]
    while (queue.length > 0) {
      const model = queue.shift()!
      const key = JSON.stringify(model)
      if (seen.has(key)) continue
      seen.add(key)
      expect(!model.committed || model.located).toBe(true)
      if (!model.verified) expect(step(model, "publish-command")).toBeUndefined()
      for (const action of actions) {
        const next = step(model, action)
        if (next !== undefined) queue.push(next)
      }
    }
    expect(seen.size).toBe(5)
  })
  it.effect("reopens committed partitions from only tenant scope after all notifications are lost", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator({ pageSize: 1 })
      for (const partition of ["z", "a", "../other/%/"]) {
        const journal = yield* withStore(make({ ...scope, partition }), bucket.store)
        expect(yield* journal.commit(command, evaluate)).toBe("accepted")
      }
      const fresh = yield* bucket.connect
      const found: Array<string> = []
      let cursor: string | undefined
      do {
        const page = yield* withStore(readPage(cursor === undefined ? scope : { ...scope, cursor }), fresh.store)
        expect(page.locations).toHaveLength(1)
        for (const location of page.locations) {
          const result = yield* withStore(inspect(location), fresh.store)
          expect(result).toMatchObject({ status: "committed", head: { sequence: "0", state: { value: 1 } } })
          found.push(location.partition)
        }
        cursor = page.cursor
      } while (cursor !== undefined)
      expect(found.toSorted()).toEqual(["../other/%/", "a", "z"])
    }),
  )

  for (const key of [marker, slot]) {
    for (const phase of ["before", "after"] as const) {
      it.effect(`reconciles ${phase} publication failure at ${key === marker ? "marker" : "genesis"}`, () =>
        Effect.gen(function* () {
          const bucket = yield* makeSimulator()
          yield* bucket.faults.failNextCreate({ key, phase })
          if (phase === "after") yield* bucket.faults.failNextRead({ key })
          const journal = yield* withStore(make(identity), bucket.store)
          const failure = yield* journal.commit(command, evaluate).pipe(Effect.flip)
          expect(failure.reason).toBe("indeterminate")
          const fresh = yield* bucket.connect
          const page = yield* withStore(readPage(scope), fresh.store)
          let model = initialModel
          if (key === slot || phase === "after") model = step(model, "publish-marker")!
          if (key === slot) model = step(model, "confirm-marker")!
          if (key === slot && phase === "after") model = step(model, "publish-command")!
          model = step(model, "crash")!
          expect(page.locations.length > 0).toBe(model.located)
          const inspection = yield* withStore(inspect(identity), fresh.store)
          expect(inspection.status === "committed").toBe(model.committed)
          const reopened = yield* withStore(make(identity), fresh.store)
          expect(yield* reopened.commit(command, evaluate)).toBe("accepted")
          expect(yield* reopened.read).toMatchObject({ sequence: "0", state: { value: 1 } })
        }),
      )
    }
  }

  it.effect("reconciles an exact lost marker response without another marker PUT", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      yield* bucket.faults.failNextCreate({ key: marker, phase: "after" })
      let attempts = 0
      const store: Service = {
        ...bucket.store,
        create: (key, bytes) => {
          if (key === marker) attempts += 1
          return bucket.store.create(key, bytes)
        },
      }
      const journal = yield* withStore(make(identity), store)
      expect(yield* journal.commit(command, evaluate)).toBe("accepted")
      expect(attempts).toBe(1)
    }),
  )

  it.effect("models marker publication before first commit across cancellation boundaries", () =>
    Effect.gen(function* () {
      for (const boundary of [marker, slot]) {
        const bucket = yield* makeSimulator()
        const pause = yield* bucket.faults.pauseNextCreate(boundary)
        const journal = yield* withStore(make(identity), bucket.store)
        const pending = yield* journal.commit(command, evaluate).pipe(Effect.forkChild({ startImmediately: true }))
        yield* pause.entered
        const model = boundary === slot ? step(step(initialModel, "publish-marker")!, "confirm-marker")! : initialModel
        expect((yield* withStore(readPage(scope), bucket.store)).locations.length > 0).toBe(model.located)
        expect((yield* withStore(inspect(identity), bucket.store)).status === "committed").toBe(model.committed)
        yield* Fiber.interrupt(pending)
        const fresh = yield* bucket.connect
        const reopened = yield* withStore(make(identity), fresh.store)
        const events: Array<string> = []
        const observed: Service = {
          ...fresh.store,
          create: (key, bytes) =>
            Effect.gen(function* () {
              if (key === slot) {
                expect(yield* fresh.store.read(marker, { maxBytes: maxMarkerBytes })).toBeDefined()
                events.push("commit")
              }
              return yield* fresh.store.create(key, bytes)
            }),
        }
        const writer = yield* withStore(make(identity), observed)
        yield* writer.commit(command, evaluate)
        expect(events).toEqual(["commit"])
        expect(yield* reopened.read).toMatchObject({ sequence: "0" })
      }
    }),
  )

  it.effect("never creates markers, diagnostics, or heartbeats during reconstruction", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      let creates = 0
      const store: Service = {
        ...bucket.store,
        create: (key, bytes) => {
          creates += 1
          return bucket.store.create(key, bytes)
        },
      }
      const journal = yield* withStore(make(identity), store)
      expect((yield* journal.read).sequence).toBe("-1")
      expect(yield* journal.lookupReceipt("unknown")).toBeUndefined()
      expect((yield* withStore(readPage(scope), store)).locations).toEqual([])
      expect((yield* withStore(inspect(identity), store)).status).toBe("uncommitted")
      expect(creates).toBe(0)
    }),
  )

  it.effect("rejects foreign and excess marker fields before evaluating a command", () =>
    Effect.gen(function* () {
      for (const extra of [{ tenant: "foreign" }, { state: {} }, { version: 2 }]) {
        const bucket = yield* makeSimulator()
        yield* bucket.store.create(
          marker,
          yield* protocolBytes({ version: 1, kind: "partition-discovery", ...identity, ...extra }),
        )
        const journal = yield* withStore(make(identity), bucket.store)
        let evaluations = 0
        const failure = yield* journal
          .commit(command, () => {
            evaluations += 1
            return evaluate()
          })
          .pipe(Effect.flip)
        expect(failure.reason).toBe("corruption")
        expect(evaluations).toBe(0)
        expect(yield* bucket.store.read(slot, { maxBytes: 1024 })).toBeUndefined()
        expect((yield* withStore(readPage(scope), bucket.store).pipe(Effect.flip)).reason).toBe("corruption")
      }
    }),
  )

  it.effect("accepts unordered pages and rejects duplicate, foreign, oversized, and looping pages", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      yield* withStore(ensure(identity), bucket.store)
      const second = { ...scope, partition: "a" }
      yield* withStore(ensure(second), bucket.store)
      const otherKey = yield* markerKey(second)
      const unordered: Service = { ...bucket.store, list: () => Effect.succeed({ keys: [marker, otherKey] }) }
      expect((yield* withStore(readPage(scope), unordered)).locations.map((item) => item.partition)).toEqual([
        "partition",
        "a",
      ])
      for (const keys of [[marker, marker], ["elsewhere"], Array.from({ length: 1001 }, () => marker)]) {
        let reads = 0
        const store: Service = {
          ...bucket.store,
          list: () => Effect.succeed({ keys }),
          read: (key, options) => {
            reads += 1
            return bucket.store.read(key, options)
          },
        }
        expect((yield* withStore(readPage(scope), store).pipe(Effect.flip)).reason).toBe(
          keys.length > 1000 ? "limit" : "corruption",
        )
        expect(reads).toBeLessThanOrEqual(1)
      }
      const looping: Service = { ...bucket.store, list: () => Effect.succeed({ keys: [], cursor: "same" }) }
      const first = yield* withStore(readPage(scope), looping)
      expect((yield* withStore(readPage({ ...scope, cursor: first.cursor! }), looping).pipe(Effect.flip)).reason).toBe(
        "corruption",
      )
      expect(
        (yield* withStore(readPage({ ...scope, tenant: "foreign", cursor: first.cursor! }), looping).pipe(Effect.flip))
          .reason,
      ).toBe("configuration")
    }),
  )

  it.effect("bounds authoritative inspection even on an endless empty listing", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      let lists = 0
      const store: Service = { ...bucket.store, list: () => Effect.sync(() => ({ keys: [], cursor: String(++lists) })) }
      expect((yield* withStore(inspect(identity), store).pipe(Effect.flip)).reason).toBe("limit")
      expect(lists).toBe(4096)
    }),
  )

  it.effect("does not treat a valid marker as proof of valid committed history", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const journal = yield* withStore(make(identity), bucket.store)
      yield* journal.commit(command, evaluate)
      yield* bucket.faults.corrupt(slot, yield* protocolBytes({ version: 1 }))
      const fresh = yield* bucket.connect
      const page = yield* withStore(readPage(scope), fresh.store)
      expect(page.locations).toEqual([identity])
      expect((yield* withStore(inspect(page.locations[0]!), fresh.store).pipe(Effect.flip)).reason).toBe("corruption")
    }),
  )

  it.effect("encodes every namespace component without conflating literal escapes or path traversal", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const escaped = { environment: "../prod", tenant: "../tenant/%2E", partition: "../../partition" }
      const journal = yield* withStore(make(escaped), bucket.store)
      yield* journal.commit(command, evaluate)
      expect(
        (yield* withStore(readPage({ environment: escaped.environment, tenant: escaped.tenant }), bucket.store))
          .locations,
      ).toEqual([escaped])
      expect((yield* withStore(readPage({ environment: "prod", tenant: "tenant" }), bucket.store)).locations).toEqual(
        [],
      )
      expect(
        (yield* withStore(readPage({ environment: "../prod", tenant: "../tenant/." }), bucket.store)).locations,
      ).toEqual([])
    }),
  )
})
