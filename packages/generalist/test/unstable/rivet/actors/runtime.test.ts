/* oxlint-disable effecttsgo/async-function -- These integration tests exercise Rivet's Promise-only actor API. */
/* oxlint-disable effecttsgo/new-promise -- raw Rivet WebSocket readiness is exposed as a Promise-only callback boundary. */
/* oxlint-disable effecttsgo/strict-effect-provide -- the server factory is the actor's application composition root. */
import { layer as cryptoLayer } from "@effect/platform-bun/BunCrypto"
import {
  actor,
  setup,
  type Registry,
  type RegistryActors,
  type RegistryConfigInput,
  type UniversalWebSocket,
} from "rivetkit"
import { setupTest as setupRivetTest } from "rivetkit/test"
import { createRequire } from "node:module"
import { afterAll, expect, test, type TestContext } from "vitest"
import { Context, Deferred, Effect, Layer, ManagedRuntime, Redacted, Schema, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { HttpBody, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Agent, AgentManifest, Approvals, Permissions, Pins } from "generalist"
import { Host, type MakeError } from "generalist/host"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver, Runtime } from "generalist/runtime"
import { Authentication, CurrentPrincipal } from "../../../../src/server/auth.js"
import { Unauthorized } from "../../../../src/server/errors.js"
import { eventCodec } from "../../../../src/server/wire.js"
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
import { DurabilityFailure } from "../../../../src/durability/errors.js"
import { make as makeJournal } from "../../../../src/durability/internal/journal.js"
import {
  decode as decodeState,
  diff,
  encode as encodeState,
} from "../../../../src/durability/internal/runtime-state.js"
import { RuntimeUnavailable } from "../../../../src/runtime/errors.js"
import { ObjectStore, ObjectStoreFailure } from "../../../../src/durability/object-store.js"
import { RuntimeInspectionResponse } from "../../../../src/runtime/inspection.js"
import { emptyState } from "../../../../src/runtime/state/projection.js"
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
  const { storage, resolver, actorOptions, namespace, ...runtimeOptions } = options
  return actor({
    createVars: (): Vars => ({ host: undefined }),
    options: actorOptions ?? { sleepTimeout: 60_000 },
    onWake: (c) => {
      const runtime = ManagedRuntime.make(
        Layer.merge(
          layerActorRuntime(c, {
            ...runtimeOptions,
            ...namespace(c),
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
    run: (c) =>
      c.keepAwake(
        requireHost(c).runPromise(Effect.flatMap(ActorRuntime, (runtime) => runtime.drain).pipe(Effect.asVoid), {
          signal: c.abortSignal,
        }),
      ),
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

const rejectAfter = (message: string): Promise<never> =>
  Effect.runPromise(Effect.sleep("5 seconds").pipe(Effect.andThen(Effect.die(message))))

const makeOptions = (
  modelLayer: Layer.Layer<LanguageModel.LanguageModel>,
  client: Client,
  partition: string,
  sleepTimeout = 100,
): RuntimeActorOptions => ({
  namespace: ({ key }) => ({ environment: "test", tenant: "rivet", partition: `${partition}:${JSON.stringify(key)}` }),
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
    run: () => undefined,
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
  await expect.poll(async () => (await partition.runtime.inspect(runId)).status).toBe("succeeded")
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
  await expect.poll(async () => (await secondPartition.runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
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
  await expect.poll(async () => (await second.work.snapshot(receipt.runId)).status).toBe("succeeded")
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
    namespace,
    actorOptions: _actorOptions,
    ...options
  } = makeOptions(model, bucket, "failed-initialization")
  const runtime = ManagedRuntime.make(
    Layer.merge(
      layerActorRuntime(context, {
        ...options,
        ...namespace({ actorId: context.actorId, key: ["failed-initialization"] }),
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

test("reopened recovery is ready for inspection and concurrent cancellation while its model blocks", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  const key = partitionKey("blocked-reopen")
  const firstRegistry = registerShutdown(
    context,
    await setupRegistry({
      envoy: testPool(context),
      use: { blocked: addCrashWindowAction(makeDefinition(model, bucket, "blocked-reopen", 60_000)) },
    }),
  )
  const { client: firstClient } = await setupTest(context, firstRegistry)
  const command = {
    runId: "run:blocked-reopen",
    to: address,
    sessionId: "blocked-reopen",
    idempotencyKey: "blocked-reopen",
    prompt: "recover without blocking actor readiness",
  }
  const receipt = await firstClient.blocked.getOrCreate(key, testPool(context)).test.admitWithoutDoorbell(command)
  await firstRegistry.shutdown()

  let executions = 0
  let interrupted = 0
  const started = Promise.withResolvers<void>()
  const blockingModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.never,
      streamText: () => {
        executions++
        started.resolve()
        return Stream.never.pipe(Stream.ensuring(Effect.sync(() => void interrupted++)))
      },
    }),
  )
  const registry = registerShutdown(
    context,
    await setupRegistry({
      envoy: testPool(context),
      use: {
        blocked: makeDefinition(blockingModel, await Effect.runPromise(bucket.connect), "blocked-reopen", 60_000),
      },
    }),
  )
  const { client } = await setupTest(context, registry)
  const partition = client.blocked.getOrCreate(key, testPool(context))
  const inspection = await Effect.runPromise(
    Effect.promise(() => partition.runtime.inspect(receipt.runId)).pipe(Effect.timeout("2 seconds")),
  )
  expect(inspection.status).toBe("running")
  await started.promise
  const drains = Promise.all([partition.runtime.drain(), partition.runtime.drain()])
  const [cancelled, concurrent] = await Effect.runPromise(
    Effect.promise(() =>
      Promise.all([
        partition.runtime.cancel({ runId: receipt.runId, commandId: "cancel:blocked-reopen" }),
        partition.runtime.inspect(receipt.runId),
      ]),
    ).pipe(Effect.timeout("2 seconds")),
  )
  expect(cancelled).toBeUndefined()
  expect(["running", "cancelling", "cancelled"]).toContain(concurrent.status)
  await drains
  expect((await partition.runtime.inspect(receipt.runId)).status).toBe("cancelled")
  expect(await partition.runtime.send(command)).toEqual(receipt)
  await partition.runtime.drain()
  expect(executions).toBe(1)
  expect(interrupted).toBe(1)
})

test("periodic recovery discovers missed admission without an inspection or startup drain", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  let executions = 0
  const definition = addCrashWindowAction(
    makeRuntimeActor({
      ...makeOptions(
        makeModel(() => void executions++),
        bucket,
        "periodic-recovery",
        60_000,
      ),
      recoveryIntervalMillis: 5_000,
    }),
  )
  const registry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { periodic: definition } }),
  )
  const { client } = await setupTest(context, registry)
  const partition = client.periodic.getOrCreate(partitionKey("periodic-recovery"), testPool(context))
  const receipt = await partition.test.admitWithoutDoorbell({
    to: address,
    sessionId: "periodic-recovery",
    idempotencyKey: "periodic-recovery",
    prompt: "recover from the independent cron",
  })
  expect(executions).toBe(0)
  await expect.poll(() => executions, { timeout: 8_000 }).toBe(1)
  await partition.runtime.drain()
  expect((await partition.runtime.inspect(receipt.runId)).status).toBe("succeeded")
  expect(executions).toBe(1)
})

test.for(["empty", "throwing"] as const)("rejects a %s namespace before building storage", async (kind, context) => {
  const bucket = await Effect.runPromise(makeBucket())
  let built = 0
  let failure: DurabilityFailure | undefined
  const definition = makeRuntimeActor({
    ...makeOptions(model, bucket, "invalid-namespace", 60_000),
    namespace: () => {
      if (kind === "throwing") throw RuntimeUnavailable.make({ message: "Injected resolver failure" })
      return { environment: "test", tenant: "rivet", partition: "" }
    },
    storage: Layer.merge(
      cryptoLayer,
      Layer.effect(
        ObjectStore,
        Effect.sync(() => {
          built++
          return bucket.store
        }),
      ),
    ),
  })
  const onWake = definition.config.onWake
  if (onWake === undefined) throw new Error("Runtime actor must initialize on wake")
  const probe = actor({
    ...definition.config,
    onWake: async (c) => {
      try {
        await onWake(c)
      } catch (cause) {
        if (!Schema.is(DurabilityFailure)(cause)) throw cause
        failure = cause
      }
    },
    run: () => undefined,
    actions: {
      probe: (c) => ({
        reason: failure?.reason,
        message: failure?.message,
        host: c.vars.host === undefined,
        opening: c.vars.opening === undefined,
      }),
    },
  })
  const registry = await setupRegistry({ envoy: testPool(context), use: { invalid: probe } })
  context.onTestFinished(() => registry.shutdown())
  const { client } = await setupTest(context, registry)
  expect(await client.invalid.getOrCreate(partitionKey(`invalid-${kind}`), testPool(context)).probe()).toEqual({
    reason: "configuration",
    message: kind === "empty" ? "Invalid Rivet Runtime namespace" : "Rivet Runtime namespace resolver failed",
    host: true,
    opening: true,
  })
  expect(built).toBe(0)
})

test("two instances of one definition isolate commands and recover their own stable namespaces", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  let executions = 0
  let resolutions = 0
  const countingModel = makeModel(() => void executions++)
  const options = makeOptions(countingModel, bucket, "isolated", 60_000)
  const definition = makeRuntimeActor({
    ...options,
    namespace: (identity) => {
      resolutions++
      return options.namespace(identity)
    },
  })
  const registry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { isolated: definition } }),
  )
  const { client } = await setupTest(context, registry)
  const keys = [partitionKey("isolation-a"), partitionKey("isolation-b")] as const
  const first = client.isolated.getOrCreate(keys[0], testPool(context))
  const second = client.isolated.getOrCreate(keys[1], testPool(context))
  const command = { to: address, sessionId: "shared-session", idempotencyKey: "shared-command", prompt: "hello" }
  const firstCommand = { ...command, runId: "run:isolation-a" }
  const secondCommand = { ...command, runId: "run:isolation-b", prompt: "a different request" }
  const [firstReceipt, secondReceipt] = await Promise.all([
    first.runtime.send(firstCommand),
    second.runtime.send(secondCommand),
  ])
  await Promise.all([first.runtime.drain(), second.runtime.drain()])
  expect((await first.runtime.inspect(firstReceipt.runId)).status).toBe("succeeded")
  expect((await second.runtime.inspect(secondReceipt.runId)).status).toBe("succeeded")
  await expect(first.runtime.inspect(secondReceipt.runId)).rejects.toBeDefined()
  await expect(second.runtime.inspect(firstReceipt.runId)).rejects.toBeDefined()
  expect(resolutions).toBe(2)
  expect(executions).toBe(2)
  await registry.shutdown()

  const reopened = registerShutdown(
    context,
    await setupRegistry({
      envoy: testPool(context),
      use: { isolated: makeDefinition(countingModel, await Effect.runPromise(bucket.connect), "isolated", 60_000) },
    }),
  )
  const { client: fresh } = await setupTest(context, reopened)
  const freshFirst = fresh.isolated.getOrCreate(keys[0], testPool(context))
  const freshSecond = fresh.isolated.getOrCreate(keys[1], testPool(context))
  expect(await freshFirst.runtime.send(firstCommand)).toEqual(firstReceipt)
  expect(await freshSecond.runtime.send(secondCommand)).toEqual(secondReceipt)
  await Promise.all([freshFirst.runtime.drain(), freshSecond.runtime.drain()])
  expect((await freshFirst.runtime.inspect(firstReceipt.runId)).status).toBe("succeeded")
  expect((await freshSecond.runtime.inspect(secondReceipt.runId)).status).toBe("succeeded")
  expect(executions).toBe(2)
})

test("idle hosts stop storage heartbeats and wait for closure before concurrent admission", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  let opened = 0
  let closed = 0
  let operations = 0
  let resolutions = 0
  let executions = 0
  let holdClosure = false
  const closing = Promise.withResolvers<void>()
  const release = await Effect.runPromise(Deferred.make<void>())
  context.onTestFinished(() => Effect.runPromise(Deferred.succeed(release, undefined).pipe(Effect.asVoid)))
  const storage = Layer.merge(
    cryptoLayer,
    Layer.effect(
      ObjectStore,
      Effect.acquireRelease(
        Effect.sync(() => {
          opened++
          return ObjectStore.of({
            ...bucket.store,
            list: (prefix, cursor) =>
              Effect.sync(() => void operations++).pipe(Effect.andThen(bucket.store.list(prefix, cursor))),
            create: (key, bytes) =>
              Effect.sync(() => void operations++).pipe(Effect.andThen(bucket.store.create(key, bytes))),
          })
        }),
        () =>
          Effect.gen(function* () {
            if (holdClosure) {
              holdClosure = false
              closing.resolve()
              yield* Deferred.await(release)
            }
            closed++
          }),
      ),
    ),
  )
  const options = makeOptions(
    makeModel(() => void executions++),
    bucket,
    "idle-host",
    60_000,
  )
  const definition = makeRuntimeActor({
    ...options,
    storage,
    ownershipLeaseMillis: 1_000,
    reconcileInterval: "50 millis",
    namespace: (identity) => {
      resolutions++
      return options.namespace(identity)
    },
  })
  const registry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { idle: definition } }),
  )
  const { client } = await setupTest(context, registry)
  const partition = client.idle.getOrCreate(partitionKey("idle-host"), testPool(context))
  const command = { to: address, sessionId: "idle-host", idempotencyKey: "idle-host", prompt: "hello" }
  await partition.runtime.send(command)
  await partition.runtime.drain()
  await expect.poll(() => closed === opened && opened > 0).toBe(true)
  const idleOperations = operations
  await Effect.runPromise(Effect.sleep("1100 millis"))
  expect(operations).toBe(idleOperations)
  expect(closed).toBe(opened)

  holdClosure = true
  const drain = partition.runtime.drain()
  await closing.promise
  const beforeAdmission = opened
  let admitted = false
  const admission = partition.runtime.send({ ...command, idempotencyKey: "after-idle" }).then((receipt) => {
    admitted = true
    return receipt
  })
  await Effect.runPromise(Effect.sleep("50 millis"))
  expect(admitted).toBe(false)
  expect(opened).toBe(beforeAdmission)
  await Effect.runPromise(Deferred.succeed(release, undefined))
  await drain
  const receipt = await admission
  await partition.runtime.drain()
  expect((await partition.runtime.inspect(receipt.runId)).status).toBe("succeeded")
  await expect.poll(() => closed === opened).toBe(true)
  expect(executions).toBe(2)
  expect(resolutions).toBe(1)
})

