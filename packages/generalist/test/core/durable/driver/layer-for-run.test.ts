import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Hooks, Permissions } from "../../../../src/index.js"
import { Runtime, RunExecutor, RunStore, ExecutableResolver } from "../../../../src/runtime/index.js"
import { makeObjectStorage, objectRuntimeLayer } from "../../../runtime/execution/object.js"
import { LoopDriverState } from "../../../../src/core/durable/loop-driver-state.js"
import { DriverError, DriverStateInvalid } from "../../../../src/core/durable/service.js"
import { CommandTool, command, layer, make, read } from "generalist/components"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })
const scopedWith =
  <R, E>(services: Layer.Layer<R, E>) =>
  <A, Error>(effect: Effect.Effect<A, Error, R>) =>
    Effect.scoped(Layer.build(services).pipe(Effect.flatMap((context) => effect.pipe(Effect.provideContext(context)))))

it.effect("recovers an accepted Session tool mutation without applying it twice, then continues in another Run", () =>
  Effect.gen(function* () {
    let transitions = 0
    const reads: Array<number> = []
    const component = make({
      descriptor: {
        version: "1",
        key: "session-counter",
        instance: "default",
        schemaVersion: "1",
        handler: "increment",
        handlerVersion: "1",
        scope: "session",
        access: "session-owner",
        inheritance: "none",
        branch: "restore",
        redaction: "visible",
        maxStateBytes: 64,
        maxCommandBytes: 64,
        maxReceiptBytes: 4096,
      },
      state: Schema.Int,
      command: Schema.Int,
      initial: 0,
      transition: (state, increment) => {
        transitions++
        return state + increment
      },
    })
    expect(yield* read(component).pipe(Effect.flip)).toMatchObject({
      message: "Component read requires an active Agent Run",
    })
    expect(yield* command(component, { command: 1 }).pipe(Effect.flip)).toMatchObject({
      message: "Component command requires an active Agent Run",
    })
    const tool = Tool.make("increment", {
      parameters: Schema.Struct({ amount: Schema.Int }),
      success: Schema.Json,
      failure: Schema.Union([DriverError, DriverStateInvalid]),
      failureMode: "return",
    }).annotate(CommandTool, component.registration)
    const toolkit = Toolkit.make(tool)
    const handlers = toolkit.toLayer({
      increment: ({ amount }) =>
        Effect.gen(function* () {
          reads.push(yield* read(component))
          return yield* command(component, { command: amount })
        }),
    })
    const agent = Agent.make({ name: "session-component-recovery", toolkit })
    const storage = makeObjectStorage()
    const resolver = ExecutableResolver.layerStatic([]).pipe(Layer.orDie)
    let interrupted = false
    const authorization = Layer.mergeAll(
      handlers,
      layer([component.registration]).pipe(Layer.orDie),
      Permissions.layerAllowAll,
      Approvals.layerAutoApprove,
      Hooks.layer([
        Hooks.onToolResult({
          key: "session-component-interruption",
          version: "1",
          replayPolicy: "provider-idempotent",
          hook: () =>
            Effect.suspend(() => {
              if (interrupted) return Effect.void
              interrupted = true
              return Effect.interrupt
            }),
        }),
      ]),
    )
    const firstModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.die("unused"),
        streamText: () =>
          Stream.make(
            Response.makePart("tool-call", {
              id: "increment",
              name: "increment",
              params: { amount: 1 },
              providerExecuted: false,
            }),
            finish("tool-calls"),
          ),
      }),
    )
    const first = Layer.mergeAll(
      objectRuntimeLayer({ addresses: [], workerId: "first" }, storage).pipe(Layer.provide(resolver)),
      authorization,
      firstModel,
    )
    const runId = yield* scopedWith(first)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "increment", {
          sessionId: "session-counter",
          idempotencyKey: "first",
        })
        yield* (yield* RunExecutor.RunExecutor).execute(
          yield* store.claimExecution({ runId: handle.runId, ownerId: "first", commandId: "first" }),
        )
        const execution = yield* store.loadExecution(handle.runId)
        expect(
          (yield* runtime.history({ runId: handle.runId, limit: 100 })).find((event) => event._tag === "RunFailed"),
        ).toBeUndefined()
        const checkpoint = execution.checkpoint
        if (checkpoint === undefined || !("driverVersion" in checkpoint)) return yield* Effect.die("Missing checkpoint")
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state)
        expect(state.toolBatch?.calls[0]?.state._tag).toBe("Scheduled")
        expect(execution.sessionComponents?.[0]?.state).toBe(1)
        expect(execution.sessionComponents?.[0]?.receipts).toHaveLength(1)
        expect(transitions).toBe(1)
        return handle.runId
      }),
    )
    let modelCalls = 0
    const recoveredModel = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.die("unused"),
        streamText: () => {
          modelCalls++
          return modelCalls === 2
            ? Stream.make(
                Response.makePart("tool-call", {
                  id: "next",
                  name: "increment",
                  params: { amount: 2 },
                  providerExecuted: false,
                }),
                finish("tool-calls"),
              )
            : Stream.make(Response.makePart("text-delta", { id: "done", delta: "done" }), finish("stop"))
        },
      }),
    )
    const recovered = Layer.mergeAll(
      objectRuntimeLayer({ addresses: [], workerId: "second" }, storage).pipe(Layer.provide(resolver)),
      authorization,
      recoveredModel,
    )
    yield* scopedWith(recovered)(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const store = yield* RunStore.RunStore
        const executor = yield* RunExecutor.RunExecutor
        yield* runtime.register(agent)
        yield* executor.execute(yield* store.claimExecution({ runId, ownerId: "second", commandId: "recovery" }))
        expect(transitions).toBe(1)
        expect(
          (yield* runtime.history({ runId, limit: 100 })).filter((event) => event._tag === "ToolExecutionCompleted"),
        ).toHaveLength(1)
        const next = yield* runtime.start(agent, "increment again", {
          sessionId: "session-counter",
          idempotencyKey: "second",
        })
        yield* executor.execute(
          yield* store.claimExecution({ runId: next.runId, ownerId: "second", commandId: "second" }),
        )
        expect((yield* store.loadExecution(next.runId)).sessionComponents?.[0]?.state).toBe(3)
        expect((yield* store.loadExecution(next.runId)).sessionComponents?.[0]?.receipts).toHaveLength(2)
        expect(transitions).toBe(2)
        expect(reads).toEqual([0, 1, 1])
      }),
    )
  }),
)
