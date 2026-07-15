import { expect, layer } from "@effect/vitest"
import { Json } from "./json"
import { Effect, Layer, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, Handoff, ModelMiddleware, ToolExecutor } from "../src/index"
import { unusedToolHandlerLayer } from "./tool-handler-layer"
import { ItLayer } from "./it-layer"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const promptText = (prompt: Prompt.Prompt): string => Json.stringify(prompt.content)

const activeToolNames = (options: Parameters<ModelParams["streamText"]>[0]) => options.tools.map((tool) => tool.name)

layer(unusedToolHandlerLayer)("Handoff", (it) => {
  it("names transfer tools by specialist", () => {
    const specialist = Agent.make({ name: "math" })
    const transfer = Handoff.transferTool(specialist)

    expect(Object.keys(transfer.tools)).toEqual(["transfer_to_math"])
  })

  ItLayer.make(it, "builds a supervisor that routes through transfer tools", () => {
    let supervisorCalls = 0
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const content = promptText(options.prompt)
          if (activeToolNames(options).length === 0 && content.includes("math child task")) {
            return Stream.make(textDelta("42"))
          }
          supervisorCalls += 1
          return supervisorCalls === 1
            ? Stream.make(toolCallPart("call-transfer", "transfer_to_math", { prompt: "math child task" }))
            : Stream.make(textDelta("supervisor got 42"))
        }),
        ToolExecutor.fromToolkit(
          Handoff.supervisor({ name: "supervisor", specialists: [Agent.make({ name: "math" })] }).toolkit,
        ),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const math = Agent.make({ name: "math" })
        const supervisor = Handoff.supervisor({ name: "supervisor", specialists: [math] })

        const events = yield* Stream.runCollect(Agent.stream(supervisor.agent, { prompt: "solve" }))

        const started = events.find((event) => event._tag === "ToolExecutionStarted")
        expect(started?._tag === "ToolExecutionStarted" && started.call.name).toBe("transfer_to_math")
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("supervisor got 42")
      }),
    ] as const
  })

  ItLayer.make(it, "rejects duplicate Handoff names before the supervisor model is called", () => {
    let modelCalls = 0
    return [
      modelLayer(() => {
        modelCalls += 1
        return Stream.make(textDelta("unexpected"))
      }),
      Effect.gen(function* () {
        const supervisor = Handoff.supervisor({
          name: "supervisor",
          specialists: [Agent.make({ name: "math" }), Agent.make({ name: "math" })],
        })

        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(supervisor.agent, { prompt: "solve" })))

        expect(failure).toEqual(
          AgentEvent.ToolNameCollision.make({
            name: "transfer_to_math",
            origins: [
              { _tag: "Handoff", specialist: "math" },
              { _tag: "Handoff", specialist: "math" },
            ],
          }),
        )
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fans out child agents with bounded concurrency and ordered results", () => {
    let active = 0
    let maxActive = 0
    const children = Array.from({ length: 6 }, (_, index) => ({
      agent: Agent.make({ name: `child-${index}` }),
      prompt: `task ${index}`,
    }))
    return [
      Layer.mergeAll(
        modelLayer((options) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const text = promptText(options.prompt)
              const task = text.match(/task \d/)?.[0] ?? "task ?"
              active += 1
              maxActive = Math.max(maxActive, active)
              yield* Effect.yieldNow
              active -= 1
              return Stream.make(textDelta(`done ${task}`))
            }),
          ),
        ),
        ToolExecutor.testLayer({ execute: () => Effect.die("fanOut children should not execute tools") }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const results = yield* Handoff.fanOut(children)

        expect(results.map((result) => result.text)).toEqual([
          "done task 0",
          "done task 1",
          "done task 2",
          "done task 3",
          "done task 4",
          "done task 5",
        ])
        expect(maxActive).toBeLessThanOrEqual(4)
      }),
    ] as const
  })

  ItLayer.make(it, "propagates fanOut child run errors", () => {
    const child = Agent.make({ name: "failing-child" })
    const modelError = AiError.make({
      module: "HandoffTest",
      method: "streamText",
      reason: AiError.UnknownError.make({ description: "child failed" }),
    })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.fail(modelError)),
        ToolExecutor.testLayer({ execute: () => Effect.die("fanOut failure should not execute tools") }),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Handoff.fanOut([{ agent: child, prompt: "fail" }]))

        expect(failure._tag).toBe("@batonfx/core/AgentError")
      }),
    ] as const
  })
})
