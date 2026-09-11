import {
  makeObjectStorage,
  objectRuntimeLayer,
  objectWorkerId,
  type ObjectRuntimeOptions,
} from "../execution/object.js"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, RunBudget } from "../../../src/index.js"
import {
  Address,
  ChildAdmission,
  ExecutableResolver,
  RunExecutor,
  RunStore,
  Runtime,
} from "../../../src/runtime/index.js"
import { allowAllAuthorization } from "../../authorization.js"
import {
  assistant,
  assistantRef,
  completedResult,
  registrationsFor,
  researcher,
  researcherRef,
} from "../execution/fixtures.js"
import { closedTestAgent } from "../run/identity.js"
import { provideScoped } from "../execution/scoped-provide.js"
import { capGrant } from "../../../src/runtime/budget/state.js"

it("caps child grants by both the available allocation and pinned profile budget", () => {
  const available = { tokens: 100, usd: 2, children: 3 }
  expect(capGrant(available, { tokens: 40, usd: 4, toolCalls: 2 })).toEqual({
    tokens: 40,
    usd: 2,
    children: 3,
    toolCalls: 2,
  })
  expect(available).toEqual({ tokens: 100, usd: 2, children: 3 })
  expect(capGrant({}, { tokens: 0 })).toEqual({ tokens: 0 })
})

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const modelLayer = (parts: ReadonlyArray<Response.StreamPartEncoded>) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => Stream.fromIterable(parts),
    }),
  )
const textModel = modelLayer([
  Response.makePart("text-delta", { id: "budget", delta: "done" }),
  Response.makePart("finish", { reason: "stop", usage, response: undefined }),
])
const agent = Agent.make({ name: "runtime-budget", toolkit: Toolkit.empty })
const runtimeLayer = (
  model: Layer.Layer<LanguageModel.LanguageModel>,
  ownership: Pick<ObjectRuntimeOptions, "reconcileInterval" | "ownershipLeaseMillis"> = {},
) =>
  Layer.merge(
    objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" }, ...ownership }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
    ),
    Layer.merge(allowAllAuthorization, model),
  )

const execute = Effect.fn("test.executeBudgetRun")(function* (budget: RunBudget.RunBudget) {
  const runtime = yield* Runtime.Runtime
  const executor = yield* RunExecutor.RunExecutor
  const store = yield* RunStore.RunStore
  yield* runtime.register(agent)
  const handle = yield* runtime.start(agent, "run", { budget })
  yield* executor.execute(
    yield* store.claimExecution({
      commandId: "runtime-budget-state-test-ts-claim-1",
      runId: handle.runId,
      ownerId: objectWorkerId,
    }),
  )
  return yield* runtime.inspect(handle.runId)
})

it.effect("suspends on exhaustion, journals extension, and resumes", () =>
  provideScoped(
    runtimeLayer(textModel),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      yield* runtime.register(agent)
      const handle = yield* runtime.start(agent, "run", {
        sessionId: "budget-suspend",
        idempotencyKey: "budget-suspend",
        budget: RunBudget.make({ tokens: 0, usd: 1, duration: "1 minute", toolCalls: 1, children: 1 }),
      })
      yield* executor.execute(
        yield* store.claimExecution({
          commandId: "runtime-budget-state-test-ts-claim-2",
          runId: handle.runId,
          ownerId: objectWorkerId,
        }),
      )
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({
        status: "waiting",
        budget: { tokens: 0 },
        suspension: { _tag: "BudgetExhausted", budget: "tokens" },
      })
      expect((yield* runtime.operator.explain(handle.runId)).decision).toEqual({
        _tag: "AwaitBudget",
        budget: "tokens",
      })

      yield* runtime.operator.extendBudget(handle.runId, { usd: 1 }, "operator:budget", "budget:usd")
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({
        status: "waiting",
        suspension: { _tag: "BudgetExhausted", budget: "tokens" },
      })
      yield* runtime.operator.extendBudget(handle.runId, { tokens: 10 }, "operator:budget", "budget:tokens")
      expect((yield* store.recoveryJournal(handle.runId)).actions).toEqual([
        expect.objectContaining({
          operator: "operator:budget",
          action: { _tag: "ExtendBudget", delta: { usd: 1 } },
        }),
        expect.objectContaining({
          operator: "operator:budget",
          action: { _tag: "ExtendBudget", delta: { tokens: 10 } },
        }),
      ])
      expect(
        yield* runtime.operator
          .extendBudget(handle.runId, { tokens: 1 }, "operator:budget", "budget:illegal")
          .pipe(Effect.flip),
      ).toMatchObject({
        _tag: "generalist/runtime/IllegalOperatorAction",
        decision: { _tag: "Resume" },
        action: "extendBudget",
      })
      expect((yield* store.recoveryJournal(handle.runId)).actions).toHaveLength(2)
      yield* executor.execute(
        yield* store.claimExecution({
          commandId: "runtime-budget-state-test-ts-claim-3",
          runId: handle.runId,
          ownerId: objectWorkerId,
        }),
      )
      expect(yield* handle.await).toBe("done")
      const inspection = yield* runtime.inspect(handle.runId)
      expect(inspection.status).toBe("succeeded")
      expect(inspection.budget.tokens).toBe(8)
      expect(inspection.budget.usd).toBe("unknown")
      expect((yield* runtime.history({ runId: handle.runId, limit: 100 })).map((event) => event._tag)).toContain(
        "BudgetExtended",
      )
    }),
  ),
)

