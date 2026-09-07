/* oxlint-disable effecttsgo/async-function -- These integration tests exercise Rivet's Promise-only actor API. */
import { layer as cryptoLayer } from "@effect/platform-bun/BunCrypto"
import { actor, setup, type Registry, type RegistryActors, type RegistryConfigInput } from "rivetkit"
import { setupTest as setupRivetTest } from "rivetkit/test"
import { afterAll, expect, test, type TestContext } from "vitest"
import { Context, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, AgentManifest, Pins } from "generalist"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver, Runtime } from "generalist/runtime"
import {
  ActorRuntime,
  type ActorRuntimeServices,
  type RuntimeActorContext,
  layerActorRuntime,
  makeRuntimeActor,
  type RuntimeActorDefinition,
  type RuntimeActorOptions,
} from "../../../../src/unstable/rivet/actors/index.js"
import type { ActivationFailure } from "../../../../src/durability/internal/runtime.js"
import { RuntimeUnavailable } from "../../../../src/runtime/errors.js"
import { ObjectStore } from "../../../../src/durability/object-store.js"
import { RuntimeInspectionResponse } from "../../../../src/runtime/inspection.js"
import { make as makeBucket, type Client } from "../../../../src/testing/durability/index.js"
import { Engine, layer as engineLayer } from "./engine.js"
import "./bootstrap-suite.js"

const engineRuntime = ManagedRuntime.make(engineLayer)
afterAll(() => engineRuntime.dispose())
const setupRegistry = <Actors extends RegistryActors>(config: RegistryConfigInput<Actors>): Promise<Registry<Actors>> =>
  engineRuntime.runPromise(Effect.map(Engine, (engine) => setup({ ...config, ...engine })))

const setupTest = async <Actors extends RegistryActors>(context: TestContext, registry: Registry<Actors>) => {
  const result = await setupRivetTest(context, registry)
  await registry.startAndWait()
  return result
}

class Application extends Context.Service<Application, { readonly incarnation: number }>()(
  "generalist/test/unstable/rivet/actors/runtime.test/Application",
) {}

interface Counters {
  initialized: number
  finalized: number
  reconciled: number
}

type ManagedHost = ManagedRuntime.ManagedRuntime<ActorRuntimeServices | Application, ActivationFailure>
interface Vars {
  host: ManagedHost | undefined
}

const makeComposedDefinition = (options: RuntimeActorOptions, counters: Counters) => {
  const applicationLayer = Layer.effect(
    Application,
    Effect.acquireRelease(
      Effect.sync(() => Application.of({ incarnation: ++counters.initialized })),
      () => Effect.sync(() => void counters.finalized++),
    ),
  )
  const requireHost = (c: { readonly vars: Vars }) => {
    if (c.vars.host === undefined) throw new Error("actor is asleep")
    return c.vars.host
  }
  const dispose = (c: { readonly vars: Vars }) => {
    const host = c.vars.host
    c.vars.host = undefined
    return host?.dispose() ?? Promise.resolve()
  }
  const { storage, resolver, actorOptions, ...runtimeOptions } = options
  return actor({
    createVars: (): Vars => ({ host: undefined }),
    options: actorOptions ?? { sleepTimeout: 60_000 },
    onWake: (c) => {
      const runtime = ManagedRuntime.make(
        Layer.merge(
          layerActorRuntime(c, {
            ...runtimeOptions,
            drainAction: "work.drain",
            reconcile: (context) =>
              Effect.gen(function* () {
                counters.reconciled++
                if (runtimeOptions.reconcile !== undefined) return yield* runtimeOptions.reconcile(context)
                return undefined
              }),
          }).pipe(Layer.provide(resolver), Layer.provide(storage)),
          applicationLayer,
        ),
      )
      return runtime.runPromise(ActorRuntime, { signal: c.abortSignal }).then(
        () => {
          c.vars.host = runtime
          return undefined
        },
        async (error) => {
          await runtime.dispose()
          throw error
        },
      )
    },
    onSleep: dispose,
    onDestroy: dispose,
    actions: {
      work: {
        admitWithoutNotify: (c, input: Runtime.SendInput) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.flatMap(Runtime.Runtime, (runtime) => runtime.send(input)),
              { signal: c.abortSignal },
            ),
          ),
        send: (c, input: Runtime.SendInput) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.gen(function* () {
                yield* Application
                const host = yield* ActorRuntime
                const runtime = yield* Runtime.Runtime
                const receipt = yield* host.guarded(runtime.send(input))
                yield* host.notify
                return receipt
              }),
              { signal: c.abortSignal },
            ),
          ),
        cancel: (c, runId: string) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.flatMap(Runtime.Runtime, (runtime) => runtime.cancel({ runId, commandId: `cancel:${runId}` })),
              { signal: c.abortSignal },
            ),
          ),
        drain: (c) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.flatMap(ActorRuntime, (runtime) => runtime.drain),
              { signal: c.abortSignal },
            ),
          ),
        snapshot: (c, runId: string) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.gen(function* () {
                const host = yield* ActorRuntime
                const application = yield* Application
                const runtime = yield* Runtime.Runtime
                return {
                  ownerId: host.ownerId,
                  incarnation: application.incarnation,
                  ...(yield* runtime
                    .inspect(runId)
                    .pipe(Effect.flatMap(Schema.encodeEffect(RuntimeInspectionResponse)))),
                }
              }),
              { signal: c.abortSignal },
            ),
          ),
      },
    },
  })
}

