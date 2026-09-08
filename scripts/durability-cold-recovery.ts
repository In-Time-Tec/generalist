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
import { Agent, Approvals, Permissions } from "../packages/generalist/src/index.js"
import { Generalist } from "../packages/generalist/src/host/index.js"
import * as TestModel from "../packages/generalist/src/testing/model/service.js"

const workload = {
  tools: 1000,
  retainedChildren: 8,
  outputBytes: 256,
  coldSamples: 3,
  concurrency: 1,
  toolLatencyMillis: 1,
  maxStateBytes: 64 * 1024 * 1024,
  admissionReserveBytes: 16 * 1024 * 1024,
} as const
const agent = Agent.make({ name: "coding-reviewer", children: ["coding-reviewer"] })
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
      execute: (request) =>
        Effect.sleep(workload.toolLatencyMillis).pipe(
          Effect.andThen(
            Effect.sync(() => {
              executions++
              if (request.call.params === "pending") return { _tag: "Suspend" as const, token: "pending-tool" }
              const result = "x".repeat(workload.outputBytes)
              return { _tag: "Success" as const, result, encodedResult: result }
            }),
          ),
        ),
    },
    authorizer: () => ({ authorize: () => Effect.succeed({ _tag: "Execute" }) }),
  }
  const fresh = () =>
    Layer.mergeAll(
      layer({
        environment: "cold-recovery",
        tenant: "local",
        partition: "fixed-workload",
        addresses: [],
        workerId: "cold-worker",
        schedulerMode: "external",
        maxStateBytes: workload.maxStateBytes,
        admissionReserveBytes: workload.admissionReserveBytes,
      }).pipe(
        Layer.provide(
          Layer.mergeAll(Layer.succeed(ObjectStore, measured(storage.store)), cryptoLayer, layerStatic([resolution])),
        ),
      ),
      TestModel.layer(
        Array.from({ length: workload.retainedChildren }, () => TestModel.text("Scripted retained review")),
      ),
      Permissions.layerAllowAll,
      Approvals.layerAutoApprove,
    )
  const within = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(Effect.flatMap(Layer.build(fresh()), (context) => effect.pipe(Effect.provideContext(context))))
  const ids: Array<string> = []
  const childIds: Array<string> = []
  let parentId = ""
  let pendingId = ""
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
      const host = yield* Generalist.create({ agents: [agent] })
      const session = yield* host.sessions.create({ id: "coding-session" })
      const parent = yield* host.runs.start(session.id, agent, "Coordinate a fixed scripted coding workload")
      parentId = parent.id
      for (let index = 0; index < workload.retainedChildren; index++) {
        const child = yield* parent.spawn(agent.name, `Review chunk ${index}`, { commandId: `child-${index}` })
        childIds.push(child.session.id)
        yield* executor.execute(
          yield* store.claimExecution({
            runId: child.run.id,
            commandId: `child-claim-${index}`,
            ownerId: "cold-worker",
          }),
        )
        if ((yield* runtime.inspect(child.run.id)).status !== "succeeded")
          return yield* Effect.die(`Child ${index} failed`)
      }
      for (let index = 0; index < workload.tools; index++) {
        const receipt = yield* runtime.startExecution({
          executable,
          registrations,
          sessionId: `tool-routing-${index}`,
          idempotencyKey: `tool-${index}`,
          prompt: "",
          metadata: { tool: { input: { index }, parentRunId: parentId } },
        })
        ids.push(receipt.runId)
        yield* executor.execute(
          yield* store.claimExecution({ runId: receipt.runId, commandId: `claim-${index}`, ownerId: "cold-worker" }),
        )
        const state = yield* runtime.inspect(receipt.runId)
        if (state.status !== "succeeded") {
          yield* Console.log({ phase: "tool-failed", index, snapshot: yield* runtime.snapshot(receipt.runId) })
          return yield* Effect.die(`Tool ${index} did not succeed: ${state.status}`)
        }
        if ((index + 1) % 100 === 0)
          yield* Console.log({
            phase: "build",
            completed: index + 1,
            executions,
            counts: { ...counts },
            memory: process.memoryUsage(),
          })
      }
      const pending = yield* runtime.startExecution({
        executable,
        registrations,
        sessionId: "pending-routing",
        idempotencyKey: "pending",
        prompt: "",
        metadata: { tool: { input: "pending", parentRunId: parentId } },
      })
      pendingId = pending.runId
      yield* executor.execute(
        yield* store.claimExecution({ runId: pending.runId, commandId: "pending-claim", ownerId: "cold-worker" }),
      )
      if ((yield* runtime.inspect(pending.runId)).status !== "waiting")
        return yield* Effect.die("Pending Tool did not suspend")
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
          const store = yield* RunStore.RunStore
          for (const id of ids) {
            if ((yield* runtime.inspect(id)).status !== "succeeded")
              return yield* Effect.die(`Lost Tool outcome: ${id}`)
            const operation = yield* store.getOperationByKey({ runId: id, operationKey: `tool:${id}:${pinned.pin}` })
            if (operation?.status !== "succeeded") return yield* Effect.die(`Lost incurred Tool operation: ${id}`)
          }
          const family = yield* runtime.sessionFamily("coding-session", { limit: 64 })
          const members = family.sessions.map((member) => member.id)
          let familyBefore = family.nextBefore
          while (familyBefore !== null) {
            const page = yield* runtime.sessionFamily("coding-session", {
              at: family.at,
              before: familyBefore,
              limit: 64,
            })
            members.push(...page.sessions.map((member) => member.id))
            familyBefore = page.nextBefore
          }
          if (members.length !== workload.retainedChildren + 1 || new Set(members).size !== members.length)
            return yield* Effect.die("Retained family membership changed")
          for (const id of childIds) {
            const snapshot = yield* runtime.sessionSnapshot(id)
            if (snapshot.conversation.entries.length === 0)
              return yield* Effect.die(`Lost retained child conversation: ${id}`)
          }
          const pending = yield* runtime.inspect(pendingId)
          if (pending.status !== "waiting" || pending.waits.length !== 1)
            return yield* Effect.die("Lost pending Tool obligation")
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
  yield* within(
    Effect.gen(function* () {
      yield* activate
      const runtime = yield* Runtime.Runtime
      yield* runtime.cancel({ runId: pendingId, commandId: "cancel-pending", reason: "fixed-workload cancellation" })
      yield* runtime.cancel({ runId: parentId, commandId: "cancel-parent", reason: "fixed-workload retirement" })
    }),
  )
  if (executions !== workload.tools + 1)
    return yield* Effect.die(`Expected ${workload.tools + 1} executions; observed ${executions}`)
  yield* Console.log({ phase: "passed", workload, executions })
})

BunRuntime.runMain(program)