test("an idle drain cannot retire a host with concurrent canonical admission", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  const reconcileEntered = Promise.withResolvers<void>()
  const releaseReconcile = await Effect.runPromise(Deferred.make<void>())
  context.onTestFinished(() => Effect.runPromise(Deferred.succeed(releaseReconcile, undefined).pipe(Effect.asVoid)))
  let reconciles = 0
  let closed = 0
  const options = makeOptions(model, bucket, "idle-admission-race", 60_000)
  const definition = makeRuntimeActor({
    ...options,
    storage: Layer.merge(
      cryptoLayer,
      Layer.effect(
        ObjectStore,
        Effect.acquireRelease(Effect.succeed(bucket.store), () => Effect.sync(() => void closed++)),
      ),
    ),
    reconcile: () =>
      Effect.gen(function* () {
        if (++reconciles === 2) {
          reconcileEntered.resolve()
          yield* Deferred.await(releaseReconcile)
        }
        return undefined
      }),
  })
  Object.assign(definition.config, { run: () => undefined })
  const registry = registerShutdown(
    context,
    await setupRegistry({ envoy: testPool(context), use: { race: definition } }),
  )
  const { client } = await setupTest(context, registry)
  const partition = client.race.getOrCreate(partitionKey("idle-admission-race"), testPool(context))
  const drain = partition.runtime.drain()
  await reconcileEntered.promise
  const paused = await Effect.runPromise(bucket.faults.pauseNextCreate())
  context.onTestFinished(() => Effect.runPromise(paused.release))
  const admission = partition.runtime.send({
    to: address,
    sessionId: "idle-admission-race",
    idempotencyKey: "idle-admission-race",
    prompt: "do not close while admitting",
  })
  await Effect.runPromise(paused.entered)
  await Effect.runPromise(Deferred.succeed(releaseReconcile, undefined))
  expect((await drain).hasMore).toBe(false)
  expect(closed).toBe(0)
  await Effect.runPromise(paused.release)
  const receipt = await admission
  await partition.runtime.drain()
  expect((await partition.runtime.inspect(receipt.runId)).status).toBe("succeeded")
  await expect.poll(() => closed).toBeGreaterThan(0)
})