it.effect("suspends before provider dispatch when tokens are exhausted", () =>
  provideScoped(
    runtimeLayer(textModel),
    Effect.gen(function* () {
      expect(yield* execute(RunBudget.make({ tokens: 0 }))).toMatchObject({
        status: "waiting",
        suspension: { _tag: "BudgetExhausted", budget: "tokens" },
      })
    }),
  ),
)

it.effect("suspends before provider dispatch when USD is exhausted", () =>
  provideScoped(
    runtimeLayer(textModel),
    Effect.gen(function* () {
      expect(yield* execute(RunBudget.make({ usd: 0 }))).toMatchObject({
        status: "waiting",
        suspension: { _tag: "BudgetExhausted", budget: "usd" },
      })
    }),
  ),
)

it.effect("suspends when elapsed duration is exhausted before provider dispatch", () =>
  provideScoped(
    runtimeLayer(textModel, { reconcileInterval: "2 hours", ownershipLeaseMillis: 6 * 60 * 60 * 1000 }),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      yield* runtime.register(agent)
      const handle = yield* runtime.start(agent, "run", { budget: RunBudget.make({ duration: "1 second" }) })
      yield* TestClock.adjust("2 seconds")
      yield* executor.execute(
        yield* store.claimExecution({
          commandId: "runtime-budget-state-test-ts-claim-4",
          runId: handle.runId,
          ownerId: objectWorkerId,
        }),
      )
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({
        status: "waiting",
        budget: { duration: 0 },
        suspension: { _tag: "BudgetExhausted", budget: "duration" },
      })
      yield* TestClock.adjust("1 hour")
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({ budget: { duration: 0 } })
      yield* runtime.extendBudget({
        commandId: "budget:duration",
        runId: handle.runId,
        delta: { duration: "2 seconds" },
      })
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({ status: "running", budget: { duration: 1_000 } })
    }),
  ),
)

it.effect("rejects malformed budget extensions with RunBudgetInvalid", () =>
  provideScoped(
    runtimeLayer(textModel),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      yield* runtime.register(agent)
      const handle = yield* runtime.start(agent, "run", { budget: RunBudget.make({ duration: "1 minute" }) })
      for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        const failure = yield* runtime
          .extendBudget({
            commandId: `budget:malformed:${String(duration)}`,
            runId: handle.runId,
            delta: { duration },
          })
          .pipe(Effect.flip)
        expect(failure).toMatchObject({ _tag: "generalist/core/RunBudgetInvalid" })
      }
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({ budget: { duration: 60_000 } })
      // Failed extensions are not journaled: a later valid extension adds exactly its own delta.
      yield* runtime.extendBudget({
        commandId: "budget:valid-after-malformed",
        runId: handle.runId,
        delta: { duration: 500 },
      })
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({ budget: { duration: 60_500 } })
    }),
  ),
)

