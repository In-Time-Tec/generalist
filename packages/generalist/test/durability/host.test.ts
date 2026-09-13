import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { close, make } from "../../src/core/agent/service.js"
import { fromLiveAgent } from "../../src/core/durable/manifest/agent-manifest.js"
import { makeCapability, makeModel } from "../../src/core/durable/pin.js"
import { inspect, page } from "../../src/durability/discovery.js"
import { type Configuration, type Options, reconcilePage } from "../../src/durability/host.js"
import { ObjectStore, type Service } from "../../src/durability/object-store.js"
import { make as makeAddress } from "../../src/runtime/address.js"
import { make as makeExecutableManifest } from "../../src/runtime/executable/manifest.js"
import { requiredPins } from "../../src/runtime/executable/registration.js"
import { layerStatic } from "../../src/runtime/executable/resolver.js"
import { makeRunStore } from "../../src/runtime/state/store.js"
import { make as makeSimulator } from "../../src/testing/durability/index.js"

const tenant = { environment: "test", tenant: "discovery-host" }
const agent = make({ name: "discovered" })
const pinned = fromLiveAgent(agent, {
  model: makeModel({ provider: "test", model: "discovery" }),
  tools: [],
  skills: [],
  services: [],
  children: [],
  budget: {},
  policy:
    agent.policy.snapshot === undefined
      ? { _tag: "Pinned", pin: makeCapability({ policy: "test" }) }
      : { _tag: "Portable", policy: agent.policy.snapshot },
})
const executable = makeExecutableManifest({
  root: pinned.pin,
  entries: [{ _tag: "Agent", pin: pinned.pin, manifest: pinned.manifest }],
})
const address = makeAddress("agent:discovered")
const registrations = [...requiredPins(executable)].map((pin) => ({
  pin,
  codec: "test",
  version: "1",
  payload: {},
}))
const addresses = [{ address, executable, registrations }]
const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
})

const makeFixture = (blocked?: Effect.Effect<never>) => {
  const counts = { executions: 0, acquired: 0, released: 0 }
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    Effect.acquireRelease(
      LanguageModel.make({
        generateText: () => Effect.succeed([]),
        streamText: () => {
          counts.executions++
          if (blocked !== undefined) return Stream.fromEffect(blocked)
          return Stream.make(
            Response.makePart("text-delta", { id: "text", delta: "recovered" }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          )
        },
      }).pipe(Effect.tap(() => Effect.sync(() => void counts.acquired++))),
      () => Effect.sync(() => void counts.released++),
    ),
  )
  const configuration: Configuration = {
    addresses,
    resolver: layerStatic([{ executable, agent: close(agent, model) }]).pipe(Layer.orDie),
  }
  return { counts, configuration }
}

const admit = (partition: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const store = yield* makeRunStore({ ...tenant, partition, addresses })
      return yield* store.admitSend({
        message: {
          id: `message:${partition}`,
          to: address,
          sessionId: `session:${partition}`,
          prompt: Prompt.make("recover without a notification"),
          idempotencyKey: partition,
          correlationId: partition,
          metadata: {},
        },
        executableRef: executable.ref,
        executableManifest: executable.manifest,
        registrations,
      })
    }),
  )

