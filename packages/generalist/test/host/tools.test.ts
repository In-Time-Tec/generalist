import { expect, it } from "@effect/vitest"
import { expectTypeOf } from "vitest"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Host, ToolIdentity } from "../../src/host/index.js"
import { layerAutoApprove } from "../../src/core/policy/approvals.js"
import { layerAllowAll } from "../../src/core/policy/permissions.js"
import { layerStatic } from "../../src/runtime/executable/resolver.js"
import { RunExecutor } from "../../src/runtime/execution/run-executor.js"
import { RunStore } from "../../src/runtime/run/store.js"
import { makeObjectStorage, objectRuntimeLayer, objectWorkerId } from "../runtime/execution/object.js"
import { Runtime, type ToolRunHandle } from "../../src/runtime/service.js"
import { make } from "../../src/core/agent/service.js"
import { ToolExecutor } from "../../src/core/tools/tool-executor.js"
import { digest } from "../../src/core/durable/canonical-json.js"

const scopedWith =
  <R, E>(layer: Layer.Layer<R, E>) =>
  <A, E2>(effect: Effect.Effect<A, E2, R>) =>
    Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

it("Tool handles exclude conversational Agent controls", () => {
  expectTypeOf<ToolRunHandle<number, { reason: string }>>().not.toHaveProperty("send")
  expectTypeOf<ToolRunHandle<number, { reason: string }>>().not.toHaveProperty("rewind")
  expectTypeOf<ToolRunHandle<number, { reason: string }>>().not.toHaveProperty("fork")
  expectTypeOf<ToolRunHandle<number, never>["await"]>().toEqualTypeOf<
    Effect.Effect<number, Effect.Error<ToolRunHandle<number, never>["await"]>>
  >()
})

const checks = Tool.make("checks", {
  parameters: Schema.Struct({ count: Schema.FiniteFromString }),
  success: Schema.FiniteFromString,
}).annotate(ToolIdentity, { implementation: "checks-v1", policy: "checks-policy-v1" })
const fail = Tool.make("fail", {
  parameters: Schema.Struct({}),
  success: Schema.String,
  failure: Schema.Struct({ reason: Schema.String }),
}).annotate(ToolIdentity, { implementation: "fail-v1", policy: "fail-policy-v1" })
const toolkit = Toolkit.make(checks, fail)
const services = Layer.mergeAll(layerAllowAll, layerAutoApprove)
const complete = (runId: string, commandId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const executor = yield* RunExecutor
    yield* executor.execute(yield* store.claimExecution({ runId, ownerId: objectWorkerId, commandId }))
  })

it.effect("returns an admitted Tool handle without a model or conversational Session and decodes its result", () => {
  let calls = 0
  const handlers = toolkit.toLayer({
    checks: ({ count }) =>
      Effect.sync(() => {
        calls += 1
        return count + 1
      }),
    fail: () => Effect.fail({ reason: "expected" }),
  })
  return Effect.gen(function* () {
    const host = yield* Host.make({ revision: "local", agents: {}, tools: [checks, fail] })
    const run = yield* host.tools.start(checks, { count: 4 }, { commandId: "checks-1" })
    expectTypeOf<typeof host.tools.start<typeof checks>>().parameter(1).toEqualTypeOf<{ readonly count: number }>()
    expectTypeOf<typeof run.await>().toEqualTypeOf<Effect.Effect<number, Effect.Error<typeof run.await>>>()
    expectTypeOf<typeof run>().not.toHaveProperty("send")
    expect(calls).toBe(0)
    expect(yield* host.sessions.list()).toEqual([])
    expect("send" in run).toBe(false)
    expect(yield* run.inspect).toMatchObject({ status: "running" })
    const store = yield* RunStore
    expect((yield* store.loadExecution(run.id)).message.metadata).toMatchObject({ tool: { input: { count: "4" } } })
    yield* complete(run.id, "execute")
    expect(yield* run.inspect).toMatchObject({ status: "succeeded" })
    expect(yield* run.await).toBe(5)
    expect(calls).toBe(1)
    const duplicate = yield* host.tools.start(checks, { count: 4 }, { commandId: "checks-1" })
    expect(duplicate.id).toBe(run.id)
    expect(yield* duplicate.await).toBe(5)
    expect(calls).toBe(1)
    const events = yield* run.events.pipe(Stream.runCollect)
    expect(events.at(-1)).toMatchObject({ _tag: "RunCompleted", result: { _tag: "Tool", value: 5 } })
    const failed = yield* host.tools.start(fail, {}, { commandId: "failure-1" })
    yield* complete(failed.id, "execute-failed")
    expect(yield* failed.await.pipe(Effect.flip)).toEqual({ _tag: "ToolRunFailure", failure: { reason: "expected" } })
  }).pipe(
    scopedWith(
      Layer.mergeAll(objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(layerStatic([]))), services, handlers),
    ),
  )
})

