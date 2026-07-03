import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, Handoff, ModelMiddleware, ToolExecutor } from "../src/index"

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

const promptText = (prompt: Ai.Prompt.Prompt): string => JSON.stringify(prompt.content)

const activeToolNames = (options: Parameters<ModelParams["streamText"]>[0]) => options.tools.map((tool) => tool.name)

describe("Handoff", () => {
  it("names transfer tools by specialist", () => {
    const specialist = Agent.make({ name: "math" })
    const transfer = Handoff.transferTool(specialist)

    expect(Object.keys(transfer.tools)).toEqual(["transfer_to_math"])
  })

  it.effect("builds a supervisor that routes through transfer tools", () => {
    let supervisorCalls = 0
    return Effect.gen(function* () {
      const math = Agent.make({ name: "math" })
      const supervisor = Handoff.supervisor({ name: "supervisor", specialists: [math] })

      const events = yield* Stream.runCollect(Agent.stream(supervisor.agent, { prompt: "solve" }))

      const started = events.find((event) => event._tag === "ToolExecutionStarted")
      expect(started?._tag === "ToolExecutionStarted" && started.call.name).toBe("transfer_to_math")
      const completed = events.at(-1)
      expect(completed?._tag === "Completed" && completed.text).toBe("supervisor got 42")
    }).pipe(
      Effect.provide(
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
      ),
    )
  })

  it.effect("fans out child agents with bounded concurrency and ordered results", () => {
    let active = 0
    let maxActive = 0
    const children = Array.from({ length: 6 }, (_, index) => ({
      agent: Agent.make({ name: `child-${index}` }),
      prompt: `task ${index}`,
    }))
    return Effect.gen(function* () {
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
    }).pipe(
      Effect.provide(
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
      ),
    )
  })

  it.effect("propagates fanOut child run errors", () => {
    const child = Agent.make({ name: "failing-child" })
    const modelError = Ai.AiError.make({
      module: "HandoffTest",
      method: "streamText",
      reason: new Ai.AiError.UnknownError({ description: "child failed" }),
    })
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(Handoff.fanOut([{ agent: child, prompt: "fail" }]))

      expect(failure._tag).toBe("@batonfx/core/AgentError")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.fail(modelError)),
          ToolExecutor.testLayer({ execute: () => Effect.die("fanOut failure should not execute tools") }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })
})
