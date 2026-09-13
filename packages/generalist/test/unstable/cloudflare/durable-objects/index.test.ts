import { BunCrypto } from "@effect/platform-bun"
import { expect, layer } from "@effect/vitest"
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Layer, Scope } from "effect"
import { TestClock } from "effect/testing"
import { Runtime } from "../../../../src/runtime/engine.js"
import { make as makeSimulator } from "../../../../src/testing/durability/index.js"
import { make, reconcile, type AlarmStorage } from "../../../../src/unstable/cloudflare/durable-objects/index.js"
import { admission, options, resolverLayer } from "./fixture.js"
import { nativeBucket } from "./native-bucket.js"

const services = Layer.merge(BunCrypto.layer, resolverLayer())
const alarmStorage = (initial: number | null = null) => {
  let dueAt = initial
  const writes: Array<number> = []
  const storage: AlarmStorage = {
    getAlarm: () => Promise.resolve(dueAt),
    setAlarm: (time) => {
      dueAt = time
      writes.push(time)
      return Promise.resolve()
    },
  }
  return { storage, writes }
}

layer(services)("Durable Object host controller", (it) => {
  it.effect("initializes concurrent calls once, closes idle authority, and reopens the same namespace", () =>
    Effect.gen(function* () {
      const simulator = yield* makeSimulator()
      const { storage } = alarmStorage()
      const native = nativeBucket(simulator)
      let reads = 0
      const host = yield* make({
        ...options,
        bucket: {
          ...native,
          get: (key, input) => {
            reads += 1
            return native.get(key, input)
          },
          list: (input) => {
            reads += 1
            return native.list(input)
          },
        },
        storage,
      })
      const initializing = yield* simulator.faults.pauseNextCreate()
      const entered = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const first = yield* host
        .run(
          Effect.gen(function* () {
            const runtime = yield* Runtime
            yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(finish)
            return runtime
          }),
        )
        .pipe(Effect.forkChild)
      yield* initializing.entered
      const second = yield* host.run(Runtime).pipe(Effect.forkChild)
      yield* initializing.release
      yield* Deferred.await(entered)
      const concurrent = yield* Fiber.join(second)
      yield* Deferred.succeed(finish, undefined)
      expect(yield* Fiber.join(first)).toBe(concurrent)
      const commits = yield* simulator.store.list("environments/")
      const idleReads = reads
      yield* TestClock.adjust("60 seconds")
      expect(reads).toBe(idleReads)
      expect(yield* simulator.store.list("environments/")).toEqual(commits)
      expect(yield* concurrent.list({ limit: 10 }).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RuntimeUnavailable",
      })
      const reopened = yield* host.run(Runtime)
      expect(reopened).not.toBe(concurrent)
    }).pipe(Effect.scoped),
  )

  it.effect("finalizes command-scoped fibers before retiring the shared Runtime", () =>
    Effect.gen(function* () {
      const simulator = yield* makeSimulator()
      const { storage } = alarmStorage()
      const host = yield* make({ ...options, bucket: nativeBucket(simulator), storage })
      let finalized = false
      yield* host.run(
        Effect.gen(function* () {
          const entered = yield* Deferred.make<void>()
          yield* Effect.gen(function* () {
            yield* Deferred.succeed(entered, undefined)
            return yield* Effect.never
          }).pipe(
            Effect.ensuring(
              Effect.gen(function* () {
                const runtime = yield* Runtime
                yield* runtime.list({ limit: 10 })
                finalized = true
              }).pipe(Effect.orDie),
            ),
            Effect.forkScoped,
          )
          yield* Deferred.await(entered)
        }),
      )
      expect(finalized).toBe(true)
    }).pipe(Effect.scoped),
  )

  it.effect("observes ownership failure, interrupts its caller, and permits a fresh activation", () =>
    Effect.gen(function* () {
      const simulator = yield* makeSimulator()
      const native = nativeBucket(simulator)
      const { storage } = alarmStorage()
      const stalled = yield* Deferred.make<void>()
      const entered = yield* Deferred.make<void>()
      const runPromise = Effect.runPromiseWith(yield* Effect.context<never>())
      let block = false
      const host = yield* make({
        ...options,
        bucket: {
          ...native,
          get: (key, input) =>
            block
              ? runPromise(Deferred.await(stalled).pipe(Effect.andThen(Effect.promise(() => native.get(key, input)))))
              : native.get(key, input),
        },
        storage,
      })
      let interrupted = false
      const active = yield* host
        .run(
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                interrupted = true
              }),
            ),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      block = true
      yield* TestClock.adjust("16 seconds")
      block = false
      yield* Deferred.succeed(stalled, undefined)
      expect(yield* Fiber.join(active).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/runtime/RuntimeUnavailable",
      })
      expect(interrupted).toBe(true)
      yield* host.run(Effect.void)
    }).pipe(Effect.scoped),
  )

  it.effect("does not replace an earlier alarm during cold or concurrent command admission", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("1 second")
      const simulator = yield* makeSimulator()
      const { storage, writes } = alarmStorage(500)
      const host = yield* make({ ...options, bucket: nativeBucket(simulator), storage })
      yield* Effect.all([host.run(Effect.void), host.run(Effect.void)], { concurrency: "unbounded" })
      expect(writes).toEqual([])
      expect(yield* Effect.promise(() => storage.getAlarm())).toBe(500)
    }).pipe(Effect.scoped),
  )

  it.effect("returns committed receipts when alarm storage rejects, then independent reconciliation recovers", () =>
    Effect.gen(function* () {
      const simulator = yield* makeSimulator()
      const bucket = nativeBucket(simulator)
      const host = yield* make({
        ...options,
        bucket,
        storage: {
          getAlarm: () => Promise.resolve(null),
          setAlarm: () => Promise.reject(new Error("injected native alarm failure")),
        },
      })
      const command = Effect.flatMap(Runtime, (runtime) => runtime.send(admission("lost-doorbell")))
      const receipt = yield* host.run(command)
      expect(yield* host.run(command)).toEqual(receipt)
      yield* reconcile({ ...options, bucket })
      expect(yield* host.run(Effect.flatMap(Runtime, (runtime) => runtime.inspect(receipt.runId)))).toMatchObject({
        status: "succeeded",
      })
    }).pipe(Effect.scoped),
  )

  it.effect("keeps command control responsive during a full drain and admits work during idle release", () =>
    Effect.gen(function* () {
      const simulator = yield* makeSimulator()
      const { storage } = alarmStorage()
      const entered = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      let dispatches = 0
      const resolver = resolverLayer(
        Effect.gen(function* () {
          dispatches += 1
          yield* Deferred.succeed(entered, undefined)
          yield* Deferred.await(finish)
        }),
      )
      const context = yield* Layer.build(resolver)
      const host = yield* make({ ...options, bucket: nativeBucket(simulator), storage }).pipe(
        Effect.provideContext(context),
      )
      yield* host.run(Effect.flatMap(Runtime, (runtime) => runtime.send(admission("first"))))
      const alarm = yield* host.alarm.pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      expect(yield* host.run(Effect.flatMap(Runtime, (runtime) => runtime.inspect("first")))).toMatchObject({
        status: "running",
      })
      expect(alarm.pollUnsafe()).toBeUndefined()
      yield* Deferred.succeed(finish, undefined)
      yield* Effect.all(
        [Fiber.join(alarm), host.run(Effect.flatMap(Runtime, (runtime) => runtime.send(admission("second"))))],
        { concurrency: "unbounded" },
      )
      yield* host.alarm
      yield* host.alarm
      expect(dispatches).toBe(2)
      expect(yield* host.run(Effect.flatMap(Runtime, (runtime) => runtime.inspect("second")))).toMatchObject({
        status: "succeeded",
      })
    }).pipe(Effect.scoped),
  )

  it.effect("cleans a failed activation before retrying initialization", () =>
    Effect.gen(function* () {
      const simulator = yield* makeSimulator()
      const { storage } = alarmStorage()
      const native = nativeBucket(simulator)
      let fail = true
      const host = yield* make({
        ...options,
        bucket: {
          ...native,
          get: (key, input) =>
            fail ? Promise.reject(new Error("injected authorization rejection (10002)")) : native.get(key, input),
        },
        storage,
      })
      expect(yield* host.run(Effect.void).pipe(Effect.flip)).toMatchObject({
        _tag: "generalist/durability/DurabilityFailure",
      })
      fail = false
      yield* host.run(Effect.flatMap(Runtime, (runtime) => runtime.send(admission("after-failure"))))
      yield* host.alarm
      expect(yield* host.run(Effect.flatMap(Runtime, (runtime) => runtime.inspect("after-failure")))).toMatchObject({
        status: "succeeded",
      })
    }).pipe(Effect.scoped),
  )

  it.effect("closes the host without disposing services beneath active callers", () =>
    Effect.gen(function* () {
      const simulator = yield* makeSimulator()
      const { storage } = alarmStorage()
      const scope = yield* Scope.make()
      const host = yield* make({ ...options, bucket: nativeBucket(simulator), storage }).pipe(Scope.provide(scope))
      const entered = yield* Deferred.make<void>()
      let finalized = false
      const active = yield* host
        .run(
          Effect.gen(function* () {
            yield* Deferred.succeed(entered, undefined)
            return yield* Effect.never
          }).pipe(
            Effect.ensuring(
              Effect.gen(function* () {
                const runtime = yield* Runtime
                yield* runtime.list({ limit: 10 })
                finalized = true
              }).pipe(Effect.orDie),
            ),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      yield* Scope.close(scope, Exit.void)
      expect(finalized).toBe(true)
      const interrupted = yield* Fiber.await(active)
      expect(Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause)).toBe(true)
      expect(yield* host.run(Effect.void).pipe(Effect.flip)).toMatchObject({
        message: "Durable Object Runtime host is closed",
      })
      const before = yield* simulator.store.list("environments/")
      const now = yield* Clock.currentTimeMillis
      yield* TestClock.adjust("1 second")
      expect(yield* simulator.store.list("environments/")).toEqual(before)
      expect(yield* Clock.currentTimeMillis).toBe(now + 1000)
    }).pipe(Effect.scoped),
  )
})