it.effect("restores retained Tool input on a fresh host and preserves exact command identity", () => {
  const storage = makeObjectStorage()
  const handlers = toolkit.toLayer({
    checks: ({ count }) => Effect.succeed(count * 2),
    fail: () => Effect.succeed("unused"),
  })
  const fresh = () =>
    Layer.mergeAll(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(layerStatic([]))),
      services,
      handlers,
    )
  return Effect.gen(function* () {
    const id = yield* Effect.scoped(
      Effect.gen(function* () {
        const host = yield* Host.make({ revision: "local", agents: {}, tools: [checks] })
        return (yield* host.tools.start(checks, { count: 8 }, { commandId: "retained" })).id
      }).pipe(scopedWith(fresh())),
    )
    yield* Effect.scoped(
      Effect.gen(function* () {
        const host = yield* Host.make({ revision: "local", agents: {}, tools: [checks] })
        const run = yield* host.tools.start(checks, { count: 8 }, { commandId: "retained" })
        expect(run.id).toBe(id)
        yield* complete(run.id, "fresh-host")
        expect(yield* run.inspect).toMatchObject({ status: "succeeded" })
        expect(yield* run.await).toBe(16)
        const conflict = yield* host.tools.start(checks, { count: 9 }, { commandId: "retained" }).pipe(Effect.flip)
        expect(conflict).toMatchObject({
          _tag: "generalist/durability/DurabilityFailure",
          reason: "input-conflict",
          message: "The command identity already committed with different input",
        })
      }).pipe(scopedWith(fresh())),
    )
  })
})

it.effect("rejects unregistered tools and supports cancellation without Agent controls", () => {
  const handlers = toolkit.toLayer({
    checks: ({ count }) => Effect.succeed(count),
    fail: () => Effect.succeed("unused"),
  })
  return Effect.gen(function* () {
    const host = yield* Host.make({ revision: "local", agents: {}, tools: [checks] })
    expect((yield* host.tools.start(fail, {}).pipe(Effect.flip))._tag).toBe(
      "generalist/runtime/ExecutableRegistrationInvalid",
    )
    const run = yield* host.tools.start(checks, { count: 1 })
    yield* run.cancel("cancel-1", "stop")
    expect(yield* run.await.pipe(Effect.flip)).toMatchObject({ _tag: "RunCancelled" })
  }).pipe(
    scopedWith(
      Layer.mergeAll(objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(layerStatic([]))), services, handlers),
    ),
  )
})