const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
})

const makeModel = (onStream: () => void) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () =>
        Effect.succeed([
          Response.makePart("text", { text: "actor response" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        ]),
      streamText: () => {
        onStream()
        return Stream.make(
          Response.makePart("text-delta", { id: "text", delta: "actor response" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        )
      },
    }),
  )

const model = makeModel(() => {})

const agent = Agent.make({ name: "rivet-test" })
const pinned = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ provider: "test", model: "rivet" }),
  tools: [],
  skills: [],
  services: [],
  policy:
    agent.policy.snapshot === undefined
      ? { _tag: "Pinned", pin: Pins.makeCapability({ policy: "test" }) }
      : { _tag: "Portable", policy: agent.policy.snapshot },
  budget: {},
  children: [],
})
const executable = ExecutableManifest.make({
  root: pinned.pin,
  entries: [{ _tag: "Agent", pin: pinned.pin, manifest: pinned.manifest }],
})
const address = Address.make("agent:rivet-test")
let partitionSequence = 0
const partitionKey = (name: string) => [name, `${process.pid}-${++partitionSequence}`]
const registrations = [...ExecutableRegistration.requiredPins(executable)].map((pin) => ({
  pin,
  codec: "test",
  version: "1",
  payload: {},
}))

const makeOptions = (
  modelLayer: Layer.Layer<LanguageModel.LanguageModel>,
  client: Client,
  partition: string,
  sleepTimeout = 100,
): RuntimeActorOptions => ({
  environment: "test",
  tenant: "rivet",
  partition,
  storage: Layer.merge(Layer.succeed(ObjectStore, client.store), cryptoLayer),
  addresses: [{ address, executable, registrations }],
  resolver: ExecutableResolver.layerStatic([{ executable, agent: Agent.close(agent, modelLayer) }]).pipe(Layer.orDie),
  actorOptions: { sleepTimeout },
  recoveryIntervalMillis: 60_000,
})

const makeDefinition = (...args: Parameters<typeof makeOptions>) => makeRuntimeActor(makeOptions(...args))

const registerShutdown = <A extends Registry<Record<string, RuntimeActorDefinition>>>(
  context: TestContext,
  registry: A,
) => {
  context.onTestFinished(() => registry.shutdown())
  return registry
}

const observeSleepCleanup = (definition: RuntimeActorDefinition) => {
  let sleeps = 0
  const onSleep = definition.config.onSleep
  if (onSleep === undefined) throw new Error("Runtime actor must own sleep cleanup")
  Object.assign(definition.config, {
    onSleep: async (c: Parameters<typeof onSleep>[0]) => {
      await onSleep(c)
      expect(c.vars.host).toBeUndefined()
      sleeps += 1
    },
  })
  return () => sleeps
}

const addCrashWindowAction = (definition: RuntimeActorDefinition) => {
  const actions = definition.config.actions
  if (actions === undefined) throw new Error("Runtime actor actions are required")
  const send = actions.runtime.send
  return actor({
    ...definition.config,
    actions: {
      ...actions,
      test: {
        admitWithoutDoorbell: (c: Parameters<typeof send>[0], input: Runtime.SendInput) => {
          const host = c.vars.host
          if (host === undefined) throw new Error("Runtime host is not awake")
          return c.keepAwake(
            host.runtime.runPromise(
              Effect.flatMap(Runtime.Runtime, (runtime) => runtime.send(input)),
              { signal: c.abortSignal },
            ),
          )
        },
      },
    },
  })
}

const testPool = (context: TestContext) => ({
  poolName: `generalist-${process.pid}-${context.task.id}`,
})

