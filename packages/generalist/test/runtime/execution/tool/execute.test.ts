import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { makeCapability } from "../../../../src/core/durable/pin.js"
import { digest } from "../../../../src/core/durable/canonical-json.js"
import { make as makeToolManifest } from "../../../../src/core/durable/manifest/tool-manifest.js"
import { make as makeExecutable } from "../../../../src/runtime/executable/manifest.js"
import {
  type StaticToolExecutable,
  type ToolResolution,
  layerStatic,
} from "../../../../src/runtime/executable/resolver.js"
import { Runtime, RunStore, RunExecutor } from "../../../../src/runtime/index.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../object.js"
import type { Service as Executor } from "../../../../src/core/tools/tool-executor.js"
import { provideScoped } from "../scoped-provide.js"
import { ToolContext } from "../../../../src/core/tools/tool-context.js"

const pinned = makeToolManifest({
  name: "checks",
  tool: makeCapability("checks"),
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
const fixture = (executor: Executor, authorizer?: ToolResolution["authorizer"]) => {
  const storage = makeObjectStorage()
  const resolution: StaticToolExecutable = {
    _tag: "Tool",
    pinned,
    executable,
    tool: Tool.make("checks", {}),
    input: Schema.Unknown,
    output: Schema.Unknown,
    failure: Schema.Unknown,
    executor,
    authorizer: authorizer ?? (() => ({ authorize: () => Effect.succeed({ _tag: "Execute" }) })),
  }
  return () => objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(layerStatic([resolution])))
}
const start = (commandId: string) =>
  Runtime.Runtime.use((runtime) =>
    runtime.startExecution({
      executable,
      registrations,
      sessionId: commandId,
      idempotencyKey: commandId,
      prompt: "",
      metadata: { tool: { input: { command: "test" } } },
    }),
  )
const execute = (runId: string, commandId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore.RunStore
    const host = yield* RunExecutor.RunExecutor
    yield* host.execute(yield* store.claimExecution({ runId, commandId, ownerId: objectWorkerId }))
  })

it.effect("retains a ToolWait across fresh hosts without redispatching a never-replay tool", () => {
  let calls = 0
  const fresh = fixture({
    execute: () =>
      Effect.sync(() => {
        calls++
        return { _tag: "Suspend" as const, token: "checks-wait" }
      }),
  })
  return Effect.gen(function* () {
    const runId = yield* Effect.gen(function* () {
      const receipt = yield* start("waiting")
      yield* execute(receipt.runId, "first")
      const store = yield* RunStore.RunStore
      expect((yield* store.inspect(receipt.runId)).status).toBe("waiting")
      return receipt.runId
    }).pipe((effect) => provideScoped(fresh(), effect))
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      yield* runtime.respond({
        runId,
        waitId: "checks-wait",
        resolution: { _tag: "ToolResult", result: "finished", encodedResult: "finished" },
      })
      yield* execute(runId, "resumed")
      expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
      expect(calls).toBe(1)
    }).pipe((effect) => provideScoped(fresh(), effect))
  })
})

it.effect("recovers an interrupted unknown Tool only after an authoritative operator outcome", () => {
  let calls = 0
  const fresh = fixture({
    execute: () =>
      Effect.sync(() => {
        calls++
        return { _tag: "Success" as const, result: "live", encodedResult: "live" }
      }),
  })
  return Effect.gen(function* () {
    const identity = yield* Effect.gen(function* () {
      const receipt = yield* start("unknown")
      const store = yield* RunStore.RunStore
      const claim = yield* store.claimExecution({
        runId: receipt.runId,
        commandId: "crash-claim",
        ownerId: objectWorkerId,
      })
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey: `tool:${receipt.runId}:${pinned.pin}`,
        kind: "tool",
        inputDigest: digest({ command: "test" }),
        input: { request: { command: "test" } },
        replayPolicy: "never",
        attempt: 1,
        checkpoint: { _tag: "Tool", version: "1" },
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId, commandId: "crash-start" })
      return { runId: receipt.runId, operationId: operation.operationId }
    }).pipe((effect) => provideScoped(fresh(), effect))
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      yield* execute(identity.runId, "recover")
      expect((yield* runtime.inspect(identity.runId)).status).toBe("needs-resolution")
      expect(calls).toBe(0)
      yield* runtime.resolveOperation({
        ...identity,
        idempotencyKey: "observed",
        resolution: { _tag: "Succeeded", value: { _tag: "Success", result: "observed", encodedResult: "observed" } },
      })
      yield* execute(identity.runId, "resolved")
      expect((yield* runtime.inspect(identity.runId)).status).toBe("succeeded")
      expect(calls).toBe(0)
    }).pipe((effect) => provideScoped(fresh(), effect))
  })
})