test.for(["transport", "lease"] as const)(
  "%s monitor loss interrupts active work and safely reopens",
  async (loss, context) => {
    const bucket = await Effect.runPromise(makeBucket())
    let failList = false
    let closed = 0
    let executions = 0
    let interrupted = 0
    const started = Promise.withResolvers<void>()
    const blockingModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.never,
        streamText: () => {
          executions++
          started.resolve()
          return Stream.never.pipe(Stream.ensuring(Effect.sync(() => void interrupted++)))
        },
      }),
    )
    const options = makeOptions(blockingModel, bucket, `monitor-${loss}`, 60_000)
    const definition = makeRuntimeActor({
      ...options,
      workerId: "forced-loss-worker",
      reconcileInterval: "50 millis",
      storage: Layer.merge(
        cryptoLayer,
        Layer.effect(
          ObjectStore,
          Effect.acquireRelease(
            Effect.succeed(
              ObjectStore.of({
                ...bucket.store,
                list: (prefix, cursor) =>
                  Effect.suspend(() => {
                    if (!failList) return bucket.store.list(prefix, cursor)
                    failList = false
                    return ObjectStoreFailure.make({
                      operation: "list",
                      key: prefix,
                      reason: "authentication",
                      message: "Injected monitor failure",
                    })
                  }),
              }),
            ),
            () => Effect.sync(() => void closed++),
          ),
        ),
      ),
    })
    const registry = registerShutdown(
      context,
      await setupRegistry({ envoy: testPool(context), use: { monitor: definition } }),
    )
    const { client } = await setupTest(context, registry)
    const key = partitionKey(`monitor-${loss}`)
    const partition = client.monitor.getOrCreate(key, testPool(context))
    const receipt = await partition.runtime.send({
      to: address,
      sessionId: "monitor",
      idempotencyKey: "monitor",
      prompt: "lose ownership while executing",
    })
    await started.promise
    const closedBeforeLoss = closed
    if (loss === "transport") failList = true
    else {
      const injection = ManagedRuntime.make(
        Layer.merge(cryptoLayer, Layer.succeed(ObjectStore, (await Effect.runPromise(bucket.connect)).store)),
      )
      context.onTestFinished(() => injection.dispose())
      await injection.runPromise(
        Effect.gen(function* () {
          const journal = yield* makeJournal(options.namespace({ actorId: "diagnostic", key }))
          yield* journal.commit({ id: "force-lease-loss", input: null }, (state) =>
            Effect.gen(function* () {
              const decoded = yield* decodeState(
                state,
                emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 16 }),
              )
              const workers = new Map(decoded.workers)
              workers.set("forced-loss-worker", { incarnation: "replacement-incarnation", expiresAt: 0 })
              return { patches: diff(state, yield* encodeState({ ...decoded, workers })), receipt: null }
            }),
          )
        }),
      )
    }
    await expect.poll(() => closed).toBeGreaterThan(closedBeforeLoss)
    expect(interrupted).toBe(1)
    await expect.poll(async () => (await partition.runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
    await partition.runtime.drain()
    expect(executions).toBe(1)
  },
)

