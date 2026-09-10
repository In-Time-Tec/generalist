/* oxlint-disable effecttsgo/strict-effect-provide -- This benchmark script is its own Effect application entry point. */
import { BunCrypto, BunRuntime } from "@effect/platform-bun"
import { Array, Clock, Config, Console, Duration, Effect, Fiber, Layer, Option, Order, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { BlobStore, layer as layerBlobStore } from "../packages/generalist/src/blob-store/index.js"
import { Agent, ToolContext, ToolOutput } from "../packages/generalist/src/index.js"
import { activate } from "../packages/generalist/src/durability/index.js"
import { ObjectStore, type Service } from "../packages/generalist/src/durability/object-store.js"
import { make as makeJournal, type State } from "../packages/generalist/src/durability/internal/journal.js"
import { sequenceName } from "../packages/generalist/src/durability/internal/protocol.js"
import { makeTest } from "../packages/generalist/src/core/durable/manifest/executable-manifest.js"
import { Address } from "../packages/generalist/src/runtime/address.js"
import { RunStore, type Service as RunStoreService } from "../packages/generalist/src/runtime/run/store.js"
import { ExecutableResolver, LocalScheduler, RunExecutor, Runtime } from "../packages/generalist/src/runtime/index.js"
import { layerRunStore } from "../packages/generalist/src/runtime/state/store.js"
import {
  make as makeSimulator,
  type Client,
  type Simulator,
} from "../packages/generalist/src/testing/durability/index.js"
import { allowAllAuthorization } from "../packages/generalist/test/authorization.js"
import { objectRuntimeLayer, objectWorkerId } from "../packages/generalist/test/runtime/execution/object.js"

const environment = "benchmark"
const tenant = "local"
const pageSize = 32
const hotAdmissions = 64
const partitions = 8
const admissionsPerPartition = 8
const longHistoryAdmissions = 128
const artifactPayloadBytes = 64 * 1024
const artifactWrites = 8
const toolOutputProjectionBytes = 1024
const ownerReplacements = 8
const idleScans = 16

type Requests = {
  read: number
  create: number
  list: number
  readBytes: number
  attemptedWriteBytes: number
}

const requests = (): Requests => ({ read: 0, create: 0, list: 0, readBytes: 0, attemptedWriteBytes: 0 })
const difference = (after: Requests, before: Requests): Requests => ({
  read: after.read - before.read,
  create: after.create - before.create,
  list: after.list - before.list,
  readBytes: after.readBytes - before.readBytes,
  attemptedWriteBytes: after.attemptedWriteBytes - before.attemptedWriteBytes,
})
const snapshot = (value: Requests): Requests => ({ ...value })
const assertRequestAccounting = (label: string, value: Requests) =>
  Effect.sync(() => {
    for (const [metric, amount] of Object.entries(value)) {
      if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error(`${label} ${metric} must be a nonnegative integer`)
    }
    if (value.read === 0 && value.readBytes !== 0) throw new Error(`${label} recorded read bytes without a read`)
    if (value.create === 0 && value.attemptedWriteBytes !== 0)
      throw new Error(`${label} recorded attempted write bytes without a create`)
  })
const assertWorkloadAccounting = (input: {
  readonly idle: Requests
  readonly cas: Requests
  readonly timeout: Requests
}) =>
  Effect.sync(() => {
    if (input.idle.create !== 0 || input.idle.attemptedWriteBytes !== 0)
      throw new Error("Idle reconciliation attempted a durable write")
    if (input.cas.create < 3 || input.cas.read < 1)
      throw new Error("CAS contention accounting did not observe create conflict and recovery reads")
    if (input.timeout.create < 1 || input.timeout.read < 1)
      throw new Error("Scheduler timeout accounting did not observe durable reads and writes")
  })
const hostMemory = () =>
  Effect.sync(() => {
    const sample = process.memoryUsage()
    return { rss: sample.rss, heapUsed: sample.heapUsed }
  })

const measured = (store: Service, counts: Requests): Service => ({
  capabilities: store.capabilities,
  read: (key, options) =>
    Effect.suspend(() => {
      counts.read++
      return store.read(key, options).pipe(
        Effect.tap((object) =>
          Effect.sync(() => {
            counts.readBytes += object?.bytes.byteLength ?? 0
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
  list: (prefix, options) =>
    Effect.suspend(() => {
      counts.list++
      return store.list(prefix, options)
    }),
})

const values = (count: number) => globalThis.Array.from({ length: count }, (_, index) => index)
const percentile = (sorted: ReadonlyArray<number>, ratio: number) =>
  sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)]
const distribution = (samples: ReadonlyArray<number>) => {
  const sorted = Array.sort(samples, Order.Number)
  return {
    samples: samples.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1),
    total: samples.reduce((total, value) => total + value, 0),
  }
}

const duration = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.timed,
    Effect.map(([elapsed]) => Duration.toMillis(elapsed)),
  )

const address = Address.make("agent:benchmark")
const executable = makeTest("durability-workload-benchmark", "1")
const admission = (scope: string, index: number) => ({
  message: {
    id: `message:${scope}:${index}`,
    to: address,
    sessionId: `session:${scope}:${index}`,
    prompt: Prompt.make("Measured durable admission; no model or tool execution."),
    idempotencyKey: `admission:${scope}:${index}`,
    correlationId: `correlation:${scope}:${index}`,
    metadata: {},
  },
  executableRef: executable.ref,
  executableManifest: executable.manifest,
  registrations: [],
})

const options = (partition: string, workerId?: string) => {
  const base = {
    environment,
    tenant,
    partition,
    addresses: [{ address, executable, registrations: [] }],
  }
  if (workerId === undefined) return base
  return { ...base, workerId }
}

const open = (client: Client, counts: Requests, partition: string, workerId?: string) =>
  Effect.gen(function* () {
    const objects = Layer.succeed(ObjectStore, measured(client.store, counts))
    const context = yield* Layer.build(
      Layer.merge(
        layerRunStore(options(partition, workerId)),
        layerBlobStore({ environment, tenant, maxBytes: artifactPayloadBytes }),
      ).pipe(Layer.provide(objects)),
    )
    if (workerId !== undefined) yield* activate.pipe(Effect.provide(context))
    return {
      blobs: yield* BlobStore.pipe(Effect.provide(context)),
      store: yield* RunStore.pipe(Effect.provide(context)),
    }
  })

const timedAdmissions = (store: RunStoreService, scope: string, count: number, concurrency: number) =>
  Effect.forEach(
    values(count),
    (index) =>
      store.admitSend(admission(scope, index)).pipe(
        Effect.timed,
        Effect.map(([elapsed, receipt]) => ({ millis: Duration.toMillis(elapsed), receipt })),
      ),
    { concurrency },
  )

const runtimeUsage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const runtimeFinish = Response.makePart("finish", { reason: "stop", usage: runtimeUsage, response: undefined })
const runtimeWaitTool = Tool.make("benchmark_wait", {
  parameters: Schema.Struct({}),
  success: Agent.AwaitEventResult,
  failure: Agent.AwaitEventInvalid,
}).addDependency(ToolContext.ToolContext)
const runtimeToolkit = Toolkit.make(runtimeWaitTool)
const runtimeAgent = Agent.make({ name: "durability-workload-wait", toolkit: runtimeToolkit })

const makeRuntimeWakeWorkload = (storage: Simulator, waitTimeout: Duration.Input = "1 hour") => {
  const counts = requests()
  const client: Client = { store: measured(storage.store, counts) }
  let modelCalls = 0
  let handlerCalls = 0
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        modelCalls++
        return modelCalls % 2 === 1
          ? Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", {
                id: `benchmark-wait-${modelCalls}`,
                name: "benchmark_wait",
                params: {},
                providerExecuted: false,
              }),
              runtimeFinish,
            ])
          : Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: `benchmark-complete-${modelCalls}`, delta: "resumed" }),
              runtimeFinish,
            ])
      },
    }),
  )
  const handlers = runtimeToolkit.toLayer({
    benchmark_wait: () => {
      handlerCalls++
      return Agent.awaitEvent({ _tag: "Webhook", source: "durability-workload" }, { timeout: waitTimeout })
    },
  })
  const runtimeLayer = objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" } }, client).pipe(
    Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
  )
  const layer = Layer.mergeAll(runtimeLayer, model, handlers, allowAllAuthorization)
  const within = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))
  const run = (index: number) =>
    Effect.gen(function* () {
      const beforeModel = modelCalls
      const beforeHandler = handlerCalls
      const runId = yield* within(
        Effect.gen(function* () {
          const host = yield* Runtime.Runtime
          const executor = yield* RunExecutor.RunExecutor
          const store = yield* RunStore
          yield* host.register(runtimeAgent)
          const handle = yield* host.start(runtimeAgent, "wait", {
            sessionId: `runtime-wake-session-${index}`,
            idempotencyKey: `runtime-wake-${index}`,
          })
          yield* executor.execute(
            yield* store.claimExecution({
              commandId: `runtime-wake-claim-${index}`,
              runId: handle.runId,
              ownerId: objectWorkerId,
            }),
          )
          if ((yield* host.inspect(handle.runId)).status !== "waiting")
            return yield* Effect.die(new Error("Runtime workload did not persist the await-event suspension"))
          return handle.runId
        }),
      )
      if (modelCalls !== beforeModel + 1 || handlerCalls !== beforeHandler + 1)
        return yield* Effect.die(new Error("Runtime workload dispatch count diverged before reopen"))
      const [wakeElapsed, outcomeMillis] = yield* within(
        Effect.gen(function* () {
          const host = yield* Runtime.Runtime
          const executor = yield* RunExecutor.RunExecutor
          const store = yield* RunStore
          yield* host.register(runtimeAgent)
          if (modelCalls !== beforeModel + 1 || handlerCalls !== beforeHandler + 1)
            return yield* Effect.die(new Error("Fresh host redispatched before durable wake"))
          const disposition = yield* host.wake({
            runId,
            commandId: `runtime-wake-delivery-${index}`,
            event: {
              _tag: "Webhook",
              dedupeKey: `runtime-wake-delivery-${index}`,
              source: "durability-workload",
              payload: { index },
              headers: {},
            },
          })
          if (disposition._tag !== "Resumed")
            return yield* Effect.die(new Error("Runtime workload rejected matching wake"))
          const terminalCommitMillis = yield* duration(
            executor.execute(
              yield* store.claimExecution({
                commandId: `runtime-wake-resume-claim-${index}`,
                runId,
                ownerId: objectWorkerId,
              }),
            ),
          )
          if ((yield* host.inspect(runId)).status !== "succeeded")
            return yield* Effect.die(new Error("Runtime workload did not complete after wake"))
          return terminalCommitMillis
        }),
      ).pipe(Effect.timed)
      if (modelCalls !== beforeModel + 2 || handlerCalls !== beforeHandler + 1)
        return yield* Effect.die(new Error("Runtime workload redispatched the waiting tool after reopen"))
      return { outcomeMillis, wakeMillis: Duration.toMillis(wakeElapsed) }
    })
  const runTimeout = Effect.gen(function* () {
    const beforeModel = modelCalls
    const beforeHandler = handlerCalls
    const runId = yield* within(
      Effect.gen(function* () {
        const host = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore
        yield* host.register(runtimeAgent)
        const handle = yield* host.start(runtimeAgent, "wait", {
          sessionId: "runtime-timeout-session",
          idempotencyKey: "runtime-timeout",
        })
        yield* executor.execute(
          yield* store.claimExecution({
            commandId: "runtime-timeout-claim",
            runId: handle.runId,
            ownerId: objectWorkerId,
          }),
        )
        if ((yield* host.inspect(handle.runId)).status !== "waiting")
          return yield* Effect.die(new Error("Timeout workload did not persist the await-event suspension"))
        return handle.runId
      }),
    )
    if (modelCalls !== beforeModel + 1 || handlerCalls !== beforeHandler + 1)
      return yield* Effect.die(new Error("Timeout workload dispatch count diverged before reopen"))
    yield* Effect.sleep("1 second")
    const timeoutMillis = yield* within(
      Effect.gen(function* () {
        const host = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* host.register(runtimeAgent)
        if (modelCalls !== beforeModel + 1 || handlerCalls !== beforeHandler + 1)
          return yield* Effect.die(new Error("Fresh timeout host redispatched before scheduler drain"))
        yield* scheduler.tick
        yield* scheduler.idle
        if ((yield* host.inspect(runId)).status !== "succeeded")
          return yield* Effect.die(new Error("Scheduler did not complete the expired await-event run"))
      }).pipe(duration),
    )
    if (modelCalls !== beforeModel + 2 || handlerCalls !== beforeHandler + 1)
      return yield* Effect.die(new Error("Scheduler timeout redispatched the waiting tool"))
    return timeoutMillis
  })
  return { counts, run, runTimeout }
}