it.effect("keeps a held-open Tool claim independent of another Run settling", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const fresh = fixture({
      execute: () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as({ _tag: "Success", result: "done", encodedResult: "done" }),
        ),
    })
    yield* Effect.gen(function* () {
      const parent = yield* start("parent")
      const tool = yield* start("background")
      const store = yield* RunStore.RunStore
      const parentClaim = yield* store.claimExecution({
        runId: parent.runId,
        commandId: "parent-claim",
        ownerId: objectWorkerId,
      })
      const fiber = yield* execute(tool.runId, "tool-claim").pipe(Effect.forkChild)
      yield* Deferred.await(started)
      yield* store.complete({
        ...parentClaim,
        commandId: "parent-done",
        result: { _tag: "Tool", isFailure: false, value: "parent" },
      })
      expect((yield* store.inspect(parent.runId)).status).toBe("succeeded")
      expect((yield* store.inspect(tool.runId)).status).toBe("running")
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(fiber)
      expect((yield* store.inspect(tool.runId)).status).toBe("succeeded")
    }).pipe((effect) => provideScoped(fresh(), effect))
  }),
)

it.effect("retains approval across fresh hosts and runs only after the exact approval", () => {
  let calls = 0
  const fresh = fixture(
    {
      execute: () =>
        Effect.sync(() => {
          calls++
          return { _tag: "Success" as const, result: "approved", encodedResult: "approved" }
        }),
    },
    (approvals) => ({
      authorize: (request) =>
        Effect.gen(function* () {
          const decision = yield* approvals.resolve({
            _tag: "Pending",
            token: "approve-checks",
            level: "ask",
            reason: "approval required",
            call: request.call,
            agentName: request.agentName,
            turn: request.turn,
          })
          if (decision._tag === "Approved") return { _tag: "Execute" as const }
          yield* request.onApprovalRequired({
            approvalId: "approve-checks",
            operation: request.call.id,
            capability: request.call.name,
            input: request.call.params,
          })
          return { _tag: "Suspend" as const, token: "approve-checks" }
        }),
    }),
  )
  return Effect.gen(function* () {
    const runId = yield* Effect.gen(function* () {
      const receipt = yield* start("approval")
      yield* execute(receipt.runId, "approval-first")
      expect(calls).toBe(0)
      return receipt.runId
    }).pipe((effect) => provideScoped(fresh(), effect))
    yield* Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      expect((yield* runtime.inspect(runId)).waits[0]).toMatchObject({ reason: { _tag: "Approval" } })
      yield* runtime.respondApproval({
        runId,
        approvalId: "approve-checks",
        commandId: "approve-checks:resolve",
        decision: { _tag: "Approved" },
      })
      yield* execute(runId, "approval-resume")
      expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
      expect(calls).toBe(1)
    }).pipe((effect) => provideScoped(fresh(), effect))
  })
})

it.effect("persists progress and delivers semantic cancellation to the exact Tool executor", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    let cancelled = 0
    const fresh = fixture({
      execute: () =>
        Effect.gen(function* () {
          const context = yield* ToolContext
          yield* context.emit({ toolCallId: "ignored-spoofed-id", message: "running checks" })
          yield* Deferred.succeed(started, undefined)
          return yield* Effect.never
        }),
      cancel: (request) =>
        Effect.sync(() => {
          cancelled++
          expect(request.toolName).toBe("checks")
          expect(request.execution.call.params).toEqual({ command: "test" })
          expect(request.operationKey).toContain(request.runId)
          return { _tag: "Cancelled" as const }
        }),
    })
    yield* Effect.gen(function* () {
      const receipt = yield* start("cancel-running")
      const runtime = yield* Runtime.Runtime
      const store = yield* RunStore.RunStore
      const host = yield* RunExecutor.RunExecutor
      const fiber = yield* execute(receipt.runId, "cancel-start").pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const events = yield* runtime.history({ runId: receipt.runId, limit: 100 })
      expect(events).toContainEqual(
        expect.objectContaining({
          _tag: "ToolProgress",
          message: "running checks",
          toolCallId: `tool:${receipt.runId}:${pinned.pin}`,
        }),
      )
      yield* runtime.cancel({ runId: receipt.runId, commandId: "cancel-request" })
      yield* host.interrupt(receipt.runId)
      yield* Fiber.await(fiber)
      if ((yield* store.inspect(receipt.runId)).status !== "cancelled")
        yield* execute(receipt.runId, "cancel-reconcile")
      expect(cancelled).toBe(1)
      expect((yield* store.inspect(receipt.runId)).status).toBe("cancelled")
    }).pipe((effect) => provideScoped(fresh(), effect))
  }),
)