test("bridges authenticated HTTP and raw WebSocket traffic through one actor host", async (context) => {
  const bucket = await Effect.runPromise(makeBucket())
  const closedAgent = Agent.close(agent, model)
  const serverAgents = { [closedAgent.name]: closedAgent } as const
  let serverBuilds = 0
  let serverFinalized = 0
  let streamFinalized = 0
  let heldAbortEntered = 0
  let revoked = false
  const principal = { id: "rivet-controller", tenantId: "rivet", role: "controller" as const }
  const auth = Layer.effect(
    Authentication,
    Effect.acquireRelease(
      Effect.succeed(
        Authentication.of({
          bearer: (httpEffect, { credential }) =>
            Redacted.value(credential) === "local-token"
              ? Effect.provideService(
                  httpEffect.pipe(
                    Effect.tap(() =>
                      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
                        Effect.sync(() => {
                          if (!request.url.endsWith("/sessions/rivet-server-bridge-held/events")) return
                          if (!(request.source instanceof Request)) return
                          const onAbort = () => void heldAbortEntered++
                          if (request.source.signal.aborted) onAbort()
                          else request.source.signal.addEventListener("abort", onAbort, { once: true })
                        }),
                      ),
                    ),
                    Effect.map((response) =>
                      response.body._tag === "Stream"
                        ? HttpServerResponse.setBody(
                            response,
                            HttpBody.stream(
                              Stream.onExit(response.body.stream, () => Effect.sync(() => void streamFinalized++)),
                              response.body.contentType,
                              response.body.contentLength,
                            ),
                          )
                        : response,
                    ),
                  ),
                  CurrentPrincipal,
                  principal,
                )
              : Effect.fail(Unauthorized.make({})),
        }),
      ),
      () => Effect.sync(() => void serverFinalized++),
    ),
  )
  const server = {
    make: () =>
      Effect.sync(() => void serverBuilds++).pipe(
        Effect.andThen(
          Effect.gen(function* () {
            const host = yield* Host.make({
              agents: serverAgents,
              revision: "server-bridge",
            }).pipe(Effect.provide(Layer.merge(Approvals.layerAutoApprove, Permissions.layerAllowAll)))
            return {
              host,
              auth,
              authorization: { tenantId: "rivet", authorize: () => Effect.succeed(!revoked) },
            }
          }),
        ),
        Effect.provide(model),
      ),
  }
  const options = makeOptions(model, bucket, "server-bridge", 60_000)
  const definition = makeRuntimeActor<typeof serverAgents, MakeError, never, never, Runtime.Runtime>({
    ...options,
    server,
  })
  const firstSleepCount = observeSleepCleanup(definition)
  const registry = registerShutdown(
    context,
    await setupRegistry({
      envoy: testPool(context),
      shutdown: { gracePeriodMs: 3_000 },
      use: { bridge: definition },
    }),
  )
  const { client } = await setupTest(context, registry)
  const key = partitionKey("server-bridge")
  const partition = client.bridge.getOrCreate(key, testPool(context))
  const headers = { authorization: "Bearer local-token", "content-type": "application/json" }
  const created = await partition.fetch("/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "rivet-server-bridge", agent: closedAgent.name }),
  })
  expect(created.status).toBe(200)
  const rejected = await partition.fetch("/sessions", {
    method: "POST",
    headers: { ...headers, authorization: "Bearer wrong-token" },
    body: JSON.stringify({ id: "rivet-server-bridge-rejected" }),
  })
  expect(rejected.status).toBe(401)
  const queueResponses = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      partition.fetch("/sessions/rivet-server-bridge/queue", {
        method: "POST",
        headers,
        body: JSON.stringify({ commandId: `queue-${index}`, input: `concurrent-${index}` }),
      }),
    ),
  )
  expect(queueResponses.map((response) => response.status)).toEqual([200, 200, 200, 200])
  const first = client.bridge.getOrCreate(key, testPool(context))
  revoked = true
  const revokedResponse = await partition.fetch("/sessions/rivet-server-bridge", { headers })
  expect(revokedResponse.status).toBe(403)
  revoked = false

  const firstResponse = await first.fetch("/sessions/rivet-server-bridge", { headers })
  expect(firstResponse.status).toBe(200)
  const streaming = await first.fetch("/sessions/rivet-server-bridge/events", { headers })
  expect(streaming.status).toBe(200)
  expect(streaming.body).not.toBeNull()
  await streaming.body?.cancel()
  await expect.poll(() => streamFinalized).toBe(1)
  expect(serverFinalized).toBe(0)

  const heldSession = await first.fetch("/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "rivet-server-bridge-held", agent: closedAgent.name }),
  })
  expect(heldSession.status).toBe(200)
  const heldStreaming = await first.fetch("/sessions/rivet-server-bridge-held/events", { headers })
  expect(heldStreaming.status).toBe(200)
  const heldReader = heldStreaming.body!.getReader()
  let heldDone = false
  let heldError: unknown
  const heldRead = heldReader.read().then(
    (result) => {
      heldDone = result.done === true
      return undefined
    },
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Web Streams reject with an untyped platform cause.
    (error: unknown) => {
      heldError = error
      return undefined
    },
  )

  let websocketAuthorization = "Bearer local-token"
  const previousWebSocket = globalThis.WebSocket
  const require = createRequire(import.meta.url)
  // SAFETY: Rivet's ws peer dependency is installed by the test host and exports the standard WebSocket implementation.
  // oxlint-disable-next-line typescript/no-unsafe-assignment, typescript/no-unsafe-member-access
  const NodeWebSocket = require("ws").WebSocket
  class AuthenticatedWebSocket extends NodeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      // oxlint-disable-next-line typescript/no-unsafe-call -- the ws peer's constructor is exposed through a legacy any declaration.
      super(url, protocols, { headers: { authorization: websocketAuthorization }, handshakeTimeout: 5_000 })
    }
  }
  // SAFETY: The Rivet SDK resolves the process WebSocket constructor once; the test constructor adds the application auth header while preserving SDK protocols.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion
  globalThis.WebSocket = AuthenticatedWebSocket as unknown as typeof WebSocket
  let authenticatedSocket: UniversalWebSocket | undefined
  let socketClosed: Promise<void> | undefined
  let websocketClosed = 0
  try {
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- Rivet's legacy raw WebSocket declaration is any-typed.
    authenticatedSocket = await Promise.race([
      first.webSocket("/sessions/rivet-server-bridge/ws"),
      rejectAfter("Rivet WebSocket bridge open timed out"),
    ])
    if (authenticatedSocket === undefined) throw new Error("Rivet WebSocket bridge did not return a socket")
    const openSocket = authenticatedSocket
    await new Promise<void>((resolve, reject) => {
      openSocket.addEventListener("open", resolve)
      openSocket.addEventListener("error", () => reject(new Error("Rivet WebSocket bridge failed to open")))
      openSocket.addEventListener("close", () => reject(new Error("Rivet WebSocket bridge closed before opening")))
    })
    expect(openSocket.readyState).toBe(openSocket.OPEN)
    const frame = new Promise<unknown>((resolve, reject) => {
      // oxlint-disable-next-line typescript/no-unsafe-member-access -- UniversalWebSocket's SDK event payload is any-typed.
      openSocket.addEventListener("message", (event) => resolve(event.data))
      openSocket.addEventListener("error", () => reject(new Error("Rivet WebSocket bridge frame failed")))
    })
    const decodedFrame = await frame
    expect(Schema.is(Schema.String)(decodedFrame)).toBe(true)
    const decodedEvent = await Effect.runPromise(eventCodec.decode(String(decodedFrame)))
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest's asymmetric matcher is intentionally any-typed.
    expect(decodedEvent).toMatchObject({ _tag: expect.any(String) })
    socketClosed = new Promise<void>((resolve) => {
      openSocket.addEventListener("close", () => {
        websocketClosed++
        resolve()
      })
    })

    websocketAuthorization = "Bearer wrong-token"
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- Rivet's legacy raw WebSocket declaration is any-typed.
    const rejectedSocket: UniversalWebSocket = await first.webSocket("/sessions/rivet-server-bridge/ws")
    const rejectedSocketClosed = await Promise.race([
      new Promise<boolean>((resolve) => {
        rejectedSocket.addEventListener("close", () => resolve(true))
        rejectedSocket.addEventListener("error", () => resolve(true))
      }),
      Effect.runPromise(Effect.sleep("5 seconds").pipe(Effect.as(false))),
    ])
    expect(rejectedSocketClosed).toBe(true)
  } finally {
    websocketAuthorization = "Bearer local-token"
    globalThis.WebSocket = previousWebSocket
  }

  const shutdown = registry.shutdown()
  await Promise.race([heldRead, rejectAfter("held SSE did not terminate on actor shutdown")])
  expect(heldDone || heldError !== undefined).toBe(true)
  expect(heldAbortEntered).toBe(1)
  await Promise.race([socketClosed, rejectAfter("Rivet WebSocket bridge did not close on actor shutdown")])
  expect(authenticatedSocket?.readyState).toBe(authenticatedSocket?.CLOSED)
  expect(websocketClosed).toBe(1)
  await expect.poll(() => streamFinalized).toBe(2)
  await shutdown
  expect(firstSleepCount()).toBeGreaterThanOrEqual(1)
  expect(serverBuilds).toBe(1)
  expect(serverFinalized).toBe(1)

  const replacementDefinition = makeRuntimeActor<typeof serverAgents, MakeError, never, never, Runtime.Runtime>({
    ...makeOptions(model, await Effect.runPromise(bucket.connect), "server-bridge", 60_000),
    server,
  })
  const replacementSleepCount = observeSleepCleanup(replacementDefinition)
  const replacementRegistry = registerShutdown(
    context,
    await setupRegistry({
      envoy: testPool(context),
      shutdown: { gracePeriodMs: 3_000 },
      use: { bridge: replacementDefinition },
    }),
  )
  const { client: replacementClient } = await setupTest(context, replacementRegistry)
  const replacement = replacementClient.bridge.getOrCreate(key, testPool(context))
  const replacementResponse = await replacement.fetch("/sessions/rivet-server-bridge", { headers })
  expect(replacementResponse.status).toBe(200)
  await replacementRegistry.shutdown()
  expect(replacementSleepCount()).toBeGreaterThanOrEqual(1)
  expect(serverBuilds).toBe(2)
  expect(serverFinalized).toBe(2)
})
