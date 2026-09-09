import { BunCrypto } from "@effect/platform-bun"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Result, Schema } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import { makeCapability } from "../../../../src/core/durable/pin.js"
import { make as makeToolManifest } from "../../../../src/core/durable/manifest/tool-manifest.js"
import { activate, layerRunStore } from "../../../../src/durability/index.js"
import { ObjectStore } from "../../../../src/durability/object-store.js"
import { Address } from "../../../../src/runtime/address.js"
import { make as makeExecutable, makeTest } from "../../../../src/runtime/executable/manifest.js"
import { layerStatic, type StaticToolExecutable } from "../../../../src/runtime/executable/resolver.js"
import { Runtime, RunExecutor, RunStore } from "../../../../src/runtime/index.js"
import { make as makeSimulator } from "../../../../src/testing/durability/index.js"
import { completedResult } from "../../../runtime/execution/fixtures.js"
import { provideScoped } from "../../../runtime/execution/scoped-provide.js"
import {
  make as makeCapacity,
  toolObligationBytes,
} from "../../../../src/durability/internal/runtime-state/capacity.js"
import { emptyState } from "../../../../src/runtime/state/projection.js"
import { ToolContext } from "../../../../src/core/tools/tool-context.js"
import { limits } from "../../../../src/runtime/execution/tool/limits.js"
import { objectRuntimeLayer } from "../../../runtime/execution/object.js"

const executable = makeTest("capacity", "1")
const address = Address.make("agent:capacity")
const admission = (key: string) => ({
  message: {
    id: `message:${key}`,
    to: address,
    sessionId: `session:${key}`,
    prompt: Prompt.make("x".repeat(2048)),
    idempotencyKey: key,
    correlationId: key,
    metadata: {},
  },
  executableRef: executable.ref,
  executableManifest: executable.manifest,
  registrations: [],
})

const toolPinned = makeToolManifest({
  name: "bounded-capacity-tool",
  tool: makeCapability("bounded-capacity-tool"),
  input: makeCapability("input"),
  output: makeCapability("output"),
  failure: makeCapability("failure"),
  replay: "never",
})
const toolExecutable = makeExecutable({ root: toolPinned.pin, entries: [{ _tag: "Tool", ...toolPinned }] })
const toolRegistrations = [
  toolPinned.manifest.tool,
  toolPinned.manifest.input,
  toolPinned.manifest.output,
  toolPinned.manifest.failure,
].map((pin) => ({ pin, codec: "test", version: "1", payload: {} }))
const tool = Tool.make("bounded-capacity-tool", {})
const toolInput = { value: "bounded" }
const toolAdmission = (key: string) => ({
  executable: toolExecutable,
  registrations: toolRegistrations,
  sessionId: `capacity-tool:${key}`,
  idempotencyKey: key,
  prompt: "",
  metadata: { tool: { input: toolInput } },
})

const boundedResolution: StaticToolExecutable = {
  _tag: "Tool",
  pinned: toolPinned,
  executable: toolExecutable,
  tool,
  input: Schema.Unknown,
  output: Schema.Unknown,
  failure: Schema.Unknown,
  executor: {
    execute: () =>
      Effect.gen(function* () {
        const context = yield* ToolContext
        for (let index = 0; index < limits.progressEvents; index++) {
          const accepted = yield* context.emit({
            toolCallId: "bounded-capacity-tool",
            message: "p".repeat(limits.progressBytes - 1024),
          })
          if (!accepted) return yield* Effect.die("bounded progress was refused")
        }
        const result = "o".repeat(120 * 1024)
        return { _tag: "Success" as const, result, encodedResult: result }
      }),
  },
  authorizer: () => ({ authorize: () => Effect.succeed({ _tag: "Execute" }) }),
}

const toolOptions = {
  environment: "capacity-tools",
  tenant: "local",
  partition: "bounded",
  addresses: [],
  workerId: "capacity-tool-worker",
  schedulerMode: "external" as const,
  maxStateBytes: 128 * 1024 * 1024,
  admissionReserveBytes: 16 * 1024 * 1024,
}