test("executes a Runtime partition through canonical objects", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  let executions = 0
  const runtime = makeDefinition(
    makeModel(() => {
      executions++
    }),
    bucket,
    "execution",
  )
  const registry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { runtimePartition: runtime } }),
  )
  const { client } = await setupTest(context, registry)
  const partition = client.runtimePartition.getOrCreate(partitionKey("tenant-7"), testPool(context))
  const receipt = await partition.runtime.send({
    to: address,
    sessionId: "session:rivet-actor",
    idempotencyKey: "send:rivet-actor",
    prompt: "hello",
  })

  await partition.runtime.drain()
  const inspection = await partition.runtime.inspect(receipt.runId)
  expect(inspection.status).toBe("succeeded")
  expect(inspection.durability).toBe("durable")
  const completedUsage = inspection.usageFacts.find((fact) => fact._tag === "Completed")
  if (completedUsage === undefined) throw new Error("Expected a completed usage fact")
  expect(completedUsage.usage).toEqual(usage)
  expect(Object.getPrototypeOf(completedUsage.usage)).toBe(Object.prototype)
  const decoded = await Effect.runPromise(Schema.decodeEffect(RuntimeInspectionResponse)(inspection))
  const decodedUsage = decoded.usageFacts.find((fact) => fact._tag === "Completed")
  if (decodedUsage === undefined) throw new Error("Expected decoded completed usage")
  expect(Object.getPrototypeOf(decodedUsage.usage)).toBe(Response.Usage.prototype)
  const encodedResult = { answer: "forty-two" }
  const encoded = await Effect.runPromise(
    Schema.encodeEffect(RuntimeInspectionResponse)({
      ...decoded,
      lastEvent: {
        _tag: "ToolExecutionCompleted",
        turn: 0,
        call: Response.toolCallPart({ id: "call", name: "probe", params: {}, providerExecuted: false }),
        result: {
          ...Response.toolResultPart({
            id: "call",
            name: "probe",
            result: { answer: 42 },
            encodedResult,
            isFailure: false,
            providerExecuted: false,
            preliminary: false,
          }),
          taint: [],
        },
      },
    }),
  )
  expect(encoded.lastEvent).toMatchObject({ result: { result: { answer: 42 }, encodedResult } })

  const duplicate = await partition.runtime.send({
    to: address,
    sessionId: "session:rivet-actor",
    idempotencyKey: "send:rivet-actor",
    prompt: "hello",
  })
  expect(duplicate).toEqual(receipt)
  await partition.runtime.drain()
  expect((await partition.runtime.inspect(receipt.runId)).status).toBe("succeeded")
  expect(executions).toBe(1)
})

test("fresh actor discovers committed work without the admission doorbell", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  let executions = 0
  const countingModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        executions += 1
        return Stream.make(
          Response.makePart("text-delta", { id: "text", delta: "recovered from startup" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        )
      },
    }),
  )
  const key = partitionKey("crash-window")
  const firstDefinition = addCrashWindowAction(makeDefinition(countingModel, bucket, "crash-window", 60_000))
  const firstSleepCount = observeSleepCleanup(firstDefinition)
  const firstRegistry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { runtimeCrashWindow: firstDefinition } }),
  )
  const { client: firstClient } = await setupTest(context, firstRegistry)
  const firstPartition = firstClient.runtimeCrashWindow.getOrCreate(key, testPool(context))

  const runId = `run:crash-window:${process.pid}`
  await firstPartition.test.admitWithoutDoorbell({
    runId,
    to: address,
    sessionId: "session:crash-window",
    idempotencyKey: "crash-window",
    prompt: "execute after wake",
  })
  await firstRegistry.shutdown()
  expect(firstSleepCount()).toBeGreaterThanOrEqual(1)

  const secondDefinition = makeDefinition(
    countingModel,
    await Effect.runPromise(bucket.connect),
    "crash-window",
    60_000,
  )
  const secondRegistry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { runtimeCrashWindow: secondDefinition } }),
  )
  const { client: secondClient } = await setupTest(context, secondRegistry)
  const partition = secondClient.runtimeCrashWindow.getOrCreate(key, testPool(context))
  const inspection = await partition.runtime.inspect(runId)
  expect(inspection.status).toBe("succeeded")
  expect(executions).toBe(1)

  await partition.runtime.drain()
  await partition.runtime.drain()
  expect((await partition.runtime.inspect(runId)).status).toBe("succeeded")
  expect(executions).toBe(1)
}, 20_000)

