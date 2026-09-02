import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentTool,
  Approvals,
  Compaction,
  DurableDriver,
  Hooks,
  ModelMiddleware,
  Permissions,
  RunBudget,
  ToolExecutor,
} from "../../src/index.js"
import { evaluate } from "../../src/core/agent/lifecycle/hooks.js"
import { Json } from "../core/json.js"
import { ItLayer } from "../core/it-layer.js"
import { unusedToolHandlerLayer } from "../core/tool-handler-layer.js"
import { withProviderFinish } from "../core/provider-finish.js"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const textDelta = (text: string) => Response.makePart("text-delta", { id: "text", delta: text })
const toolCall = (id: string, name: string, params: typeof Schema.Unknown.Type) =>
  Response.toolCallPart({ id, name, params, providerExecuted: false })

const echo = Tool.make("echo", {
  description: "Echo hook test input",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const authorization = Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove)

layer(unusedToolHandlerLayer)("Hooks", (it) => {
  ItLayer.make(it, "runs prompt hooks through ModelMiddleware and replaces the terminal output", () => {
    const order: Array<string> = []
    let modelPrompt = ""
    const middleware = ModelMiddleware.layer([
      {
        transformPrompt: (prompt) =>
          Effect.sync(() => {
            order.push("middleware")
            return Prompt.concat(prompt, Prompt.make("middleware-context"))
          }),
      },
    ])
    const hooks = Hooks.layer([
      Hooks.onRunStart(() =>
        Effect.sync(() => {
          order.push("run-start")
          return Hooks.AddContext("run-context")
        }),
      ),
      Hooks.onTurnStart(() =>
        Effect.sync(() => {
          order.push("turn-start")
          return Hooks.AddContext("turn-context")
        }),
      ),
      Hooks.onModelCall(({ prompt }) =>
        Effect.sync(() => {
          order.push("model-call")
          expect(Json.stringify(prompt.content)).toContain("middleware-context")
          return Hooks.AddContext("model-context")
        }),
      ),
      Hooks.onRunEnd(({ output }) =>
        Effect.sync(() => {
          order.push(`run-end:${String(output)}`)
          return Hooks.Replace("hooked output")
        }),
      ),
    ])
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          modelPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("model output"))
        }),
        middleware,
        hooks,
      ),
      Effect.gen(function* () {
        const output = yield* Agent.run(Agent.make({ name: "prompt-hooks" }), "input")

        expect(output).toBe("hooked output")
        expect(modelPrompt).toContain("run-context")
        expect(modelPrompt).toContain("turn-context")
        expect(modelPrompt).toContain("middleware-context")
        expect(modelPrompt).toContain("model-context")
        expect(order).toEqual(["run-start", "turn-start", "middleware", "model-call", "run-end:model output"])
      }),
    ] as const
  })

  ItLayer.make(it, "short-circuits a blocked tool call and exposes its failure to the model", () => {
    let modelCalls = 0
    let executorCalls = 0
    let skippedHookCalls = 0
    let resultHookCalls = 0
    let followUpPrompt = ""
    const hooks = Hooks.layer([
      Hooks.onToolCall(() => Effect.succeed(Hooks.Block({ reason: "destructive" }))),
      Hooks.onToolCall(() =>
        Effect.sync(() => {
          skippedHookCalls += 1
          return Hooks.Continue()
        }),
      ),
      Hooks.onToolResult(() =>
        Effect.sync(() => {
          resultHookCalls += 1
          return Hooks.Continue()
        }),
      ),
    ])
    return [
      Layer.mergeAll(
        authorization,
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) return Stream.make(toolCall("blocked-call", "echo", { text: "remove" }))
          followUpPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("saw blocked tool"))
        }),
        ToolExecutor.layerTest({
          execute: () =>
            Effect.sync(() => {
              executorCalls += 1
              return { _tag: "Success" as const, result: "unexpected", encodedResult: "unexpected" }
            }),
        }),
        ModelMiddleware.layerIdentity,
        hooks,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "blocked-tool", toolkit: Toolkit.make(echo) })

        expect(yield* Agent.run(agent, "use echo")).toBe("saw blocked tool")
        expect(executorCalls).toBe(0)
        expect(skippedHookCalls).toBe(0)
        expect(resultHookCalls).toBe(1)
        expect(followUpPrompt).toContain("hook-blocked")
        expect(followUpPrompt).toContain("destructive")
      }),
    ] as const
  })

  ItLayer.make(it, "orders tool hooks and replaces both arguments and results", () => {
    const order: Array<string> = []
    let executedArgs: unknown
    let followUpPrompt = ""
    let modelCalls = 0
    const hooks = Hooks.layer([
      Hooks.onToolCall(() =>
        Effect.sync(() => {
          order.push("replace-args")
          return Hooks.Replace({ text: "hooked args" })
        }),
      ),
      Hooks.onToolCall(({ args }) =>
        Effect.sync(() => {
          order.push(`observe:${Json.stringify(args)}`)
          return Hooks.Continue()
        }),
      ),
      Hooks.onToolResult(() =>
        Effect.sync(() => {
          order.push("replace-result")
          return Hooks.Replace({ value: "hooked result" })
        }),
      ),
    ])
    return [
      Layer.mergeAll(
        authorization,
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) return Stream.make(toolCall("replace-call", "echo", { text: "original" }))
          followUpPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("done"))
        }),
        ToolExecutor.layerTest({
          execute: (request) =>
            Effect.sync(() => {
              executedArgs = request.call.params
              return { _tag: "Success" as const, result: "executor result", encodedResult: "executor result" }
            }),
        }),
        ModelMiddleware.layerIdentity,
        hooks,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "replace-tool", toolkit: Toolkit.make(echo) })
        yield* Agent.run(agent, "use echo")

        expect(executedArgs).toEqual({ text: "hooked args" })
        expect(followUpPrompt).toContain("hooked result")
        expect(order).toEqual(["replace-args", 'observe:{"text":"hooked args"}', "replace-result"])
      }),
    ] as const
  })

  ItLayer.make(it, "defers Ask to Approvals and runs ApprovalRequest before suspension", () => {
    const order: Array<string> = []
    let pendingArgs: unknown
    const hooks = Hooks.layer([
      Hooks.onToolCall(() =>
        Effect.sync(() => {
          order.push("replace")
          return Hooks.Replace({ text: "approval args" })
        }),
      ),
      Hooks.onToolCall(({ args }) =>
        Effect.sync(() => {
          order.push(`ask:${Json.stringify(args)}`)
          return Hooks.Ask()
        }),
      ),
      Hooks.onApprovalRequest(({ request }) =>
        Effect.sync(() => {
          order.push(`approval:${request.approvalId}`)
          return Hooks.Continue()
        }),
      ),
    ])
    return [
      Layer.mergeAll(
        Permissions.layerAllowAll,
        Approvals.layerTest({
          resolve: (pending) =>
            Effect.sync(() => {
              pendingArgs = pending.call.params
              return pending
            }),
        }),
        modelLayer(() => Stream.make(toolCall("ask-call", "echo", { text: "original" }))),
        ToolExecutor.layerTest({ execute: () => Effect.die("pending tool must not execute") }),
        ModelMiddleware.layerIdentity,
        hooks,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "ask-tool", toolkit: Toolkit.make(echo) })
        const failure = yield* Agent.stream(agent, "ask first").pipe(Stream.runCollect, Effect.flip)
        expect(failure._tag).toBe("generalist/core/AgentSuspended")
        expect(pendingArgs).toEqual({ text: "approval args" })
        expect(order).toEqual(["replace", 'ask:{"text":"approval args"}', "approval:approval:ask-call"])
      }),
    ] as const
  })

  ItLayer.make(it, "adds context at compaction and steering boundaries", () => {
    let compactionPrompt = ""
    let secondModelPrompt = ""
    let modelCalls = 0
    const hooks = Hooks.layer([
      Hooks.onCompaction(() => Effect.succeed(Hooks.AddContext("pinned compaction context"))),
      Hooks.onSteer(({ queue, count }) =>
        Effect.succeed(Hooks.AddContext(`${queue}:${count}:hooked steering context`)),
      ),
    ])
    return [
      Layer.mergeAll(
        authorization,
        modelLayer((options) => {
          modelCalls += 1
          if (modelCalls === 1) return Stream.make(toolCall("steer-call", "echo", { text: "first" }))
          secondModelPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("done"))
        }),
        Compaction.layerTest({
          maybeCompact: (request) =>
            Effect.sync(() => {
              compactionPrompt = Json.stringify(request.prompt.content)
              return Option.none()
            }),
        }),
        ToolExecutor.layerTest({
          execute: () => Effect.succeed({ _tag: "Success", result: "echoed", encodedResult: "echoed" }),
        }),
        ModelMiddleware.layerIdentity,
        hooks,
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "compaction-steer", toolkit: Toolkit.make(echo) })
        const run = yield* Agent.allocateRun(agent, {
          prompt: "compact and steer",
          compaction: { contextWindow: 1 },
        })
        yield* run.steer({ prompt: "new direction" })
        yield* Stream.runDrain(run.events)

        expect(compactionPrompt).toContain("pinned compaction context")
        expect(secondModelPrompt).toContain("new direction")
        expect(secondModelPrompt).toContain("steering:1:hooked steering context")
      }).pipe(Effect.scoped),
    ] as const
  })

  ItLayer.make(it, "uses the same child hooks for a process-local AgentTool", () => {
    const childEvents: Array<string> = []
    let parentCalls = 0
    let parentFollowUp = ""
    const model = modelLayer((options) => {
      const prompt = Json.stringify(options.prompt.content)
      if (options.tools.length === 0 && prompt.includes("child task")) {
        return Stream.make(textDelta("child answer"))
      }
      parentCalls += 1
      if (parentCalls === 1) return Stream.make(toolCall("child-call", "ask_child", { prompt: "child task" }))
      parentFollowUp = prompt
      return Stream.make(textDelta("parent done"))
    })
    const child = Agent.make({ name: "child" })
    const childToolkit = AgentTool.asTool(child, { name: "ask_child" })
    const hooks = Hooks.layer([
      Hooks.onChildStart(({ child: started }) =>
        Effect.sync(() => {
          childEvents.push(`start:${started.selection}`)
          return Hooks.Continue()
        }),
      ),
      Hooks.onChildEnd(({ child: ended, result }) =>
        Effect.sync(() => {
          childEvents.push(`end:${ended.selection}:${String(result)}`)
          return Hooks.Replace("hooked child answer")
        }),
      ),
    ])
    return [
      Layer.mergeAll(
        authorization,
        model,
        ToolExecutor.layerToolkit(childToolkit).pipe(Layer.provide(model)),
        ModelMiddleware.layerIdentity,
        hooks,
      ),
      Effect.gen(function* () {
        const parent = Agent.make({ name: "parent", toolkit: Toolkit.make(childToolkit.tools.ask_child!) })
        expect(yield* Agent.run(parent, "parent task")).toBe("parent done")

        expect(childEvents).toEqual(["start:child", "end:child:child answer"])
        expect(parentFollowUp).toContain("hooked child answer")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "fails the run with HookFailed and an actionable hint",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("unused"))),
          ModelMiddleware.layerIdentity,
          Hooks.layer([Hooks.onRunStart(() => Effect.fail("hook boom"))]),
        ),
        Effect.gen(function* () {
          const failure = yield* Agent.run(Agent.make({ name: "failed-hook" }), "input").pipe(Effect.flip)

          expect(failure._tag).toBe("generalist/core/HookFailed")
          if (failure._tag === "generalist/core/HookFailed") {
            expect(failure.event).toBe("RunStart")
            expect(failure.hint).toContain("Inspect the named lifecycle hook")
          }
        }),
      ] as const,
  )

  it.effect("replays a journaled Block without invoking the hook again", () =>
    Effect.gen(function* () {
      const logicalOperationId = "hook-replay"
      const driver = DurableDriver.makeLoopDriver({ logicalOperationId, sessionId: logicalOperationId })
      const initial = yield* driver.initial({ prompt: Prompt.make("input"), budget: RunBudget.make({}) })
      const first = yield* DurableDriver.makeInline({ driver, initial })
      let hookCalls = 0
      const declarations = [
        Hooks.onToolCall(() =>
          Effect.sync(() => {
            hookCalls += 1
            return Hooks.Block({ reason: "recorded veto" })
          }),
        ),
      ]
      const input = {
        runId: logicalOperationId,
        agentName: "replay-agent",
        turn: 0,
        tool: "echo",
        args: { text: "input" },
        call: toolCall("replay-call", "echo", { text: "input" }),
      }
      const run = (interpreter: DurableDriver.DriverInterpreter["Service"]) =>
        evaluate({
          key: "hook:tool:0:replay-call:call",
          event: "ToolCall",
          input,
          applyDecision: (current) => current,
        }).pipe(
          Effect.provideService(DurableDriver.DriverInterpreter, interpreter),
          Effect.provideService(Hooks.Hooks, Hooks.Hooks.of({ declarations })),
        )

      expect((yield* run(first)).blocked).toBe("recorded veto")
      const checkpoint = yield* first.checkpoint
      const recovered = yield* DurableDriver.makeInline({ driver, initial: checkpoint })
      expect((yield* run(recovered)).blocked).toBe("recorded veto")

      expect(hookCalls).toBe(1)
      expect(checkpoint.state).toMatchObject({
        hooks: [
          {
            event: "ToolCall",
            complete: true,
            decisions: [{ _tag: "Block", reason: "recorded veto" }],
          },
        ],
      })
    }),
  )
})