it.effect("one tool-call extension pays for exactly one handler execution", () => {
  let calls = 0
  let modelCalls = 0
  const echo = Tool.make("echo", { parameters: Schema.Struct({ text: Schema.String }), success: Schema.String })
  const toolkit = Toolkit.make(echo)
  const toolAgent = Agent.make({ name: "tool-budget", toolkit })
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        modelCalls += 1
        return Stream.fromIterable<Response.StreamPartEncoded>(
          modelCalls === 1
            ? [
                Response.makePart("tool-call", {
                  id: "budget-tool",
                  name: "echo",
                  params: { text: "approved" },
                  providerExecuted: false,
                }),
                Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
              ]
            : [
                Response.makePart("text-delta", { id: "budget-done", delta: "done" }),
                Response.makePart("finish", { reason: "stop", usage, response: undefined }),
              ],
        )
      },
    }),
  )
  return provideScoped(
    Layer.merge(
      runtimeLayer(model),
      toolkit.toLayer({
        echo: ({ text }) =>
          Effect.sync(() => {
            calls += 1
            return text
          }),
      }),
    ),
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      yield* runtime.register(toolAgent)
      const handle = yield* runtime.start(toolAgent, "run", { budget: RunBudget.make({ toolCalls: 0 }) })
      yield* executor.execute(
        yield* store.claimExecution({
          commandId: "runtime-budget-state-test-ts-claim-5",
          runId: handle.runId,
          ownerId: objectWorkerId,
        }),
      )
      expect(calls).toBe(0)
      expect(yield* runtime.inspect(handle.runId)).toMatchObject({
        status: "waiting",
        suspension: { _tag: "BudgetExhausted", budget: "toolCalls" },
      })
      yield* runtime.extendBudget({ commandId: "budget:tool-calls", runId: handle.runId, delta: { toolCalls: 1 } })
      yield* executor.execute(
        yield* store.claimExecution({
          commandId: "runtime-budget-state-test-ts-claim-6",
          runId: handle.runId,
          ownerId: objectWorkerId,
        }),
      )
      expect(yield* handle.await).toBe("done")
      expect(calls).toBe(1)
      expect(modelCalls).toBe(2)
      const history = yield* runtime.history({ runId: handle.runId, limit: 100 })
      expect(history.filter((event) => event._tag === "ToolExecutionStarted")).toHaveLength(1)
      expect(history.filter((event) => event._tag === "ToolExecutionCompleted")).toHaveLength(1)
    }),
  )
})

it.effect("suspends before admitting a child when the child budget is exhausted", () => {
  const childModel = modelLayer([
    Response.makePart("tool-call", {
      id: "budget-child",
      name: "run_child",
      params: { selection: "researcher", prompt: "work" },
      providerExecuted: false,
    }),
    Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
  ])
  const resolver = ExecutableResolver.layerStatic([
    { executable: assistantRef, agent: Agent.close(assistant, Layer.merge(allowAllAuthorization, childModel)) },
    { executable: researcherRef, agent: closedTestAgent(researcher) },
  ]).pipe(Layer.orDie)
  const address = Address.make("agent:budget-parent")
  const layer = objectRuntimeLayer({
    addresses: [{ address, executable: assistantRef, registrations: registrationsFor(assistantRef) }],
    scheduler: { pollInterval: "1 hour" },
  }).pipe(Layer.provide(resolver))
  return provideScoped(
    layer,
    Effect.gen(function* () {
      const runtime = yield* Runtime.Runtime
      const executor = yield* RunExecutor.RunExecutor
      const store = yield* RunStore.RunStore
      const receipt = yield* runtime.send({
        to: address,
        sessionId: "budget-child",
        idempotencyKey: "budget-child",
        prompt: "delegate",
        treePolicy: { maxDepth: 1, maxSessions: 1024, concurrency: { agents: 1, tools: 1024 } },
      })
      yield* runtime.extendBudget({ commandId: "budget:children:zero", runId: receipt.runId, delta: { children: 0 } })
      yield* executor.execute(
        yield* store.claimExecution({
          commandId: "runtime-budget-state-test-ts-claim-7",
          runId: receipt.runId,
          ownerId: objectWorkerId,
        }),
      )
      const inspection = yield* runtime.inspect(receipt.runId)
      expect(inspection).toMatchObject({
        status: "waiting",
        suspension: { _tag: "BudgetExhausted", budget: "children" },
      })

      yield* runtime.extendBudget({ commandId: "budget:children:one", runId: receipt.runId, delta: { children: 1 } })
      const child = yield* ChildAdmission.make(store).admit({
        parentRunId: receipt.runId,
        toolCallId: "budget-reservation",
        selection: "researcher",
        prompt: "reserved work",
        key: "reserved",
      })
      expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ budget: { children: 0 } })
      yield* store.complete({
        commandId: "state.test-293",
        ...(yield* store.claimExecution({
          commandId: "runtime-budget-state-test-ts-claim-8",
          runId: child.childRunId,
          ownerId: objectWorkerId,
        })),
        result: completedResult("done"),
      })
      expect(yield* runtime.inspect(receipt.runId)).toMatchObject({ budget: { children: 0 } })
    }),
  )
})