it.effect("reserves canonical settlement and cancellation bytes when admission is exhausted across fresh Layers", () =>
  Effect.gen(function* () {
    const bucket = yield* makeSimulator()
    const fresh = () =>
      layerRunStore({
        environment: "capacity",
        tenant: "local",
        partition: "bounded",
        addresses: [{ address, executable, registrations: [] }],
        workerId: "capacity-worker",
        schedulerMode: "external",
        maxStateBytes: 128 * 1024,
        admissionReserveBytes: 64 * 1024,
      }).pipe(Layer.provide(Layer.merge(Layer.succeed(ObjectStore, bucket.store), BunCrypto.layer)))
    const retained = yield* provideScoped(
      fresh(),
      Effect.gen(function* () {
        yield* activate
        const store = yield* RunStore.RunStore
        const first = yield* store.admitSend(admission("incurred"))
        const cancelled = yield* store.admitSend(admission("cancelled"))
        const claim = yield* store.claimExecution({
          runId: first.runId,
          commandId: "claim",
          ownerId: "capacity-worker",
        })
        const operation = yield* store.recordOperation({
          ...claim,
          operationKey: "incurred",
          kind: "tool",
          inputDigest: "input",
          input: { amount: 5 },
          replayPolicy: "never",
          attempt: 1,
        })
        yield* store.startOperation({ ...claim, operationId: operation.operationId, commandId: "dispatch" })
        let refused = false
        for (let index = 0; index < 32; index++) {
          const result = yield* store.admitSend(admission(`fill-${index}`)).pipe(Effect.result)
          if (Result.isFailure(result)) {
            expect(result.failure).toMatchObject({ reason: "limit" })
            refused = true
            break
          }
        }
        expect(refused).toBe(true)
        expect(yield* store.admitSend(admission("incurred"))).toEqual(first)
        const settled = yield* store.completeOperation({
          ...claim,
          operationId: operation.operationId,
          outcome: { _tag: "Succeeded", value: { amount: 5, receipt: "r".repeat(8192) } },
        })
        expect(
          yield* store
            .recordOperation({
              ...claim,
              operationKey: "must-not-dispatch",
              kind: "tool",
              inputDigest: "new-input",
              input: {},
              replayPolicy: "never",
              attempt: 1,
            })
            .pipe(Effect.flip),
        ).toMatchObject({ reason: "limit" })
        expect(
          yield* store.getOperationByKey({ runId: first.runId, operationKey: "must-not-dispatch" }),
        ).toBeUndefined()
        yield* store.complete({ ...claim, commandId: "complete", result: completedResult("done") })
        const cancellation = yield* store.cancel({ runId: cancelled.runId, commandId: "cancel", reason: "capacity" })
        return { first, cancelled, settled, cancellation }
      }),
    )
    yield* provideScoped(
      fresh(),
      Effect.gen(function* () {
        const store = yield* RunStore.RunStore
        expect((yield* store.inspect(retained.first.runId)).status).toBe("succeeded")
        expect((yield* store.inspect(retained.cancelled.runId)).status).toBe("cancelled")
        expect(
          yield* store.getOperation({ runId: retained.first.runId, operationId: retained.settled.operationId }),
        ).toEqual(retained.settled)
        expect(yield* store.admitSend(admission("incurred"))).toEqual(retained.first)
        expect(
          yield* store.cancel({ runId: retained.cancelled.runId, commandId: "cancel", reason: "capacity" }),
        ).toEqual(retained.cancellation)
        expect(yield* store.admitSend(admission("after-recovery")).pipe(Effect.flip)).toMatchObject({ reason: "limit" })
      }),
    )
  }),
)

it.effect("rejects invalid reserved-byte configuration instead of disabling admission protection", () =>
  Effect.gen(function* () {
    for (const admissionReserveBytes of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 1024]) {
      expect(yield* makeCapacity({ maxStateBytes: 1024, admissionReserveBytes }).pipe(Effect.flip)).toMatchObject({
        reason: "configuration",
      })
    }
    const reserve = yield* makeCapacity({})
    const state = emptyState({ addressBindings: new Map(), subscriberQueueCapacity: 8 })
    expect(reserve("admitStart", state)).toBe(4 * 1024 * 1024)
    expect(reserve("startOperation", state)).toBe(4 * 1024 * 1024)
    expect(reserve("completeOperation", state)).toBe(0)
    expect(reserve("cancel", state)).toBe(0)
    expect(toolObligationBytes(1024)).toBe(2_627_584)
  }),
)

it.effect("reserves every admitted Tool obligation before fresh-host bounded settlement and cancellation", () =>
  Effect.gen(function* () {
    const bucket = yield* makeSimulator()
    const fresh = () => objectRuntimeLayer(toolOptions, bucket).pipe(Layer.provide(layerStatic([boundedResolution])))
    const admitted = yield* provideScoped(
      fresh(),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const receipts: Array<{ readonly runId: string }> = []
        let refused = false
        for (let index = 0; index < 64; index++) {
          const result = yield* runtime.startExecution(toolAdmission(`bounded-${index}`)).pipe(Effect.result)
          if (Result.isFailure(result)) {
            expect(result.failure).toMatchObject({ reason: "limit" })
            refused = true
            break
          }
          receipts.push(result.success)
        }
        expect(refused).toBe(true)
        expect(receipts.length).toBeGreaterThanOrEqual(2)
        return receipts
      }),
    )
    const settled = admitted.slice(0, Math.ceil(admitted.length / 2))
    const cancelled = admitted.slice(Math.ceil(admitted.length / 2))
    yield* provideScoped(
      fresh(),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const executor = yield* RunExecutor.RunExecutor
        for (const [index, receipt] of settled.entries()) {
          yield* executor.execute(
            yield* store.claimExecution({
              runId: receipt.runId,
              commandId: `bounded-claim-${index}`,
              ownerId: "capacity-tool-worker",
            }),
          )
        }
        for (const [index, receipt] of cancelled.entries()) {
          yield* runtime.cancel({
            runId: receipt.runId,
            commandId: `bounded-cancel-${index}`,
            reason: "capacity regression",
          })
        }
      }),
    )
    yield* provideScoped(
      fresh(),
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        for (const receipt of settled) {
          const operation = yield* store.getOperationByKey({
            runId: receipt.runId,
            operationKey: `tool:${receipt.runId}:${toolPinned.pin}`,
          })
          expect((yield* runtime.inspect(receipt.runId)).status).toBe("succeeded")
          expect(operation?.status).toBe("succeeded")
        }
        for (const receipt of cancelled) expect((yield* runtime.inspect(receipt.runId)).status).toBe("cancelled")
        const after = yield* runtime.startExecution(toolAdmission("bounded-after-recovery"))
        expect(after.runId).toEqual(expect.any(String))
      }),
    )
  }),
)
