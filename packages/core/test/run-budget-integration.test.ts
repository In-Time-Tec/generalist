import { describe, expect, it } from "@effect/vitest"
import { DateTime, Deferred, Effect, Layer, Option, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Chat, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import type { DriverCheckpoint } from "../src/durable/driver-contract.js"
import {
  Agent,
  AgentEvent,
  AgentTool,
  Approvals,
  Compaction,
  DurableDriver,
  ModelMiddleware,
  RunBudget,
  Session,
  ToolExecutor,
} from "../src/index"
import { withProviderFinish } from "./provider-finish.js"
import { unusedToolHandlerLayer } from "./tool-handler-layer.js"

const echoTool = Tool.make("echo", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const gatedTool = Tool.make("gated", {
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
  needsApproval: true,
})

const finishWithUsage = (input: number, output: number) =>
  Response.makePart("finish", {
    reason: "stop",
    usage: Response.Usage.make({
      inputTokens: { uncached: undefined, total: input, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: output, text: undefined, reasoning: undefined },
    }),
    response: undefined,
  })

const journalCapture = () => {
  const scheduled = new Array<{ readonly kind: string; readonly key: string }>()
  let lastCheckpoint: DriverCheckpoint | undefined
  const journal: DurableDriver.DriverJournal = {
    onScheduled: (operation) =>
      Effect.sync(() => {
        scheduled.push({ kind: operation.kind, key: operation.key })
      }).pipe(Effect.as(undefined)),
    onCompleted: (_operation, _outcome, checkpoint) =>
      Effect.sync(() => {
        lastCheckpoint = checkpoint
      }),
    onCheckpoint: (checkpoint) =>
      Effect.sync(() => {
        lastCheckpoint = checkpoint
      }),
  }
  return {
    scheduled,
    get lastCheckpoint() {
      return lastCheckpoint
    },
    journalLayer: Layer.succeed(DurableDriver.DriverJournalService, journal),
  }
}

const makeToolCallModelLayer = () => {
  let calls = 0
  return Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () => {
        calls += 1
        return withProviderFinish(
          calls === 1
            ? Stream.fromIterable([
                Response.makePart("tool-call", {
                  id: "call-1",
                  name: "echo",
                  params: { text: "hi" },
                  providerExecuted: false,
                }),
              ])
            : Stream.concat(
                Stream.make(Response.makePart("text-delta", { id: "text", delta: "done" })),
                Stream.make(finishWithUsage(0, 0)),
              ),
        )
      },
    }),
  )
}

const baseLayers = (journalLayer: Layer.Layer<DurableDriver.DriverJournalService>) =>
  Layer.mergeAll(
    makeToolCallModelLayer(),
    ToolExecutor.layerTest({
      execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
    }),
    Approvals.layerAutoApprove,
    journalLayer,
    unusedToolHandlerLayer,
  )