it.effect("keeps held-open Tool work after its Agent parent settles and resumes it on a fresh host", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    let modelCalls = 0
    let toolCalls = 0
    const agent = make({ name: "tool-parent" })
    const handlers = Toolkit.make(checks).toLayer({ checks: ({ count }) => Effect.succeed(count) })
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: () => {
          modelCalls += 1
          return Stream.make(
            Response.makePart("text-delta", { id: "answer", delta: "parent settled" }),
            Response.makePart("finish", {
              reason: "stop",
              response: undefined,
              usage: Response.Usage.make({
                inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 1, text: 1, reasoning: undefined },
              }),
            }),
          )
        },
      }),
    )
    const executor = Layer.succeed(
      ToolExecutor,
      ToolExecutor.of({
        execute: () =>
          Effect.gen(function* () {
            toolCalls += 1
            yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(release)
            return { _tag: "Suspend", token: "retained-checks" }
          }),
      }),
    )
    const fresh = () =>
      Layer.mergeAll(
        objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(layerStatic([]))),
        services,
        handlers,
        model,
        executor,
      )
    const identity = yield* Effect.gen(function* () {
      const host = yield* Host.make({ revision: "local", agents: { agent }, tools: [checks] })
      const session = yield* host.sessions.create({ id: "parent-session" })
      const parent = yield* host.runs.start(session.id, agent, "finish")
      const child = yield* host.tools.start(checks, { count: 6 }, { commandId: "independent", parentRunId: parent.id })
      const fiber = yield* complete(child.id, "held-open").pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      yield* complete(parent.id, "parent")
      expect(yield* parent.await).toBe("parent settled")
      expect(yield* child.inspect).toMatchObject({ status: "running" })
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(fiber)
      expect(yield* child.inspect).toMatchObject({ status: "waiting" })
      return { parentRunId: parent.id, childRunId: child.id }
    }).pipe(scopedWith(fresh()))
    yield* Effect.gen(function* () {
      const host = yield* Host.make({ revision: "local", agents: { agent }, tools: [checks] })
      const child = yield* host.tools.start(
        checks,
        { count: 6 },
        { commandId: "independent", parentRunId: identity.parentRunId },
      )
      expect(child.id).toBe(identity.childRunId)
      const store = yield* RunStore
      expect((yield* store.loadExecution(child.id)).message.metadata).toMatchObject({
        tool: { parentRunId: identity.parentRunId },
      })
      const childRecord = yield* store.loadExecution(child.id)
      const parentRecord = yield* store.loadExecution(identity.parentRunId)
      expect(childRecord.parentRunId).toBe(identity.parentRunId)
      expect(childRecord.rootRunId).toBe(parentRecord.rootRunId)
      expect(childRecord.depth).toBe(parentRecord.depth)
      const runtime = yield* Runtime
      yield* runtime.respond({
        runId: child.id,
        waitId: "retained-checks",
        resolution: { _tag: "ToolResult", result: 12, encodedResult: "12" },
      })
      yield* complete(child.id, "fresh-child")
      expect(yield* child.await).toBe(12)
      expect(modelCalls).toBe(1)
      expect(toolCalls).toBe(1)
    }).pipe(scopedWith(fresh()))
  }),
)

it.effect("retains sponsored Tool capacity across fresh hosts without consuming Agent or Session capacity", () => {
  const storage = makeObjectStorage()
  const handlers = Toolkit.make(checks).toLayer({ checks: ({ count }) => Effect.succeed(count) })
  const fresh = () =>
    Layer.mergeAll(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(layerStatic([]))),
      services,
      handlers,
    )
  const limits = { tree: { maxDepth: 0, maxSessions: 1 }, concurrency: { agents: 0, tools: 1 } }
  return Effect.gen(function* () {
    const parentId = yield* Effect.gen(function* () {
      const host = yield* Host.make({ revision: "local", agents: {}, tools: [checks], limits })
      const parent = yield* host.tools.start(checks, { count: 1 }, { commandId: "sponsor" })
      yield* complete(parent.id, "sponsor-execute")
      return parent.id
    }).pipe(scopedWith(fresh()))
    yield* Effect.gen(function* () {
      const host = yield* Host.make({ revision: "local", agents: {}, tools: [checks], limits })
      const first = yield* host.tools.start(checks, { count: 2 }, { commandId: "first", parentRunId: parentId })
      const second = yield* host.tools.start(checks, { count: 3 }, { commandId: "second", parentRunId: parentId })
      const store = yield* RunStore
      const claim = yield* store.claimExecution({ runId: first.id, ownerId: objectWorkerId, commandId: "hold-first" })
      expect(yield* store.loadExecution(first.id)).toMatchObject({
        rootRunId: parentId,
        parentRunId: parentId,
        depth: 0,
      })
      expect(
        yield* store
          .claimExecution({ runId: second.id, ownerId: objectWorkerId, commandId: "blocked-second" })
          .pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/RuntimeUnavailable",
      })
      yield* RunExecutor.use((executor) => executor.execute(claim))
      yield* complete(second.id, "released-second")
      expect(yield* first.await).toBe(2)
      expect(yield* second.await).toBe(3)
      expect(yield* host.sessions.list()).toEqual([])
      const replay = yield* host.tools.start(checks, { count: 2 }, { commandId: "first", parentRunId: parentId })
      expect(replay.id).toBe(first.id)
    }).pipe(scopedWith(fresh()))
  })
})

