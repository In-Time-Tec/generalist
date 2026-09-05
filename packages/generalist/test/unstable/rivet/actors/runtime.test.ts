/* oxlint-disable anti-slop/no-unsafe-dictionary-type, effecttsgo/async-function, typescript/no-unsafe-type-assertion -- Rivet owns these Promise boundaries; RawAccess defines generic dictionary rows and the direct fixture preserves its caller-selected row type. */
/* oxlint-disable anti-slop-effect/no-service-constructor-imports -- The fixture verifies application scope composition. */
import { Database } from "bun:sqlite"
import { Context, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { actor, setup, type ActorCron, type ActorSchedule, type Registry } from "rivetkit"
import { db, type RawAccess } from "rivetkit/db"
import { setupTest } from "rivetkit/test"
import { expect, test } from "vitest"
import type { SqliteStoreError } from "generalist/runtime/sql-driver"
import {
  ActorRuntime,
  layerActorRuntime,
  makeRuntimeActor,
  type ActorRuntimeServices,
  type RuntimeActorContext,
} from "generalist/unstable/rivet"
import { Errors, ExecutableResolver, Runtime } from "generalist/runtime"
import { address, addresses, makeResolver, makeResolverWithModel, partitionKey } from "./runtime.fixture.js"

class Application extends Context.Service<Application, { readonly incarnation: number }>()(
  "generalist/test/unstable/rivet/actors/runtime.test/Application",
) {}

type Host = ManagedRuntime.ManagedRuntime<
  ActorRuntimeServices | Application,
  SqliteStoreError | SqlError.SqlError | Errors.RuntimeUnavailable
>
interface Vars {
  host: Host | undefined
}

interface Counters {
  initialized: number
  finalized: number
  notifications: number
  executions: number
  failProjection: boolean
}

const makeDefinition = (
  counters: Counters,
  resolver: Layer.Layer<ExecutableResolver.ExecutableResolver> = makeResolver(() => counters.executions++),
) => {
  const application = Layer.effect(
    Application,
    Effect.acquireRelease(
      Effect.sync(() => Application.of({ incarnation: ++counters.initialized })),
      () => Effect.sync(() => void counters.finalized++),
    ),
  )
  const initialize = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE IF NOT EXISTS product_receipts (
      run_id TEXT PRIMARY KEY,
      application_incarnation INTEGER NOT NULL
    )`
  })
  const activationProjection = (sql: SqlClient.SqlClient) => ({
    applyInTransaction: (
      changes: Parameters<import("generalist/runtime/sql-driver").RunActivationProjection["applyInTransaction"]>[0],
    ) =>
      Effect.gen(function* () {
        for (const change of changes) {
          if (change.intent === "execute") {
            yield* sql`INSERT INTO product_receipts (run_id, application_incarnation)
              VALUES (${change.runId}, ${counters.initialized}) ON CONFLICT(run_id) DO NOTHING`
          }
        }
        if (counters.failProjection) {
          counters.failProjection = false
          return yield* Errors.RuntimeUnavailable.make({ message: "test projection failure" })
        }
      }).pipe(
        Effect.mapError((error) =>
          error._tag === "generalist/runtime/RuntimeUnavailable"
            ? error
            : Errors.RuntimeUnavailable.make({ message: "product receipt projection failed" }),
        ),
      ),
  })
  const requireHost = (c: { vars: Vars }) => {
    if (c.vars.host === undefined) throw new Error("actor is asleep")
    return c.vars.host
  }
  const dispose = async (c: { vars: Vars }) => {
    const host = c.vars.host
    c.vars.host = undefined
    if (host !== undefined) await host.dispose()
  }

  return actor({
    db: db({ warnOnManualTransactions: false }),
    createVars: (): Vars => ({ host: undefined }),
    options: { sleepTimeout: 60_000 },
    onWake: async (c) => {
      const runtime = ManagedRuntime.make(
        Layer.merge(
          layerActorRuntime(c, {
            drainAction: "work.drain",
            recoveryIntervalMillis: 60_000,
            initialize,
            activationProjection,
            addresses,
          }).pipe(Layer.provide(resolver), Layer.provide(application)),
          application,
        ),
      )
      try {
        await runtime.runPromise(ActorRuntime, { signal: c.abortSignal })
        c.vars.host = runtime
      } catch (error) {
        await runtime.dispose()
        throw error
      }
    },
    onSleep: dispose,
    onDestroy: dispose,
    actions: {
      work: {
        send: async (c, input: Runtime.SendInput) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.gen(function* () {
                yield* Application
                const receipt = yield* (yield* Runtime.Runtime).send(input)
                counters.notifications++
                yield* (yield* ActorRuntime).notify
                return receipt
              }),
              { signal: c.abortSignal },
            ),
          ),
        admitWithoutNotify: async (c, input: Runtime.SendInput) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.flatMap(Runtime.Runtime, (runtime) => runtime.send(input)),
              {
                signal: c.abortSignal,
              },
            ),
          ),
        cancel: async (c, runId: string) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.flatMap(Runtime.Runtime, (runtime) => runtime.cancel({ runId })),
              {
                signal: c.abortSignal,
              },
            ),
          ),
        drain: async (c) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.flatMap(ActorRuntime, (actorRuntime) => actorRuntime.drain),
              {
                signal: c.abortSignal,
              },
            ),
          ),
        snapshot: async (c, runId: string) =>
          c.keepAwake(
            requireHost(c).runPromise(
              Effect.gen(function* () {
                const sql = yield* SqlClient.SqlClient
                const owner = yield* ActorRuntime
                const runtime = yield* Runtime.Runtime
                const runs = yield* sql<{
                  count: number
                }>`SELECT COUNT(*) AS count FROM generalist_runs WHERE run_id = ${runId}`
                const receipts = yield* sql<{
                  count: number
                }>`SELECT COUNT(*) AS count FROM product_receipts WHERE run_id = ${runId}`
                const activations = yield* sql<{
                  count: number
                }>`SELECT COUNT(*) AS count FROM generalist_activations WHERE run_id = ${runId}`
                return {
                  ownerId: owner.ownerId,
                  status: runs[0]?.count === 1 ? (yield* runtime.inspect(runId)).status : undefined,
                  runs: Number(runs[0]?.count),
                  receipts: Number(receipts[0]?.count),
                  activations: Number(activations[0]?.count),
                }
              }),
              { signal: c.abortSignal },
            ),
          ),
      },
    },
  })
}

const registerShutdown = <A extends Registry<Record<string, ReturnType<typeof makeDefinition>>>>(
  context: Parameters<typeof setupTest>[0],
  registry: A,
) => {
  context.onTestFinished(() => registry.shutdown())
  return registry
}

const counters = (overrides: Partial<Counters> = {}): Counters => ({
  initialized: 0,
  finalized: 0,
  notifications: 0,
  executions: 0,
  failProjection: false,
  ...overrides,
})

const input = (key: string): Runtime.SendInput => ({
  runId: `run:${key}`,
  to: address,
  sessionId: `session:${key}`,
  idempotencyKey: key,
  prompt: "hello",
})

const incarnation = (ownerId: string) => Number(ownerId.slice(ownerId.lastIndexOf(":") + 1))

// The local engine outlives registries. Isolate test factories from other tests and
// processes, while keeping every recovery incarnation in the same pool.
const testPool = (context: Parameters<typeof setupTest>[0]) => ({
  poolName: `generalist-${process.pid}-${context.task.id}`,
})

test("executes the convenience Runtime actor through actor-local SQLite", async (context) => {
  const registry = setup({
    envoy: testPool(context),
    use: {
      runtimePartition: makeRuntimeActor({
        addresses,
        resolver: makeResolver(),
        recoveryIntervalMillis: 60_000,
      }),
    },
  })
  context.onTestFinished(() => registry.shutdown())
  const { client } = await setupTest(context, registry)
  const partition = client.runtimePartition.getOrCreate(partitionKey("convenience"))
  const command = input(`convenience-${process.pid}`)
  const receipt = await partition.runtime.send(command)

  await partition.runtime.drain()
  expect(await partition.runtime.inspect(receipt.runId)).toMatchObject({ status: "succeeded", durability: "durable" })

  const duplicate = await partition.runtime.send(command)
  expect(duplicate).toMatchObject({ runId: receipt.runId, duplicate: true })
})

test("composes application projection atomically and preserves typed custom actions", async (context) => {
  const observed = counters({ failProjection: true })
  const definition = makeDefinition(observed)
  const registry = registerShutdown(context, setup({ envoy: testPool(context), use: { partition: definition } }))
  const { client } = await setupTest(context, registry)
  const partition = client.partition.getOrCreate(partitionKey("atomic"))
  const command = input(`atomic-${process.pid}`)
  const runId = command.runId
  if (runId === undefined) throw new Error("test input must include a run ID")

  await expect(partition.work.send(command)).rejects.toBeDefined()
  expect(await partition.work.snapshot(runId)).toMatchObject({ runs: 0, receipts: 0, activations: 0 })

  const receipt = await partition.work.send(command)
  expect(await partition.work.snapshot(receipt.runId)).toMatchObject({ runs: 1, receipts: 1 })
  const duplicate = await partition.work.send(command)
  expect(duplicate.runId).toBe(receipt.runId)
  expect(duplicate.duplicate).toBe(true)
  expect((await partition.work.snapshot(receipt.runId)).receipts).toBe(1)
  expect(observed.initialized).toBe(1)

  await registry.shutdown()
  expect(observed.finalized).toBe(1)
})

test("a fresh registry recovers a missed notification exactly once during startup", async (context) => {
  const observed = counters()
  const key = partitionKey("recovery")
  const firstRegistry = registerShutdown(
    context,
    setup({ envoy: testPool(context), use: { partition: makeDefinition(observed) } }),
  )
  const { client: firstClient } = await setupTest(context, firstRegistry)
  const first = firstClient.partition.getOrCreate(key)
  const command = input(`recovery-${process.pid}`)
  const receipt = await first.work.admitWithoutNotify(command)
  const firstOwner = (await first.work.snapshot(receipt.runId)).ownerId
  expect(observed.executions).toBe(0)
  await firstRegistry.shutdown()
  expect(observed.finalized).toBe(observed.initialized)

  const secondRegistry = registerShutdown(
    context,
    setup({ envoy: testPool(context), use: { partition: makeDefinition(observed) } }),
  )
  const { client: secondClient } = await setupTest(context, secondRegistry)
  const reopened = secondClient.partition.getOrCreate(key)
  const recovered = await reopened.work.snapshot(receipt.runId)
  expect(incarnation(recovered.ownerId)).toBe(incarnation(firstOwner) + 1)
  expect(recovered).toMatchObject({ status: "succeeded", runs: 1, receipts: 1, activations: 0 })
  expect(observed.executions).toBe(1)
  expect((await reopened.work.snapshot(receipt.runId)).status).toBe("succeeded")
  await reopened.work.drain()
  expect(observed.executions).toBe(1)
  const secondOwner = recovered.ownerId
  await secondRegistry.shutdown()
  expect(observed.finalized).toBe(observed.initialized)

  const thirdRegistry = registerShutdown(
    context,
    setup({ envoy: testPool(context), use: { partition: makeDefinition(observed) } }),
  )
  const { client: thirdClient } = await setupTest(context, thirdRegistry)
  const third = thirdClient.partition.getOrCreate(key)
  const final = await third.work.snapshot(receipt.runId)
  expect(incarnation(final.ownerId)).toBe(incarnation(secondOwner) + 1)
  expect(final.status).toBe("succeeded")
  expect(observed.executions).toBe(1)
  expect(observed.notifications).toBe(0)
  await thirdRegistry.shutdown()
  expect(observed.finalized).toBe(observed.initialized)
})

test("failed initialization releases every acquired application scope", async () => {
  const database = new Database(":memory:")
  const raw: RawAccess = {
    // SAFETY: Bun SQLite accepts RawAccess bindings and the caller owns the selected row type.
    execute: async <TRow extends Record<string, unknown> = Record<string, unknown>>(
      query: string,
      ...params: unknown[]
    ) => database.query(query).all(...(params as never[])) as TRow[],
    transaction: async (callback) => {
      database.run("BEGIN IMMEDIATE")
      try {
        const result = await callback(raw)
        database.run("COMMIT")
        return result
      } catch (cause) {
        database.run("ROLLBACK")
        throw cause
      }
    },
    close: async () => database.close(),
  }
  const schedule: ActorSchedule = {
    after: async () => "scheduled",
    at: async () => "scheduled",
    cancel: async () => false,
    get: async () => undefined,
    list: async () => [],
  }
  const cron: ActorCron = {
    set: async () => {},
    every: async () => {},
    get: async () => undefined,
    list: async () => [],
    delete: async () => false,
    history: async () => [],
  }
  const actorContext: RuntimeActorContext = { actorId: "failed-initialization", db: raw, schedule, cron }
  let initialized = 0
  let finalized = 0
  const application = Layer.effect(
    Application,
    Effect.acquireRelease(
      Effect.sync(() => Application.of({ incarnation: ++initialized })),
      () => Effect.sync(() => void finalized++),
    ),
  )
  const runtime = ManagedRuntime.make(
    Layer.merge(
      layerActorRuntime(actorContext, {
        drainAction: "work.drain",
        addresses,
        initialize: Errors.RuntimeUnavailable.make({ message: "test initialization failure" }),
      }).pipe(Layer.provide(makeResolver())),
      application,
    ),
  )

  await expect(runtime.runPromise(ActorRuntime)).rejects.toBeDefined()
  await runtime.dispose()
  expect(initialized).toBe(1)
  expect(finalized).toBe(1)
  database.close()
})

test("cancellation drains through the same runtime and leaves no activation", async (context) => {
  const observed = counters()
  const registry = registerShutdown(
    context,
    setup({ envoy: testPool(context), use: { partition: makeDefinition(observed) } }),
  )
  const { client } = await setupTest(context, registry)
  const partition = client.partition.getOrCreate(partitionKey("cancellation"))
  const command = input(`cancel-${process.pid}`)
  const receipt = await partition.work.admitWithoutNotify(command)

  await partition.work.cancel(receipt.runId)
  await partition.work.drain()
  expect(await partition.work.snapshot(receipt.runId)).toMatchObject({ status: "cancelled", activations: 0 })
  expect(observed.executions).toBe(0)
})

test("scope interruption leaves never-replay work for explicit resolution without redispatch", async (context) => {
  const signalListeners = process.listenerCount("SIGINT")
  const terminationListeners = process.listenerCount("SIGTERM")
  const observed = counters()
  const { promise: started, resolve: start } = Promise.withResolvers<void>()
  const blockingModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.never,
      streamText: () => {
        observed.executions++
        start()
        return Stream.never
      },
    }),
  )
  const key = partitionKey("unknown-operation")
  const firstRegistry = registerShutdown(
    context,
    setup({
      envoy: testPool(context),
      use: { partition: makeDefinition(observed, makeResolverWithModel(blockingModel)) },
    }),
  )
  const { client: firstClient } = await setupTest(context, firstRegistry)
  const first = firstClient.partition.getOrCreate(key)
  const receipt = await first.work.send(input(`unknown-${process.pid}`))
  const firstOwner = (await first.work.snapshot(receipt.runId)).ownerId
  await started
  await firstRegistry.shutdown()
  expect(observed.executions).toBe(1)
  expect(observed.finalized).toBe(observed.initialized)

  let recoveredExecutions = 0
  const recoveredModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.never,
      streamText: () => {
        recoveredExecutions++
        return Stream.never
      },
    }),
  )
  const secondRegistry = registerShutdown(
    context,
    setup({
      envoy: testPool(context),
      use: { partition: makeDefinition(observed, makeResolverWithModel(recoveredModel)) },
    }),
  )
  const { client: secondClient } = await setupTest(context, secondRegistry)
  const reopened = secondClient.partition.getOrCreate(key)
  const recovered = await reopened.work.snapshot(receipt.runId)
  expect(incarnation(recovered.ownerId)).toBe(incarnation(firstOwner) + 1)
  expect(recovered.status).toBe("needs-resolution")
  await reopened.work.drain()
  expect((await reopened.work.snapshot(receipt.runId)).status).toBe("needs-resolution")
  expect(recoveredExecutions).toBe(0)

  await secondRegistry.shutdown()
  expect(observed.finalized).toBe(observed.initialized)
  expect(process.listenerCount("SIGINT")).toBe(signalListeners)
  expect(process.listenerCount("SIGTERM")).toBe(terminationListeners)
}, 30_000)
