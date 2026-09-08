import { Console, Duration, Effect, Layer, Schema } from "effect"
import { BunRuntime } from "@effect/platform-bun"
import process from "node:process"
import { Tool } from "effect/unstable/ai"
import { makeCapability } from "../packages/generalist/src/core/durable/pin.js"
import { make as makeToolManifest } from "../packages/generalist/src/core/durable/manifest/tool-manifest.js"
import { make as makeExecutable } from "../packages/generalist/src/runtime/executable/manifest.js"
import { layerStatic, type StaticToolExecutable } from "../packages/generalist/src/runtime/executable/resolver.js"
import { Runtime, RunStore, RunExecutor } from "../packages/generalist/src/runtime/index.js"
import { ObjectStore, type Service } from "../packages/generalist/src/durability/object-store.js"
import { activate, layer } from "../packages/generalist/src/durability/index.js"
import { layer as cryptoLayer } from "@effect/platform-bun/BunCrypto"
import { make } from "../packages/generalist/src/testing/durability/index.js"

const workload = { tools: 1000, outputBytes: 256, coldSamples: 3, concurrency: 1, toolLatencyMillis: 1 } as const
const pinned = makeToolManifest({
  name: "recovery-check",
  tool: makeCapability("recovery-check"),
  input: makeCapability("input"),
  output: makeCapability("output"),
  failure: makeCapability("failure"),
  replay: "never",
})
const executable = makeExecutable({ root: pinned.pin, entries: [{ _tag: "Tool", ...pinned }] })
const registrations = [
  pinned.manifest.tool,
  pinned.manifest.input,
  pinned.manifest.output,
  pinned.manifest.failure,
].map((pin) => ({ pin, codec: "test", version: "1", payload: {} }))
const counts = { read: 0, create: 0, list: 0, readBytes: 0, attemptedWriteBytes: 0 }
const measured = (store: Service): Service => ({
  capabilities: store.capabilities,
  read: (key, options) =>
    Effect.suspend(() => {
      counts.read++
      return store.read(key, options).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            counts.readBytes += value?.bytes.byteLength ?? 0
          }),
        ),
      )
    }),
  create: (key, bytes) =>
    Effect.suspend(() => {
      counts.create++
      counts.attemptedWriteBytes += bytes.byteLength
      return store.create(key, bytes)
    }),
  list: (prefix, cursor) =>
    Effect.suspend(() => {
      counts.list++
      return store.list(prefix, cursor)
    }),
})

const program = Effect.gen(function* () {
  const storage = yield* make()
  let executions = 0
  const resolution: StaticToolExecutable = {
    _tag: "Tool",
    pinned,
    executable,
    tool: Tool.make("recovery-check", {}),
    input: Schema.Unknown,
    output: Schema.Unknown,
    failure: Schema.Unknown,
    executor: {
      execute: () =>
        Effect.sleep(workload.toolLatencyMillis).pipe(
          Effect.andThen(
            Effect.sync(() => {
              executions++
              const result = "x".repeat(workload.outputBytes)
              return { _tag: "Success" as const, result, encodedResult: result }
            }),
          ),
        ),
    },
    authorizer: () => ({ authorize: () => Effect.succeed({ _tag: "Execute" }) }),
  }
  const fresh = () =>
    layer({
      environment: "cold-recovery",
      tenant: "local",
      partition: "fixed-workload",
      addresses: [],
      workerId: "cold-worker",
      schedulerMode: "external",
    }).pipe(
      Layer.provide(
        Layer.mergeAll(Layer.succeed(ObjectStore, measured(storage.store)), cryptoLayer, layerStatic([resolution])),
      ),
    )
  const within = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(Effect.flatMap(Layer.build(fresh()), (context) => effect.pipe(Effect.provideContext(context))))
  const ids: Array<string> = []
  yield* Console.log({
    phase: "start",
    scope: "local object simulator; not provider qualification",
    workload,
    bun: process.versions.bun,
  })
  yield* within(
    Effect.gen(function* () {
      yield* activate
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const executor = yield* RunExecutor.RunExecutor
      for (let index = 0; index < workload.tools; index++) {
        const receipt = yield* runtime.startExecution({
          executable,
          registrations,
          sessionId: "coding-session",
          idempotencyKey: `tool-${index}`,
          prompt: "",
          metadata: { tool: { input: { index } } },
        })
        ids.push(receipt.runId)
        yield* executor.execute(
          yield* store.claimExecution({ runId: receipt.runId, commandId: `claim-${index}`, ownerId: "cold-worker" }),
        )
        const state = yield* runtime.inspect(receipt.runId)
        if (state.status !== "succeeded") return yield* Effect.die(`Tool ${index} did not succeed: ${state.status}`)
        if ((index + 1) % 100 === 0)
          yield* Console.log({
            phase: "build",
            completed: index + 1,
            executions,
            counts: { ...counts },
            memory: process.memoryUsage(),
          })
      }
    }),
  )
  for (let sample = 0; sample < workload.coldSamples; sample++) {
    yield* Effect.scoped(
      Effect.gen(function* () {
        const before = { ...counts }
        const memoryBefore = process.memoryUsage()
        const [elapsed, context] = yield* Layer.build(fresh()).pipe(Effect.timed)
        yield* Console.log({
          phase: "cold-construction",
          sample,
          millis: Duration.toMillis(elapsed),
          memoryBefore,
          memoryAfter: process.memoryUsage(),
          requests: {
            read: counts.read - before.read,
            create: counts.create - before.create,
            list: counts.list - before.list,
            readBytes: counts.readBytes - before.readBytes,
            attemptedWriteBytes: counts.attemptedWriteBytes - before.attemptedWriteBytes,
          },
        })
        const [auditElapsed] = yield* Effect.gen(function* () {
          const runtime = yield* Runtime.Runtime
          for (const id of ids) {
            if ((yield* runtime.inspect(id)).status !== "succeeded")
              return yield* Effect.die(`Lost Tool outcome: ${id}`)
          }
        }).pipe(Effect.provideContext(context), Effect.timed)
        yield* Console.log({
          phase: "outcome-audit",
          sample,
          millis: Duration.toMillis(auditElapsed),
          outcomes: ids.length,
        })
      }),
    )
  }
  if (executions !== workload.tools)
    return yield* Effect.die(`Expected ${workload.tools} executions; observed ${executions}`)
  yield* Console.log({ phase: "passed", workload, executions })
})

BunRuntime.runMain(program)