it.effect("recomputes spend after fresh object-host recovery and resumes without redispatch", () => {
  const storage = makeObjectStorage()
  let modelCalls = 0
  const countedModel = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        modelCalls += 1
        return Stream.fromIterable<Response.StreamPartEncoded>([
          Response.makePart("text-delta", { id: "budget", delta: "done" }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        ])
      },
    }),
  )
  const layer = () =>
    Layer.merge(
      objectRuntimeLayer({ addresses: [], scheduler: { pollInterval: "1 hour" } }, storage).pipe(
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      ),
      Layer.merge(allowAllAuthorization, countedModel),
    )
  return Effect.gen(function* () {
    const runId = yield* Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* runtime.register(agent)
        const handle = yield* runtime.start(agent, "run", { budget: RunBudget.make({ tokens: 1 }) })
        yield* executor.execute(
          yield* store.claimExecution({
            runId: handle.runId,
            ownerId: objectWorkerId,
            commandId: "budget-before-recovery",
          }),
        )
        const inspection = yield* runtime.inspect(handle.runId)
        expect(inspection).toMatchObject({
          status: "waiting",
          usage: { inputTokens: 1, outputTokens: 1 },
          usageFacts: [expect.objectContaining({ _tag: "Completed" })],
          activeTools: [],
          elapsed: 0,
          budget: { tokens: 0 },
          suspension: { _tag: "BudgetExhausted", budget: "tokens" },
        })
        expect(inspection.lastEvent).toBeDefined()
        return handle.runId
      }).pipe((effect) => provideScoped(layer(), effect)),
    )

    yield* Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        const reopened = yield* runtime.inspect(runId)
        expect(reopened).toMatchObject({
          status: "waiting",
          usage: { inputTokens: 1, outputTokens: 1 },
          usageFacts: [expect.objectContaining({ _tag: "Completed" })],
          activeTools: [],
          elapsed: 0,
          budget: { tokens: 0 },
        })
        expect(reopened.lastEvent).toBeDefined()
        yield* runtime.register(agent)
        yield* runtime.operator.extendBudget(runId, { tokens: 10 }, "operator:budget-recovery", "budget-extension")
        expect((yield* store.recoveryJournal(runId)).actions).toEqual([
          expect.objectContaining({
            operator: "operator:budget-recovery",
            action: { _tag: "ExtendBudget", delta: { tokens: 10 } },
          }),
        ])
        yield* executor.execute(
          yield* store.claimExecution({
            runId,
            ownerId: objectWorkerId,
            commandId: "budget-after-recovery",
          }),
        )
        expect(yield* runtime.inspect(runId)).toMatchObject({ status: "succeeded", budget: { tokens: 9 } })
      }).pipe((effect) => provideScoped(layer(), effect)),
    )
    expect(modelCalls).toBe(1)
  })
})

it("normalizes all public dimensions", () => {
  expect(RunBudget.make({ tokens: 2, usd: 3, duration: "4 seconds", toolCalls: 5, children: 6 }).allocation).toEqual({
    tokens: 2,
    usd: 3,
    duration: 4_000,
    toolCalls: 5,
    children: 6,
  })
})
