import { BunCrypto, BunRuntime } from "@effect/platform-bun"
import { Console, Duration, Effect, Layer } from "effect"
import { Prompt } from "effect/unstable/ai"
import * as Durability from "../packages/generalist/src/durability/index.js"
import { ObjectStore, type Service } from "../packages/generalist/src/durability/object-store.js"
import { Address } from "../packages/generalist/src/runtime/address.js"
import { makeTest } from "../packages/generalist/src/runtime/executable/manifest.js"
import { RunStore } from "../packages/generalist/src/runtime/run/store.js"
import { make as makeSimulator } from "../packages/generalist/src/testing/durability/index.js"

// Local CPU/request-amplification baseline, not provider latency or host support evidence.
const program = Effect.gen(function* () {
  const count = 100
  const simulator = yield* makeSimulator({ pageSize: 32 })
  const requests = { read: 0, create: 0, list: 0, readBytes: 0, attemptedWriteBytes: 0 }
  const measured = (store: Service): Service => ({
    capabilities: store.capabilities,
    read: (key, options) => Effect.suspend(() => {
      requests.read++
      return store.read(key, options).pipe(Effect.tap((object) => Effect.sync(() => {
        requests.readBytes += object?.bytes.byteLength ?? 0
      })))
    }),
    create: (key, bytes) => Effect.suspend(() => {
      requests.create++
      requests.attemptedWriteBytes += bytes.byteLength
      return store.create(key, bytes)
    }),
    list: (prefix, cursor) => Effect.suspend(() => {
      requests.list++
      return store.list(prefix, cursor)
    }),
  })
  const address = Address.make("agent:benchmark")
  const executable = makeTest("admission-benchmark", "1")
  const options = { environment: "benchmark", tenant: "local", partition: "admissions", addresses: [{ address, executable }] }
  const context = yield* Layer.build(Durability.layerRunStore(options).pipe(
    Layer.provide(Layer.succeed(ObjectStore, measured(simulator.store))),
  ))
  const store = yield* RunStore.pipe(Effect.provide(context))
  const latencies: number[] = []
  for (let index = 0; index < count; index++) {
    const [duration] = yield* store.admitSend({
      message: {
        id: `message-${index}`, to: address, sessionId: `session-${index}`,
        prompt: Prompt.make("Measured admission; no model or tool execution."),
        idempotencyKey: `admission-${index}`, correlationId: `correlation-${index}`, metadata: {},
      },
      executableRef: executable.ref,
      executableManifest: executable.manifest,
      registrations: [],
    }).pipe(Effect.timed)
    latencies.push(Duration.toMillis(duration))
  }
  const admissionRequests = { ...requests }
  const freshClient = yield* simulator.connect
  const [recoveryDuration, recovered] = yield* Effect.gen(function* () {
    const freshContext = yield* Layer.build(Durability.layerRunStore(options).pipe(
      Layer.provide(Layer.succeed(ObjectStore, measured(freshClient.store))),
    ))
    const freshStore = yield* RunStore.pipe(Effect.provide(freshContext))
    return yield* freshStore.list({ limit: count + 1 })
  }).pipe(Effect.timed)
  if (recovered.length !== count) return yield* Effect.die(new Error("Recovery omitted accepted admissions"))
  const sorted = [...latencies].sort((left, right) => left - right)
  yield* Console.log(JSON.stringify({
    schemaVersion: 1,
    scope: "local simulator admission and fresh-layer reconstruction; no providers or execution",
    runtime: `Bun ${Bun.version}; ${process.platform}/${process.arch}`,
    fixture: { admissions: count, concurrency: 1, pageSize: 32, snapshotPolicy: "engine defaults", seed: "deterministic authored messages" },
    admissionMillis: { first: latencies[0], last: latencies.at(-1), p50: sorted[49], p95: sorted[94], max: sorted.at(-1), total: latencies.reduce((sum, value) => sum + value, 0) },
    admissionRequests,
    recovery: {
      millis: Duration.toMillis(recoveryDuration), recoveredRuns: recovered.length,
      read: requests.read - admissionRequests.read,
      create: requests.create - admissionRequests.create,
      list: requests.list - admissionRequests.list,
      readBytes: requests.readBytes - admissionRequests.readBytes,
      attemptedWriteBytes: requests.attemptedWriteBytes - admissionRequests.attemptedWriteBytes,
    },
    limitations: ["No real S3/R2 latency", "No cross-host execution", "No pre-refactor comparison", "No warmup or statistical confidence interval", "Partition state is still eagerly materialized"],
  }, null, 2))
}).pipe(Effect.scoped, Effect.provide(BunCrypto.layer))

BunRuntime.runMain(program)
