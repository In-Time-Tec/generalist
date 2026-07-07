import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, AgentEvent, AgentTool, Approvals, ModelMiddleware, ToolContext, ToolExecutor } from "../src/index"

type ModelParams = Parameters<typeof Ai.LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    Ai.LanguageModel.LanguageModel,
    Ai.LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const textDelta = (delta: string) => Ai.Response.makePart("text-delta", { id: "text", delta })

const toolCallPart = (id: string, name: string, params: unknown) =>
  Ai.Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const activeToolNames = (options: Parameters<ModelParams["streamText"]>[0]) => options.tools.map((tool) => tool.name)

const parentToolkit = (toolkit: Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>) =>
  Ai.Toolkit.make(...Object.values(toolkit.tools)) as Ai.Toolkit.Toolkit<Record<string, Ai.Tool.Any>>

const request = (name: string, params: unknown): ToolExecutor.Request => ({
  call: toolCallPart(`call-${name}`, name, params),
  turn: 0,
  agentName: "tool-executor-test",
  sessionId: "session-1",
})

const gatedTool = Ai.Tool.make("gated", {
  description: "Needs child approval",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

describe("AgentTool", () => {
  it.effect("ToolExecutor.fromToolkit maps returned handler failures to failed outcomes", () => {
    const failingTool = Ai.Tool.make("failing", {
      parameters: Schema.Struct({}),
      success: Schema.String,
      failure: Schema.String,
      failureMode: "return",
    })
    const toolkit = Ai.Toolkit.make(failingTool)
    return Effect.gen(function* () {
      const handled = yield* toolkit.pipe(
        Effect.provide(toolkit.toLayer({ failing: () => Effect.fail("child failed") })),
      )
      const outcome = yield* ToolExecutor.ToolExecutor.use((executor) => executor.execute(request("failing", {}))).pipe(
        Effect.provide(Layer.mergeAll(ToolExecutor.fromToolkit(handled), ToolContext.layerDefault)),
      )

      expect(outcome).toEqual({ _tag: "Failure", message: "child failed" })
    })
  })

  it.effect("ToolExecutor.fromToolkit preserves handler interruptions", () => {
    const interruptingTool = Ai.Tool.make("interrupting", {
      parameters: Schema.Struct({}),
      success: Schema.String,
    })
    const toolkit = Ai.Toolkit.make(interruptingTool)
    return Effect.gen(function* () {
      const handled = yield* toolkit.pipe(Effect.provide(toolkit.toLayer({ interrupting: () => Effect.interrupt })))
      const exit = yield* ToolExecutor.ToolExecutor.use((executor) =>
        executor.execute(request("interrupting", {})),
      ).pipe(Effect.provide(Layer.mergeAll(ToolExecutor.fromToolkit(handled), ToolContext.layerDefault)), Effect.exit)

      expect(Exit.hasInterrupts(exit)).toBe(true)
    })
  })

  it.effect("exposes a child agent as a parent tool", () => {
    let parentCalls = 0
    return Effect.gen(function* () {
      const child = Agent.make({ name: "child" })
      const childTool = AgentTool.asTool(child, { name: "ask_child" })
      const parent = Agent.make({ name: "parent", toolkit: parentToolkit(childTool) })

      const events = yield* Stream.runCollect(Agent.stream(parent, { prompt: "parent task" }))

      const toolCompleted = events.find((event) => event._tag === "ToolExecutionCompleted")
      expect(toolCompleted?._tag === "ToolExecutionCompleted" && toolCompleted.result.result).toBe("child answer")
      const completed = events.at(-1)
      expect(completed?._tag === "Completed" && completed.text).toBe("parent saw child answer")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            const content = JSON.stringify(options.prompt.content)
            if (activeToolNames(options).length === 0 && content.includes("child task")) {
              return Stream.make(textDelta("child answer"))
            }
            parentCalls += 1
            return parentCalls === 1
              ? Stream.make(toolCallPart("call-child", "ask_child", { prompt: "child task" }))
              : Stream.make(textDelta("parent saw child answer"))
          }),
          ToolExecutor.fromToolkit(AgentTool.asTool(Agent.make({ name: "child" }), { name: "ask_child" })),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("propagates child suspension so the parent run suspends", () => {
    let parentCalls = 0
    return Effect.gen(function* () {
      const child = Agent.make({ name: "reviewer", toolkit: Ai.Toolkit.make(gatedTool) })
      const childTool = AgentTool.asTool(child, { name: "ask_reviewer" })
      const parent = Agent.make({ name: "parent", toolkit: parentToolkit(childTool) })

      const exit = yield* Stream.runCollect(Agent.stream(parent, { prompt: "parent task" })).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = exit._tag === "Failure" ? Cause.squash(exit.cause) : undefined
      expect(error).toBeInstanceOf(AgentEvent.AgentSuspended)
      if (error instanceof AgentEvent.AgentSuspended) {
        expect(error.token).toBe("approval-1")
        expect(error.reason).toBe("tool-wait")
        expect(error.tool_name).toBe("ask_reviewer")
        expect(error.tool_call_id).toBe("call-reviewer")
        expect(parentCalls).toBe(1)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            const content = JSON.stringify(options.prompt.content)
            if (activeToolNames(options).includes("gated") && content.includes("child approval task")) {
              return Stream.make(toolCallPart("call-gated", "gated", { text: "hold" }))
            }
            parentCalls += 1
            return parentCalls === 1
              ? Stream.make(toolCallPart("call-reviewer", "ask_reviewer", { prompt: "child approval task" }))
              : Stream.make(textDelta("parent should never see this"))
          }),
          ToolExecutor.fromToolkit(
            AgentTool.asTool(Agent.make({ name: "reviewer", toolkit: Ai.Toolkit.make(gatedTool) }), {
              name: "ask_reviewer",
            }),
          ),
          Approvals.testLayer({ check: () => Effect.succeed({ _tag: "Pending", token: "approval-1" }) }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("honors parameter and result mapping overrides", () => {
    let parentCalls = 0
    return Effect.gen(function* () {
      const child = Agent.make({ name: "custom-child" })
      const childTool = AgentTool.asTool(child, {
        name: "ask_custom",
        parameters: Schema.Struct({ question: Schema.String }),
        success: Schema.Struct({ answer: Schema.String }),
        toPrompt: (params) => params.question,
        fromResult: (result) => ({ answer: result.text }),
      })
      const parent = Agent.make({ name: "parent", toolkit: parentToolkit(childTool) })

      const events = yield* Stream.runCollect(Agent.stream(parent, { prompt: "parent task" }))

      const toolCompleted = events.find((event) => event._tag === "ToolExecutionCompleted")
      expect(toolCompleted?._tag === "ToolExecutionCompleted" && toolCompleted.result.result).toEqual({
        answer: "custom answer",
      })
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            const content = JSON.stringify(options.prompt.content)
            if (content.includes("custom prompt")) return Stream.make(textDelta("custom answer"))
            parentCalls += 1
            return parentCalls === 1
              ? Stream.make(toolCallPart("call-custom", "ask_custom", { question: "custom prompt" }))
              : Stream.make(textDelta("parent done"))
          }),
          ToolExecutor.fromToolkit(
            AgentTool.asTool(Agent.make({ name: "custom-child" }), {
              name: "ask_custom",
              parameters: Schema.Struct({ question: Schema.String }),
              success: Schema.Struct({ answer: Schema.String }),
              toPrompt: (params) => params.question,
              fromResult: (result) => ({ answer: result.text }),
            }),
          ),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })
})