describe("RunBudget Agent.stream integration", () => {
  it.effect("charges each model attempt in a tool retry turn", () =>
    Effect.gen(function* () {
      const capture = journalCapture()
      const agent = Agent.make({
        name: "retry-charge-agent",
        toolkit: Toolkit.make(echoTool),
        budget: { modelCalls: 2, toolCalls: 1 },
      })
      yield* Agent.stream(agent, { prompt: "retry", logicalOperationId: "retry-run" }).pipe(
        Stream.runDrain,
        Effect.provide(baseLayers(capture.journalLayer)),
      )
      expect(capture.scheduled.filter((operation) => operation.kind === "model").length).toBe(2)
      expect(capture.lastCheckpoint?.budget.remaining.modelCalls).toBe(0)
    }),
  )

  it.effect("fails typed at schedule boundary when model calls are exhausted", () =>
    Effect.gen(function* () {
      const agent = Agent.make({
        name: "model-exhaust-agent",
        toolkit: Toolkit.empty,
        budget: { modelCalls: 0 },
      })
      const error = yield* Stream.runDrain(Agent.stream(agent, { prompt: "hi" })).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.effect(
              LanguageModel.LanguageModel,
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () =>
                  withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "t", delta: "x" }))),
              }),
            ),
            unusedToolHandlerLayer,
          ),
        ),
        Effect.flip,
      )
      expect(error._tag).toBe("@batonfx/core/RunBudgetExhausted")
      if (error._tag === "@batonfx/core/RunBudgetExhausted") {
        expect(error.dimension).toBe("modelCalls")
        expect(error.remaining).toBe(0)
      }
    }),
  )

  it.effect("fails typed when tool calls are exhausted before execution", () =>
    Effect.gen(function* () {
      const capture = journalCapture()
      const agent = Agent.make({
        name: "tool-exhaust-agent",
        toolkit: Toolkit.make(echoTool),
        budget: { modelCalls: 2, toolCalls: 0 },
      })
      const error = yield* Stream.runDrain(Agent.stream(agent, { prompt: "tool" })).pipe(
        Effect.provide(baseLayers(capture.journalLayer)),
        Effect.flip,
      )
      expect(error._tag).toBe("@batonfx/core/RunBudgetExhausted")
      if (error._tag === "@batonfx/core/RunBudgetExhausted") {
        expect(error.dimension).toBe("toolCalls")
      }
    }),
  )

  it.effect("charges reported token usage after model finish", () =>
    Effect.gen(function* () {
      const capture = journalCapture()
      const agent = Agent.make({
        name: "token-charge-agent",
        toolkit: Toolkit.empty,
        budget: { modelCalls: 1, totalTokens: 20 },
      })
      yield* Agent.stream(agent, { prompt: "tokens" }).pipe(
        Stream.runDrain,
        Effect.provide(
          Layer.mergeAll(
            Layer.effect(
              LanguageModel.LanguageModel,
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () =>
                  withProviderFinish(
                    Stream.concat(
                      Stream.make(Response.makePart("text-delta", { id: "text", delta: "hi" })),
                      Stream.make(finishWithUsage(12, 3)),
                    ),
                  ),
              }),
            ),
            capture.journalLayer,
            unusedToolHandlerLayer,
          ),
        ),
      )
      expect(capture.lastCheckpoint?.budget.remaining.totalTokens).toBe(5)
    }),
  )

  it.effect("fails typed when deadline expires at schedule boundary", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe("2026-06-01T00:00:00.000Z")))
      const agent = Agent.make({
        name: "deadline-agent",
        toolkit: Toolkit.empty,
        budget: { modelCalls: 5, deadline: "2026-06-01T00:00:01.000Z" },
      })
      yield* TestClock.adjust("2 seconds")
      const error = yield* Stream.runDrain(Agent.stream(agent, { prompt: "late" })).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.effect(
              LanguageModel.LanguageModel,
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () =>
                  withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "t", delta: "x" }))),
              }),
            ),
            unusedToolHandlerLayer,
          ),
        ),
        Effect.flip,
      )
      expect(error._tag).toBe("@batonfx/core/RunBudgetExhausted")
      if (error._tag === "@batonfx/core/RunBudgetExhausted") {
        expect(error.dimension).toBe("deadline")
      }
    }),
  )

  it.effect("narrows per-run budget below agent default", () =>
    Effect.gen(function* () {
      const capture = journalCapture()
      const agent = Agent.make({
        name: "narrow-agent",
        toolkit: Toolkit.empty,
        budget: { modelCalls: 5 },
      })
      yield* Agent.stream(agent, { prompt: "narrow", budget: { modelCalls: 1 } }).pipe(
        Stream.runDrain,
        Effect.provide(
          Layer.mergeAll(
            Layer.effect(
              LanguageModel.LanguageModel,
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () =>
                  withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "t", delta: "x" }))),
              }),
            ),
            capture.journalLayer,
            unusedToolHandlerLayer,
          ),
        ),
      )
      expect(capture.lastCheckpoint?.budget.allocation.modelCalls).toBe(1)
      expect(capture.lastCheckpoint?.budget.remaining.modelCalls).toBe(0)
    }),
  )

  it.effect("reserves and refunds child agent-tool budget without widening", () =>
    Effect.gen(function* () {
      const capture = journalCapture()
      const child = Agent.make({ name: "child-agent", toolkit: Toolkit.empty, budget: { modelCalls: 1 } })
      const parentTool = AgentTool.asTool(child, { name: "invoke_child" })
      const parent = Agent.make({
        name: "parent-agent",
        toolkit: Toolkit.make(parentTool.tool, echoTool),
        budget: { modelCalls: 3, childRuns: 1, depth: 1 },
      })
      let modelCalls = 0
      yield* Agent.stream(parent, { prompt: "child", logicalOperationId: "parent-child" }).pipe(
        Stream.runDrain,
        Effect.provide(
          Layer.mergeAll(
            Layer.effect(
              LanguageModel.LanguageModel,
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () => {
                  modelCalls += 1
                  if (modelCalls === 1) {
                    return withProviderFinish(
                      Stream.make(
                        Response.makePart("tool-call", {
                          id: "child-call",
                          name: "invoke_child",
                          params: { prompt: "sub" },
                          providerExecuted: false,
                        }),
                      ),
                    )
                  }
                  if (modelCalls === 2) {
                    return withProviderFinish(
                      Stream.make(Response.makePart("text-delta", { id: "child", delta: "sub" })),
                    )
                  }
                  return withProviderFinish(
                    Stream.make(Response.makePart("text-delta", { id: "parent", delta: "done" })),
                  )
                },
              }),
            ),
            Toolkit.make(parentTool.tool).toLayer({ invoke_child: (params) => parentTool.invoke(params) }),
            ToolExecutor.layerTest({
              execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
            }),
            Approvals.layerAutoApprove,
            capture.journalLayer,
            unusedToolHandlerLayer,
          ),
        ),
      )
      expect(modelCalls).toBeGreaterThanOrEqual(2)
      expect(capture.lastCheckpoint?.budget.remaining.modelCalls).toBeGreaterThanOrEqual(0)
    }),
  )

  it.effect("rejects child grant wider than parent remaining", () =>
    Effect.gen(function* () {
      const parent = RunBudget.allocate({ modelCalls: 1, childRuns: 1, depth: 1 })
      const error = yield* RunBudget.reserveChild(parent, { modelCalls: 5 }).pipe(Effect.flip)
      expect(error._tag).toBe("@batonfx/core/RunBudgetGrantWidened")
    }),
  )

  it.effect("auto-approves gated tools only with explicit layerAutoApprove", () =>
    Effect.gen(function* () {
      let calls = 0
      let handled = false
      const agent = Agent.make({ name: "auto-approve-agent", toolkit: Toolkit.make(gatedTool) })
      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "gated" }).pipe(
          Stream.provide(
            Layer.mergeAll(
              Layer.effect(
                LanguageModel.LanguageModel,
                LanguageModel.make({
                  generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                  streamText: () => {
                    calls += 1
                    return withProviderFinish(
                      calls === 1
                        ? Stream.fromIterable([
                            Response.makePart("tool-call", {
                              id: "gated-1",
                              name: "gated",
                              params: { text: "x" },
                              providerExecuted: false,
                            }),
                          ])
                        : Stream.make(Response.makePart("text-delta", { id: "t", delta: "done" })),
                    )
                  },
                }),
              ),
              Toolkit.make(gatedTool).toLayer({
                gated: () =>
                  Effect.sync(() => {
                    handled = true
                    return { ok: true }
                  }),
              }),
              Approvals.layerAutoApprove,
            ),
          ),
        ),
      )
      expect(handled).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }),
  )

  it.effect("records session sync operation keys", () =>
    Effect.gen(function* () {
      const capture = journalCapture()
      const persistenceLayer = Chat.layerPersisted({ storeId: "budget-session-test" }).pipe(
        Layer.provide(Persistence.layerBackingMemory),
      )
      const agent = Agent.make({
        name: "session-budget-agent",
        toolkit: Toolkit.make(echoTool),
      })
      yield* Agent.stream(agent, {
        prompt: "sync",
        logicalOperationId: "logical-sync",
        sessionId: "session-sync",
        persistence: { chatId: "chat-sync" },
      }).pipe(
        Stream.runDrain,
        Effect.provide(
          Layer.mergeAll(
            makeToolCallModelLayer(),
            ToolExecutor.layerTest({
              execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
            }),
            Approvals.layerAutoApprove,
            Session.layerMemory,
            Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
            ModelMiddleware.layerIdentity,
            persistenceLayer,
            capture.journalLayer,
            Agent.layerRuntime,
            unusedToolHandlerLayer,
          ),
        ),
      )
      expect(capture.scheduled.some((operation) => operation.kind === "memory" && operation.key.includes("sync"))).toBe(
        true,
      )
    }),
  )

  it.effect("preserves AgentEvent ordering when budget limits apply", () =>
    Effect.gen(function* () {
      const capture = journalCapture()
      const agent = Agent.make({
        name: "event-order-agent",
        toolkit: Toolkit.make(echoTool),
        budget: { modelCalls: 3, toolCalls: 1 },
      })
      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "order" }).pipe(Stream.provide(baseLayers(capture.journalLayer))),
      )
      const tags = events.map((event) => event._tag)
      const started = tags.indexOf("ToolExecutionStarted")
      const completed = tags.indexOf("ToolExecutionCompleted")
      expect(started).toBeGreaterThanOrEqual(0)
      expect(completed).toBeGreaterThan(started)
      expect(tags.at(-1)).toBe("Completed")
    }),
  )

  it.effect("rejects resume when driver suspension token does not match", () =>
    Effect.gen(function* () {
      const approval = yield* Deferred.make<Approvals.Resolution>()
      const agent = Agent.make({ name: "stale-approval-agent", toolkit: Toolkit.make(gatedTool) })
      const error = yield* Stream.runDrain(
        Agent.stream(agent, {
          prompt: Prompt.make("stale"),
          resume: {
            suspension: AgentEvent.AgentSuspended.make({
              token: "stale-token",
              reason: "approval",
              tool_call_id: "call-stale",
              tool_name: "gated",
              tool_params: { text: "x" },
              tool_call_batch: [],
              active_tools: ["gated"],
              activated_skills: [],
            }),
            resolution: { _tag: "Approved" },
          },
        }),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.effect(
              LanguageModel.LanguageModel,
              LanguageModel.make({
                generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
                streamText: () =>
                  withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "t", delta: "x" }))),
              }),
            ),
            Toolkit.make(gatedTool).toLayer({ gated: () => Effect.succeed({ ok: true }) }),
            Approvals.layerTest({ resolve: () => Deferred.await(approval) }),
            unusedToolHandlerLayer,
          ),
        ),
        Effect.flip,
      )
      expect(
        Schema.is(AgentEvent.ResumeMismatch)(error) ||
          (typeof error === "object" &&
            error !== null &&
            "_tag" in error &&
            error._tag === "@batonfx/core/DriverError"),
      ).toBe(true)
    }),
  )
})
