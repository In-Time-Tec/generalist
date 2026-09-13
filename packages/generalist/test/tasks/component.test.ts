import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { Agent, Approvals, Hooks, Permissions, Tasks } from "../../src/index.js"
import { ExecutableResolver } from "../../src/runtime/index.js"
import * as Runtime from "../../src/runtime/engine.js"
import { RunStore } from "../../src/runtime/run/store.js"
import { RunExecutor } from "../../src/runtime/execution/run-executor.js"
import { makeObjectStorage, objectRuntimeLayer } from "../runtime/execution/object.js"
import { LoopDriverState } from "../../src/core/durable/loop-driver-state.js"
import { DriverJournal, journalNoop } from "../../src/core/durable/driver/interpreter.js"
import { DriverError } from "../../src/core/durable/service.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })
const items: Tasks.TaskItems = [{ id: "accepted", title: "Survive tool interruption", status: "doing" }]
const scopedWith =
  <R, E>(layer: Layer.Layer<R, E>) =>
  <A, E2>(effect: Effect.Effect<A, E2, R>) =>
    Effect.scoped(Layer.build(layer).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

it.effect("preserves a rejected Tasks journal write as a typed tool failure without publishing completion", () => {
  let modelCalls = 0
  let componentWrites = 0
  let toolCompletions = 0
  let resultHooks = 0
  const events: Array<string> = []
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.die("unused"),
      streamText: () => {
        modelCalls += 1
        return Stream.make(
          Response.makePart("tool-call", {
            id: "rejected-write",
            name: "tasks_write",
            params: { items },
            providerExecuted: false,
          }),
          finish("tool-calls"),
        )
      },
    }),
  )
  const journal = Layer.succeed(DriverJournal, {
    ...journalNoop,
    onCheckpoint: (_, commandId) => {
      if (commandId === undefined) return Effect.void
      componentWrites += 1
      return DriverError.make({ message: "component journal rejected" })
    },
    onCompleted: (operation) =>
      Effect.sync(() => {
        if (operation.kind === "tool") toolCompletions += 1
      }),
  })
  const layer = Layer.mergeAll(
    model,
    journal,
    Tasks.layer(),
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
    Hooks.layer([
      Hooks.onToolResult({
        key: "test.tasks.component.rejected-result",
        version: "1",
        replayPolicy: "pure",
        hook: () =>
          Effect.sync(() => {
            resultHooks += 1
          }),
      }),
    ]),
  )
  return scopedWith(layer)(
    Effect.gen(function* () {
      const failure = yield* Agent.stream(Agent.make({ name: "component-rejection" }), "write tasks").pipe(
        Stream.tap((event) =>
          Effect.sync(() => {
            events.push(event._tag)
          }),
        ),
        Stream.runDrain,
        Effect.flip,
      )
      expect(failure).toMatchObject({
        _tag: "generalist/core/DriverError",
        message: "Journal acknowledgement failed; reconstruct the interpreter before continuing",
      })
      expect(resultHooks).toBe(0)
      expect(componentWrites).toBe(1)
      expect(toolCompletions).toBe(0)
      expect(modelCalls).toBe(1)
      expect(events).not.toContain("ToolExecutionCompleted")
    }),
  )
})

it.effect("reopens a Tasks mutation accepted before its tool result and retries the unfinished command once", () =>
  Effect.gen(function* () {
    const storage = makeObjectStorage()
    const agent = Agent.make({ name: "component-interruption" })
    const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
    let interrupted = false
    const fault = Hooks.layer([
      Hooks.onToolResult({
        key: "test.tasks.component.interruption",
        version: "1",
        replayPolicy: "provider-idempotent",
        hook: () =>
          Effect.suspend(() => {
            if (interrupted) return Effect.void
            interrupted = true
            return Effect.interrupt
          }),
      }),
    ])
    const authorization = Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove, Tasks.layer(), fault)
    const firstModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.die("unused"),
        streamText: () =>
          Stream.make(
            Response.makePart("tool-call", {
              id: "write",
              name: "tasks_write",
              params: { items },
              providerExecuted: false,
            }),
            finish("tool-calls"),
          ),
      }),
    )
    const first = Layer.mergeAll(
      objectRuntimeLayer({ addresses: [], workerId: "component-first" }, storage).pipe(Layer.provide(resolver)),
      authorization,
      firstModel,
    )
    const runId = yield* scopedWith(first)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor
        const store = yield* RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "write tasks", { idempotencyKey: "component-interruption" })
        yield* executor.execute(
          yield* store.claimExecution({ runId: handle.runId, ownerId: "component-first", commandId: "first" }),
        )
        const execution = yield* store.loadExecution(handle.runId)
        const checkpoint = execution.checkpoint
        if (checkpoint === undefined || !("driverVersion" in checkpoint))
          return yield* Effect.die("Driver checkpoint missing")
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
        expect(state.components?.[0]?.state).toEqual(items)
        expect(state.components?.[0]?.receipts).toHaveLength(1)
        expect(state.toolBatch?.calls[0]?.state._tag).toBe("Scheduled")
        return handle.runId
      }),
    )
    let prompt = ""
    const recoveredModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.die("unused"),
        streamText: (request) => {
          prompt = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(request.prompt)
          return Stream.make(Response.makePart("text-delta", { id: "done", delta: "recovered" }), finish("stop"))
        },
      }),
    )
    const recovered = Layer.mergeAll(
      objectRuntimeLayer({ addresses: [], workerId: "component-second" }, storage).pipe(Layer.provide(resolver)),
      authorization,
      recoveredModel,
    )
    yield* scopedWith(recovered)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor
        const store = yield* RunStore
        yield* runtime.register(agent)
        yield* executor.execute(
          yield* store.claimExecution({ runId, ownerId: "component-second", commandId: "second" }),
        )
        expect(prompt).toContain("Survive tool interruption")
        const execution = yield* store.loadExecution(runId)
        const checkpoint = execution.checkpoint
        if (checkpoint === undefined || !("driverVersion" in checkpoint))
          return yield* Effect.die("Driver checkpoint missing")
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
        expect(state.components?.[0]?.receipts).toHaveLength(1)
        expect(
          (yield* runtime.history({ runId, limit: 100 })).filter((event) => event._tag === "ToolExecutionCompleted"),
        ).toHaveLength(1)
      }),
    )
  }),
)
