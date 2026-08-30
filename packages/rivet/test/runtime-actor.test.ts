/* oxlint-disable effecttsgo/async-function -- These integration tests exercise Rivet's Promise-only actor API. */
import { setup, type Registry } from "rivetkit"
import { setupTest } from "rivetkit/test"
import { expect, test } from "vitest"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, AgentManifest, Pins } from "tenetkit"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver, Runtime } from "tenetkit/runtime"
import { makeRuntimeActor, type RuntimeActorDefinition } from "../src/actors/index.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
})

const model = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () =>
      Effect.succeed([
        Response.makePart("text", { text: "actor response" }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      ]),
    streamText: () =>
      Stream.make(
        Response.makePart("text-delta", { id: "text", delta: "actor response" }),
        Response.makePart("finish", { reason: "stop", usage, response: undefined }),
      ),
  }),
)

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

const makeDefinition = (modelLayer: Layer.Layer<LanguageModel.LanguageModel>, sleepTimeout = 100) =>
  makeRuntimeActor({
    addresses: [{ address, executable, registrations }],
    resolver: ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, modelLayer) }]),
    actorOptions: { sleepTimeout },
    recoveryIntervalMillis: 60_000,
  })

const registerShutdown = <A extends Registry<Record<string, RuntimeActorDefinition>>>(
  context: Parameters<typeof setupTest>[0],
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
  const admitWithoutDoorbell = async (
    c: Parameters<typeof send>[0],
    input: Runtime.SendInput,
  ): Promise<{ readonly runId: string }> => {
    const host = c.vars.host
    if (host === undefined) throw new Error("Runtime host is not awake")
    const receipt = await host.runtime.runPromise(
      Effect.flatMap(Runtime.Runtime, (runtime) => runtime.send(input)),
      { signal: c.abortSignal },
    )
    c.sleep()
    return receipt
  }
  Object.assign(actions, { test: { admitWithoutDoorbell } })
}

type CrashWindowPartition = {
  readonly test: {
    readonly admitWithoutDoorbell: (input: Runtime.SendInput) => Promise<{ readonly runId: string }>
  }
}

const addOwnerAction = (definition: RuntimeActorDefinition) => {
  const actions = definition.config.actions
  if (actions === undefined) throw new Error("Runtime actor actions are required")
  const owner = async (c: Parameters<typeof actions.runtime.send>[0]): Promise<string> => {
    if (c.vars.host === undefined) throw new Error("Runtime host is not awake")
    return c.vars.host.ownerId
  }
  Object.assign(actions, { test: { owner } })
}

type OwnerPartition = {
  readonly test: {
    readonly owner: () => Promise<string>
  }
}

const incarnation = (ownerId: string) => Number(ownerId.slice(ownerId.lastIndexOf(":") + 1))

test("executes one Runtime partition through actor-local SQLite", async (context) => {
  const runtime = makeDefinition(model)
  const registry = registerShutdown(context, setup({ use: { runtimePartition: runtime } }))
  const { client } = await setupTest(context, registry)
  const partition = client.runtimePartition.getOrCreate(partitionKey("tenant-7"))
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

  const duplicate = await partition.runtime.send({
    to: address,
    sessionId: "session:rivet-actor",
    idempotencyKey: "send:rivet-actor",
    prompt: "hello",
  })
  expect(duplicate.runId).toBe(receipt.runId)
  expect(duplicate.duplicate).toBe(true)
})

test("startup drain closes the committed-activation/doorbell crash window exactly once", async (context) => {
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
  const definition = makeDefinition(countingModel, 60_000)
  addCrashWindowAction(definition)
  const sleepCount = observeSleepCleanup(definition)
  const registry = registerShutdown(context, setup({ use: { runtimeCrashWindow: definition } }))
  const { client } = await setupTest(context, registry)
  const handle = client.runtimeCrashWindow.getOrCreate(partitionKey("crash-window"))
  // SAFETY: addCrashWindowAction installed this exact test-only action on the definition registered above.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const partition = handle as typeof handle & CrashWindowPartition

  const runId = `run:crash-window:${process.pid}`
  // Forced sleep may also drop this post-commit action response; the supplied Run ID remains authoritative.
  await partition.test
    .admitWithoutDoorbell({
      runId,
      to: address,
      sessionId: "session:crash-window",
      idempotencyKey: "crash-window",
      prompt: "execute after wake",
    })
    .catch(() => undefined)
  const inspection = await partition.runtime.inspect(runId)
  expect(inspection.status).toBe("succeeded")
  expect(executions).toBe(1)
  expect(sleepCount()).toBeGreaterThanOrEqual(1)

  await partition.runtime.drain()
  await partition.runtime.drain()
  expect((await partition.runtime.inspect(runId)).status).toBe("succeeded")
  expect(executions).toBe(1)
}, 20_000)

test("registry reset makes interrupted never-replay work unknown without redispatch", async (context) => {
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
  const firstDefinition = makeDefinition(blockingModel, 60_000)
  addOwnerAction(firstDefinition)
  const firstSleepCount = observeSleepCleanup(firstDefinition)
  const firstRegistry = registerShutdown(context, setup({ use: { runtimeUnknown: firstDefinition } }))
  const { client: firstClient } = await setupTest(context, firstRegistry)
  const firstHandle = firstClient.runtimeUnknown.getOrCreate(key)
  // SAFETY: addOwnerAction installed this exact test-only action on both definitions registered below.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const firstPartition = firstHandle as typeof firstHandle & OwnerPartition
  const firstOwner = await firstPartition.test.owner()
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
  const secondDefinition = makeDefinition(recoveredModel)
  addOwnerAction(secondDefinition)
  const secondRegistry = registerShutdown(context, setup({ use: { runtimeUnknown: secondDefinition } }))
  const { client: secondClient } = await setupTest(context, secondRegistry)
  const secondHandle = secondClient.runtimeUnknown.getOrCreate(key)
  // SAFETY: addOwnerAction installed this exact test-only action on both definitions registered above.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const secondPartition = secondHandle as typeof secondHandle & OwnerPartition
  const secondOwner = await secondPartition.test.owner()

  expect(secondOwner).not.toBe(firstOwner)
  expect(incarnation(secondOwner)).toBe(incarnation(firstOwner) + 1)
  expect((await secondPartition.runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
  await secondPartition.runtime.drain()
  expect((await secondPartition.runtime.inspect(receipt.runId)).status).toBe("needs-resolution")
  expect(recoveredCalls).toBe(0)

  await secondRegistry.shutdown()
  expect(process.listenerCount("SIGINT")).toBe(signalListeners)
  expect(process.listenerCount("SIGTERM")).toBe(terminationListeners)
}, 30_000)
