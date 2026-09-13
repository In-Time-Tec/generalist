import { objectRuntimeLayer, objectWorkerId } from "../object.js"
import { expect, it } from "@effect/vitest"
import { Clock, Effect, Layer, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, ToolContext } from "generalist"
import { ExecutableResolver } from "generalist/runtime"
import * as Runtime from "../../../../src/runtime/engine.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import { RunExecutor } from "../../../../src/runtime/execution/run-executor.js"
import { allowAllAuthorization } from "../../../authorization.js"
import { provideScoped } from "../scoped-provide.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const waitTool = Tool.make("wait_for_webhook", {
  parameters: Schema.Struct({}),
  success: Agent.AwaitEventResult,
  failure: Agent.AwaitEventInvalid,
}).addDependency(ToolContext.ToolContext)
const toolkit = Toolkit.make(waitTool)
const agent = Agent.make({ name: "await-event-test", toolkit })

const fixture = () => {
  let modelCalls = 0
  let handlerCalls = 0
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        modelCalls += 1
        return modelCalls === 1
          ? Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("tool-call", {
                id: "wait-webhook-1",
                name: "wait_for_webhook",
                params: {},
                providerExecuted: false,
              }),
              finish,
            ])
          : Stream.fromIterable<Response.StreamPartEncoded>([
              Response.makePart("text-delta", { id: "done", delta: "resumed" }),
              finish,
            ])
      },
    }),
  )
  const handlers = toolkit.toLayer({
    wait_for_webhook: () => {
      handlerCalls += 1
      return Agent.awaitEvent({ _tag: "Webhook", source: "github" }, { timeout: "1 second" })
    },
  })
  const runtime = objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
    Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
  )
  return {
    counts: () => ({ handlerCalls, modelCalls }),
    layer: Layer.mergeAll(runtime, model, handlers, allowAllAuthorization),
  }
}

const suspend = Effect.fn("test.suspendAwaitEvent")(function* () {
  const runtime = yield* Runtime.Runtime
  const executor = yield* RunExecutor
  const store = yield* RunStore
  yield* runtime.register(agent)
  const handle = yield* runtime.start(agent, "wait", {
    sessionId: "await-event-session",
    idempotencyKey: "await-event-run",
  })
  yield* executor.execute(
    yield* store.claimExecution({
      commandId: "runtime-execution-trigger-wake-test-ts-claim-1",
      runId: handle.runId,
      ownerId: objectWorkerId,
    }),
  )
  expect(yield* runtime.inspect(handle.runId)).toMatchObject({
    status: "waiting",
    waits: [
      {
        reason: {
          _tag: "AwaitEvent",
          filter: { _tag: "Webhook", source: "github" },
        },
      },
    ],
  })
  return handle.runId
})

it.effect("journals, deduplicates, and resumes one matching event without redispatch", () => {
  const state = fixture()
  return provideScoped(
    state.layer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor
      const store = yield* RunStore
      const runId = yield* suspend()
      const event = {
        _tag: "Webhook" as const,
        dedupeKey: "delivery-349",
        source: "github",
        payload: { action: "opened" },
        headers: { "x-github-delivery": "delivery-349" },
      }

      expect(yield* runtime.wake({ runId, event, commandId: "wake-delivery-1" })).toMatchObject({ _tag: "Resumed" })
      expect(yield* runtime.wake({ runId, event, commandId: "wake-delivery-1" })).toMatchObject({ _tag: "Resumed" })
      expect(yield* runtime.wake({ runId, event, commandId: "wake-delivery-2" })).toEqual({ _tag: "Duplicate" })
      yield* executor.execute(
        yield* store.claimExecution({
          commandId: "runtime-execution-trigger-wake-test-ts-claim-2",
          runId,
          ownerId: objectWorkerId,
        }),
      )

      expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
      const history = yield* runtime.history({ runId, limit: 100 })
      expect(history.filter((item) => item._tag === "Awaiting")).toHaveLength(1)
      expect(history.filter((item) => item._tag === "WakeReceived")).toHaveLength(1)
      expect(history.filter((item) => item._tag === "Duplicate")).toHaveLength(1)
      expect(history.filter((item) => item._tag === "RunResumed")).toHaveLength(1)
      expect(state.counts()).toEqual({ handlerCalls: 1, modelCalls: 2 })
    }),
  )
})

it.effect("resumes an elapsed await with TimedOut under TestClock", () => {
  const state = fixture()
  return provideScoped(
    state.layer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor
      const store = yield* RunStore
      const runId = yield* suspend()
      yield* TestClock.adjust("1 second")
      const now = yield* Clock.currentTimeMillis
      const [due] = yield* store.dueAwaitEvents({ now, limit: 10 })
      expect(due).toBeDefined()
      if (due === undefined) return
      expect(
        yield* store.timeoutAwaitEvent({
          commandId: "runtime-execution-trigger-wake-test-ts-timeoutAwaitEvent-1",
          ...due,
        }),
      ).toBe(true)
      yield* executor.execute(
        yield* store.claimExecution({
          commandId: "runtime-execution-trigger-wake-test-ts-claim-3",
          runId,
          ownerId: objectWorkerId,
        }),
      )

      expect((yield* runtime.inspect(runId)).status).toBe("succeeded")
      const history = yield* runtime.history({ runId, limit: 100 })
      expect(history.filter((item) => item._tag === "TimedOut")).toHaveLength(1)
      expect(history.filter((item) => item._tag === "RunResumed")).toHaveLength(1)
      expect(state.counts()).toEqual({ handlerCalls: 1, modelCalls: 2 })
    }),
  )
})
