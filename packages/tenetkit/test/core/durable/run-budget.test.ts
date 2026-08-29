import { describe, expect, it as standalone, layer } from "@effect/vitest"
import { DateTime, Deferred, Effect, Layer, Option, Schedule, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AiError, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import type { DriverCheckpoint } from "../../../src/core/durable/driver/contract.js"
import {
  Agent,
  AgentEvent,
  AgentTool,
  Approvals,
  Compaction,
  DurableDriver,
  ModelMiddleware,
  ModelResilience,
  RunBudget,
  Session,
  ToolExecutor,
} from "../../../src/core/index"
import { withProviderFinish } from "../provider-finish.js"
import { unusedToolHandlerLayer } from "../tool-handler-layer.js"
import { suspension } from "../../runtime/execution/fixtures.js"

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
  const completedCheckpoints = new Array<DriverCheckpoint>()
  const checkpointWrites = new Array<DriverCheckpoint>()
  let lastCheckpoint: DriverCheckpoint | undefined
  const journal: DurableDriver.DriverJournal = {
    onScheduled: (operation) =>
      Effect.sync(() => {
        scheduled.push({ kind: operation.kind, key: operation.key })
      }).pipe(Effect.as(undefined)),
    onCompleted: (_operation, _outcome, checkpoint) =>
      Effect.sync(() => {
        completedCheckpoints.push(checkpoint)
        lastCheckpoint = checkpoint
      }),
    onCheckpoint: (checkpoint) =>
      Effect.sync(() => {
        checkpointWrites.push(checkpoint)
        lastCheckpoint = checkpoint
      }),
  }
  return {
    scheduled,
    completedCheckpoints,
    checkpointWrites,
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
  {
    const capture = journalCapture()
    const agent = Agent.make({
      name: "retry-charge-agent",
      toolkit: Toolkit.make(echoTool),
      budget: { modelCalls: 2, toolCalls: 1 },
    })
    layer(baseLayers(capture.journalLayer))("charges each model attempt in a tool retry turn", (it) => {
      it.effect("charges each model attempt", () =>
        Effect.gen(function* () {
          yield* Agent.stream(agent, { prompt: "retry", logicalOperationId: "retry-run" }).pipe(Stream.runDrain)
          expect(capture.scheduled.filter((operation) => operation.kind === "model").length).toBe(2)
          expect(capture.lastCheckpoint?.budget.remaining.modelCalls).toBe(0)
        }),
      )
    })
  }

  {
    const agent = Agent.make({
      name: "model-exhaust-agent",
      toolkit: Toolkit.empty,
      budget: { modelCalls: 0 },
    })
    layer(
      Layer.mergeAll(
        Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "t", delta: "x" }))),
          }),
        ),
        unusedToolHandlerLayer,
      ),
    )("fails typed at schedule boundary when model calls are exhausted", (it) => {
      it.effect("fails when model calls are exhausted", () =>
        Effect.gen(function* () {
          const error = yield* Stream.runDrain(Agent.stream(agent, { prompt: "hi" })).pipe(Effect.flip)
          expect(error._tag).toBe("tenetkit/core/RunBudgetExhausted")
          if (error._tag === "tenetkit/core/RunBudgetExhausted") {
            expect(error.dimension).toBe("modelCalls")
            expect(error.remaining).toBe(0)
          }
        }),
      )
    })
  }

  {
    const capture = journalCapture()
    const agent = Agent.make({
      name: "tool-exhaust-agent",
      toolkit: Toolkit.make(echoTool),
      budget: { modelCalls: 2, toolCalls: 0 },
    })
    layer(baseLayers(capture.journalLayer))("fails typed when tool calls are exhausted before execution", (it) => {
      it.effect("fails when tool calls are exhausted", () =>
        Effect.gen(function* () {
          const error = yield* Stream.runDrain(Agent.stream(agent, { prompt: "tool" })).pipe(Effect.flip)
          expect(error._tag).toBe("tenetkit/core/RunBudgetExhausted")
          if (error._tag === "tenetkit/core/RunBudgetExhausted") {
            expect(error.dimension).toBe("toolCalls")
          }
        }),
      )
    })
  }

  {
    const capture = journalCapture()
    const agent = Agent.make({
      name: "token-charge-agent",
      toolkit: Toolkit.empty,
      budget: { modelCalls: 1, totalTokens: 20 },
    })
    layer(
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
    )("charges reported token usage after model finish", (it) => {
      it.effect("charges reported token usage", () =>
        Effect.gen(function* () {
          yield* Agent.stream(agent, { prompt: "tokens" }).pipe(Stream.runDrain)
          expect(capture.lastCheckpoint?.budget.remaining.totalTokens).toBe(5)
          expect(capture.completedCheckpoints.at(-1)?.budget.remaining.totalTokens).toBe(5)
          expect(capture.checkpointWrites).toEqual([])
        }),
      )
    })
  }

  {
    const capture = journalCapture()
    const malformed = AiError.make({
      module: "RunBudgetTestLanguageModel",
      method: "streamText",
      reason: AiError.InvalidOutputError.make({
        description: "retry with reported usage",
        usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
      }),
    })
    let calls = 0
    const agent = Agent.make({
      name: "retry-token-charge-agent",
      toolkit: Toolkit.empty,
      budget: { modelCalls: 1, totalTokens: 100 },
    })
    layer(
      Layer.mergeAll(
        Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => {
              calls += 1
              return calls === 1
                ? Stream.fail(malformed)
                : withProviderFinish(
                    Stream.make(
                      Response.makePart("text-delta", { id: "text", delta: "recovered" }),
                      finishWithUsage(11, 5),
                    ),
                  )
            },
          }),
        ),
        ModelResilience.layer({ retrySchedule: Schedule.recurs(1), classify: () => "transient" }).pipe(Layer.orDie),
        capture.journalLayer,
        unusedToolHandlerLayer,
      ),
    )("charges reported failed-attempt and terminal usage in one model commit", (it) => {
      it.effect("charges every reported attempt exactly once", () =>
        Effect.gen(function* () {
          yield* Agent.stream(agent, { prompt: "retry tokens" }).pipe(Stream.runDrain)
          expect(calls).toBe(2)
          expect(capture.completedCheckpoints.at(-1)?.budget.remaining.totalTokens).toBe(74)
          expect(capture.checkpointWrites).toEqual([])
        }),
      )
    })
  }

  {
    const capture = journalCapture()
    let toolExecutions = 0
    const agent = Agent.make({
      name: "token-overrun-agent",
      toolkit: Toolkit.make(echoTool),
      budget: { modelCalls: 1, toolCalls: 1, totalTokens: 5 },
    })
    layer(
      Layer.mergeAll(
        Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () =>
              withProviderFinish(
                Stream.make(
                  Response.makePart("tool-call", {
                    id: "over-budget-tool",
                    name: "echo",
                    params: { text: "must not execute" },
                    providerExecuted: false,
                  }),
                  finishWithUsage(6, 4),
                ),
              ),
          }),
        ),
        ToolExecutor.layerTest({
          execute: () =>
            Effect.sync(() => {
              toolExecutions += 1
              return { _tag: "Success" as const, result: "unexpected", encodedResult: "unexpected" }
            }),
        }),
        Approvals.layerAutoApprove,
        capture.journalLayer,
        unusedToolHandlerLayer,
      ),
    )("commits a paid response before stopping typed on token overrun", (it) => {
      it.effect("stops before tool execution", () =>
        Effect.gen(function* () {
          const observed = new Array<AgentEvent.Event>()
          const failure = yield* Agent.stream(agent, {
            prompt: "overrun",
            sessionId: "token-overrun-session",
          }).pipe(
            Stream.runForEach((event) => Effect.sync(() => void observed.push(event))),
            Effect.flip,
          )
          expect(failure._tag).toBe("tenetkit/core/RunBudgetExhausted")
          expect(toolExecutions).toBe(0)
          expect(observed.some((event) => event._tag === "ModelResponseCommitted")).toBe(true)
          expect(capture.completedCheckpoints.at(-1)?.budget.remaining.totalTokens).toBe(0)
          expect(capture.completedCheckpoints.at(-1)?.state).toHaveProperty("postCommitFailure")
          expect(capture.checkpointWrites).toEqual([])
        }),
      )
    })
  }

  {
    const agent = Agent.make({
      name: "deadline-agent",
      toolkit: Toolkit.empty,
      budget: { modelCalls: 5, deadline: "2026-06-01T00:00:01.000Z" },
    })
    layer(
      Layer.mergeAll(
        Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "t", delta: "x" }))),
          }),
        ),
        unusedToolHandlerLayer,
      ),
    )("fails typed when deadline expires at schedule boundary", (it) => {
      it.effect("fails when the deadline expires", () =>
        Effect.gen(function* () {
          yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe("2026-06-01T00:00:00.000Z")))
          yield* TestClock.adjust("2 seconds")
          const error = yield* Stream.runDrain(Agent.stream(agent, { prompt: "late" })).pipe(Effect.flip)
          expect(error._tag).toBe("tenetkit/core/RunBudgetExhausted")
          if (error._tag === "tenetkit/core/RunBudgetExhausted") {
            expect(error.dimension).toBe("deadline")
          }
        }),
      )
    })
  }

  {
    const capture = journalCapture()
    const agent = Agent.make({
      name: "narrow-agent",
      toolkit: Toolkit.empty,
      budget: { modelCalls: 5 },
    })
    layer(
      Layer.mergeAll(
        Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "t", delta: "x" }))),
          }),
        ),
        capture.journalLayer,
        unusedToolHandlerLayer,
      ),
    )("narrows per-run budget below agent default", (it) => {
      it.effect("narrows the per-run budget", () =>
        Effect.gen(function* () {
          yield* Agent.stream(agent, { prompt: "narrow", budget: { modelCalls: 1 } }).pipe(Stream.runDrain)
          expect(capture.lastCheckpoint?.budget.allocation.modelCalls).toBe(1)
          expect(capture.lastCheckpoint?.budget.remaining.modelCalls).toBe(0)
        }),
      )
    })
  }

  {
    const capture = journalCapture()
    const child = Agent.make({ name: "child-agent", toolkit: Toolkit.empty, budget: { modelCalls: 1 } })
    const parentTool = AgentTool.asTool(child, { name: "invoke_child", success: Schema.String })
    const parent = Agent.make({
      name: "parent-agent",
      toolkit: Toolkit.make(parentTool.tool, echoTool),
      budget: { modelCalls: 3, childRuns: 1, depth: 1 },
    })
    let modelCalls = 0
    const budgetModelLayer = Layer.effect(
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
            return withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "child", delta: "sub" })))
          }
          return withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "parent", delta: "done" })))
        },
      }),
    )
    layer(
      Layer.mergeAll(
        budgetModelLayer,
        Layer.effectContext(
          Effect.gen(function* () {
            const context = yield* Effect.context<LanguageModel.LanguageModel>()
            return yield* Toolkit.make(parentTool.tool).toHandlers({
              invoke_child: (params) => parentTool.invoke(params).pipe(Effect.provideContext(context)),
            })
          }),
        ).pipe(Layer.provide(budgetModelLayer)),
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
        }),
        Approvals.layerAutoApprove,
        capture.journalLayer,
        unusedToolHandlerLayer,
      ),
    )("reserves and refunds child agent-tool budget without widening", (it) => {
      it.effect("reserves and refunds child agent-tool budget without widening", () =>
        Effect.gen(function* () {
          yield* Agent.stream(parent, { prompt: "child", logicalOperationId: "parent-child" }).pipe(Stream.runDrain)
          expect(modelCalls).toBeGreaterThanOrEqual(2)
          expect(capture.lastCheckpoint?.budget.remaining.modelCalls).toBeGreaterThanOrEqual(0)
        }),
      )
    })
  }

  standalone.effect("rejects child grant wider than parent remaining", () =>
    Effect.gen(function* () {
      const parent = RunBudget.allocate({ modelCalls: 1, childRuns: 1, depth: 1 })
      const error = yield* RunBudget.reserveChild(parent, { modelCalls: 5 }).pipe(Effect.flip)
      expect(error._tag).toBe("tenetkit/core/RunBudgetGrantWidened")
    }),
  )

  {
    let calls = 0
    let handled = false
    const agent = Agent.make({ name: "auto-approve-agent", toolkit: Toolkit.make(gatedTool) })
    layer(
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
    )("auto-approves gated tools only with explicit layerAutoApprove", (it) => {
      it.effect("auto-approves gated tools", () =>
        Effect.gen(function* () {
          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "gated" }))
          expect(handled).toBe(true)
          expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
          expect(events.at(-1)?._tag).toBe("Completed")
        }),
      )
    })
  }

  {
    const capture = journalCapture()
    const agent = Agent.make({
      name: "session-budget-agent",
      toolkit: Toolkit.make(echoTool),
    })
    layer(
      Layer.mergeAll(
        makeToolCallModelLayer(),
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "ok", encodedResult: "ok" }),
        }),
        Approvals.layerAutoApprove,
        Session.layerMemory,
        Compaction.layerTest({ maybeCompact: () => Effect.succeed(Option.none()) }),
        ModelMiddleware.layerIdentity,
        capture.journalLayer,
        unusedToolHandlerLayer,
      ),
    )("records session sync operation keys", (it) => {
      it.effect("records session sync operation keys", () =>
        Effect.gen(function* () {
          yield* Agent.stream(agent, {
            prompt: "sync",
            logicalOperationId: "logical-sync",
            sessionId: "session-sync",
          }).pipe(Stream.runDrain)
          expect(
            capture.scheduled.some((operation) => operation.kind === "memory" && operation.key.includes("sync")),
          ).toBe(true)
        }),
      )
    })
  }

  {
    const capture = journalCapture()
    const agent = Agent.make({
      name: "event-order-agent",
      toolkit: Toolkit.make(echoTool),
      budget: { modelCalls: 3, toolCalls: 1 },
    })
    layer(baseLayers(capture.journalLayer))("preserves AgentEvent ordering when budget limits apply", (it) => {
      it.effect("preserves AgentEvent ordering", () =>
        Effect.gen(function* () {
          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "order" }))
          const tags = events.map((event) => event._tag)
          const started = tags.indexOf("ToolExecutionStarted")
          const completed = tags.indexOf("ToolExecutionCompleted")
          expect(started).toBeGreaterThanOrEqual(0)
          expect(completed).toBeGreaterThan(started)
          expect(tags.at(-1)).toBe("Completed")
        }),
      )
    })
  }

  {
    const approval = Deferred.makeUnsafe<Approvals.Resolution>()
    const agent = Agent.make({ name: "stale-approval-agent", toolkit: Toolkit.make(gatedTool) })
    layer(
      Layer.mergeAll(
        Layer.effect(
          LanguageModel.LanguageModel,
          LanguageModel.make({
            generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
            streamText: () => withProviderFinish(Stream.make(Response.makePart("text-delta", { id: "t", delta: "x" }))),
          }),
        ),
        Toolkit.make(gatedTool).toLayer({ gated: () => Effect.succeed({ ok: true }) }),
        Approvals.layerTest({ resolve: () => Deferred.await(approval) }),
        unusedToolHandlerLayer,
      ),
    )("rejects resume when driver suspension token does not match", (it) => {
      it.effect("rejects a stale suspension token", () =>
        Effect.gen(function* () {
          const error = yield* Stream.runDrain(
            Agent.stream(agent, {
              prompt: Prompt.make("stale"),
              resume: {
                suspension: suspension({
                  waitId: "call-stale",
                  reason: "approval",
                  token: "stale-token",
                  toolCallId: "call-stale",
                  toolName: "gated",
                  toolParams: { text: "x" },
                }),
                resolutions: [{ waitId: "call-stale", resolution: { _tag: "Approved" } }],
              },
            }),
          ).pipe(Effect.flip)
          expect(
            Schema.is(AgentEvent.ResumeMismatch)(error) ||
              Schema.is(Schema.TaggedStruct("tenetkit/core/DriverError", {}))(error),
          ).toBe(true)
        }),
      )
    })
  }
})

standalone.effect("charging an unbounded dimension leaves it absent so the checkpoint still decodes", () =>
  Effect.gen(function* () {
    const unbounded = RunBudget.make({})

    const charged = yield* RunBudget.charge(unbounded, { modelCalls: 4, toolCalls: 9, totalTokens: 11_000_000 })

    // An unbounded dimension must stay absent. Writing an explicit undefined would satisfy the
    // in-memory type while failing the next `optionalKey` decode, terminating the run with
    // "Expected number, got undefined" instead of leaving it uncharged.
    expect(Object.keys(charged.remaining)).toEqual([])
    expect(yield* RunBudget.decode(yield* RunBudget.encode(charged))).toEqual(charged)
  }),
)

standalone.effect("charging a bounded dimension still exhausts it exactly", () =>
  Effect.gen(function* () {
    const bounded = RunBudget.make({ totalTokens: 100 })
    const exhausted = yield* Effect.exit(RunBudget.charge(bounded, { totalTokens: 250 }))
    expect(exhausted._tag).toBe("Failure")

    const partial = yield* RunBudget.charge(RunBudget.make({ totalTokens: 100 }), { totalTokens: 40 })
    expect(partial.remaining.totalTokens).toBe(60)
  }),
)