it.effect("enforces zero Tool capacity while preserving admitted handles", () => {
  const handlers = Toolkit.make(checks).toLayer({ checks: ({ count }) => Effect.succeed(count) })
  return Effect.gen(function* () {
    const host = yield* Host.make({
      revision: "local",
      agents: {},
      tools: [checks],
      limits: {
        tree: { maxDepth: 0, maxSessions: 1 },
        concurrency: { agents: 0, tools: 0 },
      },
    })
    const run = yield* host.tools.start(checks, { count: 1 }, { commandId: "disabled" })
    const store = yield* RunStore
    expect(
      yield* store
        .claimExecution({ runId: run.id, ownerId: objectWorkerId, commandId: "disabled-claim" })
        .pipe(Effect.flip),
    ).toMatchObject({
      _tag: "generalist/runtime/RuntimeUnavailable",
    })
    yield* run.cancel("disabled-cancel")
    expect(yield* run.await.pipe(Effect.flip)).toMatchObject({ _tag: "RunCancelled" })
  }).pipe(
    scopedWith(
      Layer.mergeAll(objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(layerStatic([]))), services, handlers),
    ),
  )
})

it.effect("keeps unknown sponsored effects in family capacity across a fresh host", () => {
  const storage = makeObjectStorage()
  let calls = 0
  const handlers = Toolkit.make(checks).toLayer({
    checks: ({ count }) =>
      Effect.sync(() => {
        calls++
        return count
      }),
  })
  const fresh = () =>
    Layer.mergeAll(
      objectRuntimeLayer({ addresses: [] }, storage).pipe(Layer.provide(layerStatic([]))),
      services,
      handlers,
    )
  const limits = { tree: { maxDepth: 0, maxSessions: 1 }, concurrency: { agents: 0, tools: 1 } }
  return Effect.gen(function* () {
    const retained = yield* Effect.gen(function* () {
      const host = yield* Host.make({ revision: "local", agents: {}, tools: [checks], limits })
      const parent = yield* host.tools.start(checks, { count: 1 }, { commandId: "unknown-sponsor" })
      yield* complete(parent.id, "unknown-parent")
      const run = yield* host.tools.start(checks, { count: 2 }, { commandId: "unknown-child", parentRunId: parent.id })
      const store = yield* RunStore
      const claim = yield* store.claimExecution({ runId: run.id, ownerId: objectWorkerId, commandId: "unknown-claim" })
      const record = yield* store.loadExecution(run.id)
      const operation = yield* store.recordOperation({
        ...claim,
        operationKey: `tool:${run.id}:${record.executableRef.active}`,
        kind: "tool",
        inputDigest: digest({ count: "2" }),
        input: { request: { count: "2" } },
        replayPolicy: "never",
        attempt: record.attempt,
        checkpoint: { _tag: "Tool", version: "1" },
      })
      yield* store.startOperation({ ...claim, operationId: operation.operationId, commandId: "unknown-start" })
      yield* store.expireRunningOperation({ ...claim, operationId: operation.operationId, commandId: "unknown-expire" })
      yield* store.releaseExecution(claim)
      return { parentRunId: parent.id, runId: run.id, operationId: operation.operationId }
    }).pipe(scopedWith(fresh()))
    yield* Effect.gen(function* () {
      const host = yield* Host.make({ revision: "local", agents: {}, tools: [checks], limits })
      const run = yield* host.tools.start(
        checks,
        { count: 3 },
        { commandId: "after-unknown", parentRunId: retained.parentRunId },
      )
      const store = yield* RunStore
      expect(
        yield* store
          .claimExecution({ runId: run.id, ownerId: objectWorkerId, commandId: "unknown-blocks" })
          .pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/RuntimeUnavailable",
      })
      yield* Runtime.use((runtime) =>
        runtime.resolveOperation({
          runId: retained.runId,
          operationId: retained.operationId,
          idempotencyKey: "operator-observed",
          resolution: { _tag: "Succeeded", value: { _tag: "Success", result: "2", encodedResult: "2" } },
        }),
      )
      yield* complete(retained.runId, "replay-observed")
      yield* complete(run.id, "unknown-released")
      expect(yield* run.await).toBe(3)
      expect(calls).toBe(2)
    }).pipe(scopedWith(fresh()))
  })
})