test("registry reset makes interrupted never-replay work unknown without redispatch", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  const signalListeners = process.listenerCount("SIGINT")
  const terminationListeners = process.listenerCount("SIGTERM")
  let firstCalls = 0
  const { promise: started, resolve: start } = Promise.withResolvers<void>()
  const blockingModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.never,
      streamText: () => {
        firstCalls += 1
        start()
        return Stream.never
      },
    }),
  )
  const key = partitionKey("unknown-operation")
  const firstDefinition = makeDefinition(blockingModel, bucket, "unknown-operation", 60_000)
  const firstSleepCount = observeSleepCleanup(firstDefinition)
  const firstRegistry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { runtimeUnknown: firstDefinition } }),
  )
  const { client: firstClient } = await setupTest(context, firstRegistry)
  const firstPartition = firstClient.runtimeUnknown.getOrCreate(key, testPool(context))
  const receipt = await firstPartition.runtime.send({
    to: address,
    sessionId: "session:unknown-operation",
    idempotencyKey: "unknown-operation",
    prompt: "do not replay unknown work",
  })
  await started
  await firstRegistry.shutdown()
  expect(firstCalls).toBe(1)
  expect(firstSleepCount()).toBeGreaterThanOrEqual(1)

  let recoveredCalls = 0
  const recoveredModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.never,
      streamText: () => {
        recoveredCalls += 1
        return Stream.never
      },
    }),
  )
  const secondDefinition = makeDefinition(recoveredModel, await Effect.runPromise(bucket.connect), "unknown-operation")
  const secondRegistry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { runtimeUnknown: secondDefinition } }),
  )
  const { client: secondClient } = await setupTest(context, secondRegistry)
  const secondPartition = secondClient.runtimeUnknown.getOrCreate(key, testPool(context))
  expect((await secondPartition.runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
  await secondPartition.runtime.drain()
  expect((await secondPartition.runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
  expect(recoveredCalls).toBe(0)

  await secondRegistry.shutdown()
  expect(process.listenerCount("SIGINT")).toBe(signalListeners)
  expect(process.listenerCount("SIGTERM")).toBe(terminationListeners)
}, 30_000)

test("composes scoped application services and recovers missed work across three registries", async (context) => {
  let executions = 0
  const recoveryModel = makeModel(() => {
    executions++
  })
  const bucket = await Effect.runPromise(makeBucket())
  const counters: Counters = { initialized: 0, finalized: 0, reconciled: 0 }
  const key = partitionKey("composed-recovery")
  const options = makeOptions(recoveryModel, bucket, "composed-recovery", 60_000)
  const definition = makeComposedDefinition(options, counters)
  const firstRegistry = await setupRegistry({ envoy: testPool(context), use: { composed: definition } })
  context.onTestFinished(() => firstRegistry.shutdown())
  const { client: firstClient } = await setupTest(context, firstRegistry)
  const first = firstClient.composed.getOrCreate(key, testPool(context))
  const receipt = await first.work.admitWithoutNotify({
    to: address,
    sessionId: "composed",
    idempotencyKey: "composed",
    prompt: "hello",
  })
  const initial = await first.work.snapshot(receipt.runId)
  expect(initial.status).toBe("running")
  expect(initial.incarnation).toBe(1)
  expect(executions).toBe(0)
  await firstRegistry.shutdown()
  expect(counters.finalized).toBe(counters.initialized)

  const secondRegistry = await setupRegistry({
    envoy: testPool(context),
    use: {
      composed: makeComposedDefinition(
        makeOptions(recoveryModel, await Effect.runPromise(bucket.connect), "composed-recovery", 60_000),
        counters,
      ),
    },
  })
  context.onTestFinished(() => secondRegistry.shutdown())
  const { client: secondClient } = await setupTest(context, secondRegistry)
  const second = secondClient.composed.getOrCreate(key, testPool(context))
  const recovered = await second.work.snapshot(receipt.runId)
  expect(recovered.status).toBe("succeeded")
  expect(recovered.ownerId).not.toBe(initial.ownerId)
  expect(recovered.incarnation).toBe(2)
  await second.work.drain()
  expect((await second.work.snapshot(receipt.runId)).status).toBe("succeeded")
  await secondRegistry.shutdown()
  expect(counters.finalized).toBe(counters.initialized)

  const thirdRegistry = await setupRegistry({
    envoy: testPool(context),
    use: {
      composed: makeComposedDefinition(
        makeOptions(recoveryModel, await Effect.runPromise(bucket.connect), "composed-recovery", 60_000),
        counters,
      ),
    },
  })
  context.onTestFinished(() => thirdRegistry.shutdown())
  const { client: thirdClient } = await setupTest(context, thirdRegistry)
  const third = await thirdClient.composed.getOrCreate(key, testPool(context)).work.snapshot(receipt.runId)
  expect(third.status).toBe("succeeded")
  expect(third.ownerId).not.toBe(recovered.ownerId)
  expect(third.incarnation).toBe(3)
  expect(counters.reconciled).toBeGreaterThanOrEqual(8)
  await thirdRegistry.shutdown()
  expect(counters.finalized).toBe(3)
  expect(executions).toBe(1)
})

test("failed initialization releases acquired application services", async () => {
  const bucket = await Effect.runPromise(makeBucket())
  let initialized = 0
  let finalized = 0
  const application = Layer.effect(
    Application,
    Effect.acquireRelease(
      Effect.sync(() => Application.of({ incarnation: ++initialized })),
      () => Effect.sync(() => void finalized++),
    ),
  )
  const context: RuntimeActorContext = {
    actorId: "failed-initialization",
    schedule: {
      after: () => Promise.resolve("scheduled"),
      at: () => Promise.resolve("scheduled"),
      cancel: () => Promise.resolve(false),
      get: () => Promise.resolve(undefined),
      list: () => Promise.resolve([]),
    },
    cron: {
      set: () => Promise.resolve(),
      every: () => Promise.resolve(),
      get: () => Promise.resolve(undefined),
      list: () => Promise.resolve([]),
      delete: () => Promise.resolve(false),
      history: () => Promise.resolve([]),
    },
  }
  const {
    storage,
    resolver,
    actorOptions: _actorOptions,
    ...options
  } = makeOptions(model, bucket, "failed-initialization")
  const runtime = ManagedRuntime.make(
    Layer.merge(
      layerActorRuntime(context, {
        ...options,
        drainAction: "work.drain",
        initialize: () => RuntimeUnavailable.make({ message: "test initialization failure" }),
      }).pipe(Layer.provide(resolver), Layer.provide(storage)),
      application,
    ),
  )
  await expect(runtime.runPromise(ActorRuntime)).rejects.toBeDefined()
  await runtime.dispose()
  expect(initialized).toBe(1)
  expect(finalized).toBe(1)
})

test("custom cancellation uses the same object runtime without executing pending work", async (context) => {
  let executions = 0
  const cancellationModel = makeModel(() => {
    executions++
  })
  const bucket = await Effect.runPromise(makeBucket())
  const counters: Counters = { initialized: 0, finalized: 0, reconciled: 0 }
  const definition = makeComposedDefinition(makeOptions(cancellationModel, bucket, "composed-cancel", 60_000), counters)
  const registry = await setupRegistry({ envoy: testPool(context), use: { composed: definition } })
  context.onTestFinished(() => registry.shutdown())
  const { client } = await setupTest(context, registry)
  const partition = client.composed.getOrCreate(partitionKey("composed-cancel"), testPool(context))
  const receipt = await partition.work.admitWithoutNotify({
    to: address,
    sessionId: "cancel",
    idempotencyKey: "cancel",
    prompt: "do not execute",
  })
  await partition.work.cancel(receipt.runId)
  const drained = await partition.work.drain()
  expect((await partition.work.snapshot(receipt.runId)).status).toBe("cancelled")
  expect(drained.hasMore).toBe(false)
  expect(executions).toBe(0)
})

test("failed canonical admission leaves no run and typed custom actions can retry", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  const counters: Counters = { initialized: 0, finalized: 0, reconciled: 0 }
  const definition = makeComposedDefinition(makeOptions(model, bucket, "admission-failure", 60_000), counters)
  const registry = await setupRegistry({ envoy: testPool(context), use: { composed: definition } })
  context.onTestFinished(() => registry.shutdown())
  const { client } = await setupTest(context, registry)
  const partition = client.composed.getOrCreate(partitionKey("admission-failure"), testPool(context))
  await partition.work.drain()
  await Effect.runPromise(bucket.faults.failNextCreate({ phase: "before", reason: "authentication" }))
  const command = {
    runId: "run:admission-failure",
    to: address,
    sessionId: "admission-failure",
    idempotencyKey: "admission-failure",
    prompt: "hello",
  }
  await expect(partition.work.send(command)).rejects.toBeDefined()
  await expect(partition.work.snapshot(command.runId)).rejects.toBeDefined()
  const receipt = await partition.work.send(command)
  expect(receipt.runId).toBe(command.runId)
  await partition.work.drain()
  expect((await partition.work.snapshot(receipt.runId)).status).toBe("succeeded")
  expect(counters.initialized).toBe(1)
  await registry.shutdown()
  expect(counters.finalized).toBe(1)
})