layer(BunCrypto.layer)("object discovery host", (it) => {
  it.effect("a fresh host discovers a first-commit crash without notifications and executes the unknown run once", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const fixture = makeFixture()
      const initial = yield* page(tenant).pipe(Effect.provideService(ObjectStore, bucket.store))
      expect(initial.locations).toEqual([])
      const receipt = yield* admit("unknown").pipe(Effect.provideService(ObjectStore, bucket.store))
      const fresh = yield* bucket.connect
      const inspected = yield* inspect({ ...tenant, partition: "unknown" }).pipe(
        Effect.provideService(ObjectStore, fresh.store),
      )
      expect(inspected).toMatchObject({ status: "committed", cursor: "0", runCount: 1, sessionCount: 0 })
      expect(fixture.counts.executions).toBe(0)
      const options: Options = {
        ...tenant,
        authorize: (location) =>
          Effect.succeed(location.partition === "unknown" ? Option.some(fixture.configuration) : Option.none()),
      }
      const result = yield* reconcilePage(options).pipe(Effect.provideService(ObjectStore, fresh.store))
      expect(result.partitions).toMatchObject([{ status: "drained", location: { partition: "unknown" } }])
      expect(result.cursor).toBeUndefined()
      const observer = yield* bucket.connect
      yield* Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeRunStore({ ...tenant, partition: "unknown", addresses })
          expect(yield* store.inspect(receipt.runId)).toMatchObject({ status: "succeeded" })
          expect((yield* store.list({ limit: 10 })).map((run) => run.runId)).toEqual([receipt.runId])
        }).pipe(Effect.provideService(ObjectStore, observer.store)),
      )
      yield* reconcilePage(options).pipe(Effect.provideService(ObjectStore, observer.store))
      expect(fixture.counts.executions).toBe(1)
      expect(fixture.counts.acquired).toBeGreaterThan(0)
      expect(fixture.counts.released).toBe(fixture.counts.acquired)
    }),
  )

  it.effect("uncommitted markers and read-only inspection never construct a runtime or dispatch", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      const fixture = makeFixture()
      yield* bucket.faults.failNextCreate({
        key: "environments/test/v1/tenants/discovery-host/partitions/uncommitted/commits/00000000000000000000.json",
        phase: "before",
        reason: "authentication",
      })
      yield* admit("uncommitted").pipe(Effect.provideService(ObjectStore, bucket.store), Effect.flip)
      const fresh = yield* bucket.connect
      let writes = 0
      const observed: Service = {
        ...fresh.store,
        create: (key, bytes) => Effect.sync(() => void writes++).pipe(Effect.andThen(fresh.store.create(key, bytes))),
      }
      const location = { ...tenant, partition: "uncommitted" }
      expect(yield* inspect(location).pipe(Effect.provideService(ObjectStore, observed))).toEqual({
        status: "uncommitted",
        namespace: location,
      })
      const result = yield* reconcilePage({
        ...tenant,
        authorize: () => Effect.succeed(Option.some(fixture.configuration)),
      }).pipe(Effect.provideService(ObjectStore, observed))
      expect(result.partitions).toEqual([{ location, status: "uncommitted" }])
      expect(writes).toBe(0)
      expect(fixture.counts).toEqual({ executions: 0, acquired: 0, released: 0 })
    }),
  )

  it.effect("application denial leaves a committed partition read-only and inactive", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      yield* admit("denied").pipe(Effect.provideService(ObjectStore, bucket.store))
      const fresh = yield* bucket.connect
      let writes = 0
      const observed: Service = {
        ...fresh.store,
        create: (key, bytes) => Effect.sync(() => void writes++).pipe(Effect.andThen(fresh.store.create(key, bytes))),
      }
      const before = yield* inspect({ ...tenant, partition: "denied" }).pipe(
        Effect.provideService(ObjectStore, observed),
      )
      const result = yield* reconcilePage({
        ...tenant,
        authorize: () => Effect.succeed(Option.none()),
      }).pipe(Effect.provideService(ObjectStore, observed))
      expect(result.partitions).toEqual([{ location: { ...tenant, partition: "denied" }, status: "denied" }])
      expect(
        yield* inspect({ ...tenant, partition: "denied" }).pipe(Effect.provideService(ObjectStore, observed)),
      ).toEqual(before)
      expect(writes).toBe(0)
    }),
  )

  it.effect("a discovered marker cannot activate a corrupt authoritative journal", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      yield* admit("corrupt").pipe(Effect.provideService(ObjectStore, bucket.store))
      yield* bucket.faults.corrupt(
        "environments/test/v1/tenants/discovery-host/partitions/corrupt/commits/00000000000000000000.json",
        new Uint8Array([123]),
      )
      const fresh = yield* bucket.connect
      const fixture = makeFixture()
      let writes = 0
      const observed: Service = {
        ...fresh.store,
        create: (key, bytes) => Effect.sync(() => void writes++).pipe(Effect.andThen(fresh.store.create(key, bytes))),
      }
      const failure = yield* reconcilePage({
        ...tenant,
        authorize: () => Effect.succeed(Option.some(fixture.configuration)),
      }).pipe(Effect.provideService(ObjectStore, observed), Effect.flip)
      expect(failure).toMatchObject({ reason: "corruption" })
      expect(writes).toBe(0)
      expect(fixture.counts).toEqual({ executions: 0, acquired: 0, released: 0 })
    }),
  )

  it.effect("each host invocation consumes one bounded page and returns a tenant-bound continuation", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator({ pageSize: 1 })
      const fixture = makeFixture()
      for (const partition of ["a", "b", "c"]) {
        yield* admit(partition).pipe(Effect.provideService(ObjectStore, bucket.store))
      }
      const fresh = yield* bucket.connect
      const authorized: Array<string> = []
      const options: Options = {
        ...tenant,
        drainFuel: 2,
        authorize: (location) =>
          Effect.sync(() => {
            authorized.push(location.partition)
            return Option.some(fixture.configuration)
          }),
      }
      const first = yield* reconcilePage(options).pipe(Effect.provideService(ObjectStore, fresh.store))
      expect(first.partitions).toHaveLength(1)
      expect(authorized).toEqual(["a"])
      expect(fixture.counts.executions).toBe(1)
      expect(first.cursor).toBeDefined()
      const second = yield* reconcilePage({ ...options, ...first }).pipe(
        Effect.provideService(ObjectStore, fresh.store),
      )
      expect(second.partitions).toHaveLength(1)
      expect(authorized).toEqual(["a", "b"])
      expect(fixture.counts.executions).toBe(2)
      expect(second.cursor).toBeDefined()
      const third = yield* reconcilePage({ ...options, ...second }).pipe(
        Effect.provideService(ObjectStore, fresh.store),
      )
      expect(third.partitions).toHaveLength(1)
      expect(third.cursor).toBeUndefined()
      expect(authorized).toEqual(["a", "b", "c"])
      expect(fixture.counts.executions).toBe(3)
      expect(fixture.counts.released).toBe(fixture.counts.acquired)
    }),
  )

  it.effect("invalid fuel fails before discovery or application authorization", () =>
    Effect.gen(function* () {
      const bucket = yield* makeSimulator()
      let authorizations = 0
      for (const drainFuel of [0, 1001, 1.5, Number.NaN]) {
        const failure = yield* reconcilePage({
          ...tenant,
          drainFuel,
          authorize: () =>
            Effect.sync(() => {
              authorizations++
              return Option.none()
            }),
        }).pipe(Effect.provideService(ObjectStore, bucket.store), Effect.flip)
        expect(failure).toMatchObject({ reason: "configuration" })
      }
      expect(authorizations).toBe(0)
    }),
  )

  it.effect(
    "interrupting a discovered host closes its resources and fresh recovery never redispatches unknown work",
    () =>
      Effect.gen(function* () {
        const bucket = yield* makeSimulator()
        const receipt = yield* admit("interrupted").pipe(Effect.provideService(ObjectStore, bucket.store))
        const started = yield* Deferred.make<void>()
        const first = makeFixture(Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)))
        const executing = yield* reconcilePage({
          ...tenant,
          authorize: () => Effect.succeed(Option.some(first.configuration)),
        }).pipe(Effect.provideService(ObjectStore, bucket.store), Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(started)
        yield* Fiber.interrupt(executing)
        expect(first.counts.executions).toBe(1)
        expect(first.counts.released).toBe(first.counts.acquired)
        const fresh = yield* bucket.connect
        const recovered = makeFixture()
        const result = yield* reconcilePage({
          ...tenant,
          authorize: () => Effect.succeed(Option.some(recovered.configuration)),
        }).pipe(Effect.provideService(ObjectStore, fresh.store))
        expect(result.partitions).toMatchObject([{ status: "drained" }])
        yield* Effect.scoped(
          Effect.gen(function* () {
            const store = yield* makeRunStore({ ...tenant, partition: "interrupted", addresses })
            expect(yield* store.inspect(receipt.runId)).toMatchObject({ status: "needs-resolution" })
          }).pipe(Effect.provideService(ObjectStore, fresh.store)),
        )
        expect(recovered.counts.executions).toBe(0)
        expect(recovered.counts.released).toBe(recovered.counts.acquired)
      }),
  )
})