const program = Effect.gen(function* () {
  const simulator = yield* makeSimulator({ pageSize })
  const counts = requests()
  const memoryBefore = yield* hostMemory()
  const runtimeWake = makeRuntimeWakeWorkload(yield* makeSimulator())
  const beforeRuntimeWake = snapshot(runtimeWake.counts)
  const runtimeWakeSamples = yield* Effect.forEach(values(8), runtimeWake.run)
  const wakeRecoveryMillis = runtimeWakeSamples.map(({ wakeMillis }) => wakeMillis)
  const runtimeOutcomeMillis = runtimeWakeSamples.map(({ outcomeMillis }) => outcomeMillis)
  const wakeRecoveryRequests = difference(runtimeWake.counts, beforeRuntimeWake)
  const runtimeTimeoutWake = makeRuntimeWakeWorkload(yield* makeSimulator(), "10 millis")
  const beforeTimeoutWake = snapshot(runtimeTimeoutWake.counts)
  const timeoutWakeMillis = [yield* runtimeTimeoutWake.runTimeout]
  const timeoutWakeRequests = difference(runtimeTimeoutWake.counts, beforeTimeoutWake)

  const hot = yield* open(simulator, counts, "hot")
  const beforeHot = snapshot(counts)
  const hotSamples = yield* timedAdmissions(hot.store, "hot", hotAdmissions, 8)
  const hotAdmissionMillis = hotSamples.map(({ millis }) => millis)
  const hotReceipts = hotSamples.map(({ receipt }) => receipt)
  const hotStateReadMillis = yield* Effect.forEach(
    hotReceipts,
    (receipt) => duration(hot.store.inspect(receipt.runId)),
    {
      concurrency: 8,
    },
  )
  const hotOutcomeMillis = yield* Effect.forEach(
    hotReceipts.slice(0, 32),
    (receipt, index) =>
      duration(
        hot.store.recordReward({
          commandId: `reward:hot:${index}`,
          runId: receipt.runId,
          leaf: `leaf:hot:${index}`,
          value: 1,
          source: "local-workload",
        }),
      ),
    { concurrency: 8 },
  )
  const hotRequests = difference(counts, beforeHot)

  const partitionStores = yield* Effect.forEach(values(partitions), (index) =>
    open(simulator, counts, `independent-${index}`),
  )
  const beforePartitions = snapshot(counts)
  const independentAdmissionMillis = yield* Effect.forEach(
    partitionStores,
    ({ store }, index) => timedAdmissions(store, `independent-${index}`, admissionsPerPartition, 4),
    { concurrency: partitions },
  ).pipe(Effect.map((groups) => groups.flat().map(({ millis }) => millis)))
  const independentRequests = difference(counts, beforePartitions)

  const longHistory = yield* open(simulator, counts, "long-history")
  const beforeLongHistory = snapshot(counts)
  const longHistoryAdmissionSamples = yield* timedAdmissions(
    longHistory.store,
    "long-history",
    longHistoryAdmissions,
    1,
  )
  const longHistoryAdmissionMillis = longHistoryAdmissionSamples.map(({ millis }) => millis)
  const fresh = yield* simulator.connect
  const cold = yield* open(fresh, counts, "long-history")
  const coldRecoveryMillis = yield* Effect.forEach(values(16), () =>
    duration(cold.store.list({ limit: longHistoryAdmissions + 1 })),
  )
  const longHistoryRequests = difference(counts, beforeLongHistory)

  const conflictStore = yield* open(simulator, counts, "conflict-retry")
  const beforeConflictRetry = snapshot(counts)
  const acceptedConflictRetry = admission("conflict-retry", 0)
  const initialConflictReceipt = yield* conflictStore.store.admitSend(acceptedConflictRetry)
  yield* conflictStore.store
    .admitSend({
      ...acceptedConflictRetry,
      message: { ...acceptedConflictRetry.message, prompt: Prompt.make("different idempotency input") },
    })
    .pipe(Effect.flip)
  const conflictRetryMillis = [yield* duration(conflictStore.store.admitSend(acceptedConflictRetry))]
  const retriedReceipt = yield* conflictStore.store.admitSend(acceptedConflictRetry)
  if (retriedReceipt.runId !== initialConflictReceipt.runId)
    return yield* Effect.die(new Error("Conflict workload retry changed the accepted receipt"))
  const conflictRetryRequests = difference(counts, beforeConflictRetry)

  const casBucket = yield* makeSimulator()
  const casRequests = requests()
  const casFirstClient: Client = { store: measured(casBucket.store, casRequests) }
  const casSecondClient: Client = { store: measured((yield* casBucket.connect).store, casRequests) }
  const casIdentity = { environment, tenant, partition: "cas-contention" }
  const casOpen = (client: Client) => makeJournal(casIdentity).pipe(Effect.provideService(ObjectStore, client.store))
  const casFirst = yield* casOpen(casFirstClient)
  const casSecond = yield* casOpen(casSecondClient)
  const casSlot = `environments/${environment}/v1/tenants/${tenant}/partitions/cas-contention/commits/${sequenceName("0")}.json`
  const casPause = yield* casBucket.faults.pauseNextCreate(casSlot)
  let casEvaluations = 0
  const casIncrement = (state: State) => {
    casEvaluations++
    const count = Option.getOrElse(Schema.decodeUnknownOption(Schema.Finite)(state.count), () => 0) + 1
    return Effect.succeed({ patches: [{ op: "set" as const, path: ["count"], value: count }], receipt: { count } })
  }
  const beforeCas = snapshot(casRequests)
  const [casElapsed] = yield* Effect.gen(function* () {
    const pending = yield* casFirst
      .commit({ id: "cas-first", input: null }, casIncrement)
      .pipe(Effect.forkChild({ startImmediately: true }))
    yield* casPause.entered
    const winner = yield* casSecond.commit({ id: "cas-second", input: null }, casIncrement)
    if (winner.count !== 1) return yield* Effect.die(new Error("CAS contention winner receipt diverged"))
    yield* casPause.release
    const loser = yield* Fiber.join(pending)
    if (loser.count !== 2 || casEvaluations !== 3)
      return yield* Effect.die(new Error("CAS loser did not re-evaluate exactly once after conflict"))
    const recovered = yield* casOpen({ store: measured((yield* casBucket.connect).store, casRequests) })
    if ((yield* recovered.read).sequence !== "1")
      return yield* Effect.die(new Error("CAS contention did not retain both serialized commits"))
  }).pipe(Effect.timed)
  const casContentionMillis = [Duration.toMillis(casElapsed)]
  const casContentionRequests = difference(casRequests, beforeCas)

  const beforeArtifacts = snapshot(counts)
  const artifactMillis = yield* Effect.forEach(values(artifactWrites), (index) => {
    const data = new Uint8Array(artifactPayloadBytes)
    data.fill(index + 1)
    return duration(
      hot.blobs.put({ data, mediaType: "application/octet-stream", filename: `bounded-output-${index}.bin` }),
    )
  })
  const artifactRequests = difference(counts, beforeArtifacts)

  let retainedToolOutput: unknown
  const toolOutputBytes = artifactPayloadBytes
  const fullToolOutput = "x".repeat(toolOutputBytes)
  const [toolOutputElapsed, boundedToolOutput] = yield* ToolOutput.bound(
    { _tag: "Success", result: fullToolOutput, encodedResult: fullToolOutput },
    { toolCallId: "benchmark-large-output", maxBytes: toolOutputProjectionBytes },
  ).pipe(
    Effect.provide(
      ToolOutput.layerTest({
        put: (_, content) => {
          retainedToolOutput = content
          return Effect.succeed(Option.some("memory:benchmark-large-output"))
        },
      }),
    ),
    Effect.timed,
  )
  const retained = yield* Schema.decodeUnknownEffect(
    Schema.Struct({ result: Schema.String, encodedResult: Schema.String }),
  )(retainedToolOutput)
  const projected = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      inline: Schema.Struct({
        truncated: Schema.Literal(true),
        bytes: Schema.Finite,
        maxBytes: Schema.Finite,
        digest: Schema.String,
        preview: Schema.String,
      }),
      outputPaths: Schema.Array(Schema.String),
    }),
  )(boundedToolOutput.encodedResult)
  const encoder = new TextEncoder()
  const retainedSerialized = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.String))(retained.encodedResult)
  const retainedSerializedBytes = encoder.encode(retainedSerialized).byteLength
  const projectedPreviewBytes = encoder.encode(projected.inline.preview).byteLength
  if (
    retained.result !== fullToolOutput ||
    retained.encodedResult !== fullToolOutput ||
    retainedSerializedBytes <= toolOutputProjectionBytes ||
    projectedPreviewBytes > toolOutputProjectionBytes ||
    projected.inline.maxBytes !== toolOutputProjectionBytes ||
    projected.inline.bytes !== retainedSerializedBytes ||
    projected.outputPaths[0] !== "memory:benchmark-large-output"
  )
    return yield* Effect.die(new Error("Tool-output retention or bounded projection accounting diverged"))
  const toolOutputMillis = [Duration.toMillis(toolOutputElapsed)]

  const firstOwner = yield* open(simulator, counts, "owner-replacement", "benchmark-owner-a")
  const secondOwner = yield* open(yield* simulator.connect, counts, "owner-replacement", "benchmark-owner-b")
  const beforeOwners = snapshot(counts)
  const ownerReplacementMillis: Array<number> = []
  for (const index of values(ownerReplacements)) {
    const receipt = yield* firstOwner.store.admitSend(admission("owner-replacement", index))
    const firstClaim = yield* firstOwner.store.claimExecution({
      commandId: `claim:owner-a:${index}`,
      runId: receipt.runId,
      ownerId: "benchmark-owner-a",
    })
    yield* firstOwner.store.releaseExecution(firstClaim)
    const replacement = yield* duration(
      secondOwner.store.claimExecution({
        commandId: `claim:owner-b:${index}`,
        runId: receipt.runId,
        ownerId: "benchmark-owner-b",
      }),
    )
    ownerReplacementMillis.push(replacement)
  }
  const ownerReplacementRequests = difference(counts, beforeOwners)

  const beforeIdle = snapshot(counts)
  const idleScanMillis = yield* Effect.forEach(values(idleScans), () =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      return yield* duration(hot.store.dueAwaitEvents({ now, limit: 100 }))
    }),
  )
  const idleRequests = difference(counts, beforeIdle)
  yield* assertRequestAccounting("wakeRecovery", wakeRecoveryRequests)
  yield* assertRequestAccounting("schedulerTimeoutWake", timeoutWakeRequests)
  yield* assertRequestAccounting("idempotencyConflictRetry", conflictRetryRequests)
  yield* assertRequestAccounting("casContention", casContentionRequests)
  yield* assertRequestAccounting("idleReconciliation", idleRequests)
  yield* assertWorkloadAccounting({ idle: idleRequests, cas: casContentionRequests, timeout: timeoutWakeRequests })
  const memoryAfter = yield* hostMemory()
  const sourceCommit = yield* Config.string("GENERALIST_BENCHMARK_SOURCE_COMMIT").pipe(Config.withDefault("unprovided"))
  const sourceDirty = yield* Config.string("GENERALIST_BENCHMARK_SOURCE_DIRTY").pipe(Config.withDefault("unprovided"))
  const scriptSha256 = yield* Config.string("GENERALIST_BENCHMARK_SCRIPT_SHA256").pipe(Config.withDefault("unprovided"))

  const report = {
    schemaVersion: 2,
    scope: "local deterministic ObjectStore simulator with scripted Runtime/model/tool execution; no S3/R2 provider",
    runtime: `Bun ${Bun.version}; ${process.platform}/${process.arch}`,
    provenance: {
      sourceCommit,
      sourceDirty,
      scriptSha256,
    },
    conditions: {
      pageSize,
      seed: "deterministic scope/index payloads",
      concurrency: { hotPartition: 8, independentPartitions: partitions, perPartition: 4 },
      workloads: {
        hotPartition: hotAdmissions,
        independentPartitions: { partitions, admissionsPerPartition },
        longHistory: longHistoryAdmissions,
        boundedArtifactPayload: { writes: artifactWrites, bytesPerWrite: artifactPayloadBytes },
        ownerReplacements,
        idleScans,
        runtimeWakeRecovery: 8,
        schedulerTimeoutWake: 1,
        idempotencyConflictRetries: 1,
        casContention: { writers: 2, losingReducerRetries: 1 },
        boundedToolOutput: { bytes: toolOutputBytes, projectedBytes: toolOutputProjectionBytes },
      },
      metrics: {
        admission: "RunStore.admitSend durable receipt",
        rewardMutation: "RunStore.recordReward durable domain mutation",
        runtimeOutcome: "RunExecutor execution through the succeeded terminal outcome commit",
        stateRead: "RunStore.inspect durable run projection",
        coldRecovery: "fresh-layer RunStore.list after long-history admission",
        artifact: "BlobStore.put bounded content-addressed payload",
        ownerReplacement: "claim after prior owner releases the same run",
        idle: "dueAwaitEvents scan with no due work",
        wakeRecovery: "persisted await-event suspension, fresh host, matching wake, and executor completion",
        schedulerTimeoutWake:
          "persisted await-event deadline, fresh host, LocalScheduler tick/idle, and terminal completion",
        conflictRetry: "divergent idempotency conflict followed by exact-receipt retry",
        casContention:
          "paused first slot create, independent second-client winner, then one losing reducer re-evaluation",
        toolOutput:
          "ToolOutput passes the full encoded result to a retaining test callback before emitting a bounded projection; this is not BlobStore durability",
      },
    },
    latencyMillis: {
      admissionHotPartition: distribution(hotAdmissionMillis),
      admissionIndependentPartitions: distribution(independentAdmissionMillis),
      admissionLongHistory: distribution(longHistoryAdmissionMillis),
      rewardMutation: distribution(hotOutcomeMillis),
      runtimeOutcomeCommit: distribution(runtimeOutcomeMillis),
      stateRead: distribution(hotStateReadMillis),
      coldRecovery: distribution(coldRecoveryMillis),
      artifactWrite: distribution(artifactMillis),
      ownerReplacement: distribution(ownerReplacementMillis),
      idleReconciliation: distribution(idleScanMillis),
      wakeRecovery: distribution(wakeRecoveryMillis),
      schedulerTimeoutWake: distribution(timeoutWakeMillis),
      idempotencyConflictRetry: distribution(conflictRetryMillis),
      casContention: distribution(casContentionMillis),
      boundedToolOutput: distribution(toolOutputMillis),
    },
    requestAndByteDeltas: {
      hotPartition: hotRequests,
      independentPartitions: independentRequests,
      longHistoryAndColdRecovery: longHistoryRequests,
      artifacts: artifactRequests,
      ownerReplacement: ownerReplacementRequests,
      idleReconciliation: idleRequests,
      wakeRecovery: wakeRecoveryRequests,
      schedulerTimeoutWake: timeoutWakeRequests,
      idempotencyConflictRetry: conflictRetryRequests,
      casContention: casContentionRequests,
    },
    derived: {
      artifactPayloadBytes: artifactPayloadBytes * artifactWrites,
      artifactPayloadBytesPerSecond:
        (artifactPayloadBytes * artifactWrites * 1000) / artifactMillis.reduce((total, value) => total + value, 0),
      zeroIdleWrites: idleRequests.create === 0 && idleRequests.attemptedWriteBytes === 0,
      casContention: { reducerEvaluations: casEvaluations, losingReducerRetries: casEvaluations - 2 },
      replayWork: {
        reads: longHistoryRequests.read,
        lists: longHistoryRequests.list,
        readBytes: longHistoryRequests.readBytes,
      },
      toolOutput: {
        retention: "process-memory test callback; not durable BlobStore persistence",
        retainedSerializedBytes,
        projectedPreviewBytes,
        projectedMaxBytes: projected.inline.maxBytes,
        outputPaths: projected.outputPaths,
      },
      hostMemory: {
        before: memoryBefore,
        after: memoryAfter,
        delta: { rss: memoryAfter.rss - memoryBefore.rss, heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed },
      },
    },
    contractBounds: {
      zeroRedispatch:
        "The fresh-host wake workload asserts one pre-wake model/tool dispatch and one post-wake model completion without rerunning the waiting tool.",
      zeroIdleWrites: "Required for this no-due-work scan and asserted by the report value.",
      byteLimits: `Artifact payloads are exactly ${artifactPayloadBytes} bytes, at BlobStore's configured ${artifactPayloadBytes}-byte limit.`,
      latency: "No latency SLO is asserted. These local simulator values establish a baseline only.",
    },
    limitations: {
      memoryCeiling:
        "RSS and heap are sampled through the explicit local process host boundary; no memory ceiling is asserted.",
      providerLatency: "Local S3/R2 service evidence is separate; this script makes no provider claim.",
      statisticalConfidence: "One committed local baseline run has no warmup study or confidence interval.",
    },
  } satisfies Schema.Json
  yield* Console.log(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Json, { space: 2 }))(report))
}).pipe(Effect.scoped, Effect.provide(BunCrypto.layer))

BunRuntime.runMain(program)
