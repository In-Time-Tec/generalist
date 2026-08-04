import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, Handoff, ModelMiddleware, ToolExecutor } from "../src/index"
import { ItLayer } from "./it-layer"
import { withProviderFinish } from "./provider-finish"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })
const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })
const promptText = (prompt: Prompt.Prompt): string => JSON.stringify(prompt.content)

layer(Layer.empty)("Handoff", (it) => {
  it("requires an explicit layer and closes full run options", () => {
    let observed: Prompt.Prompt | undefined
    const registration = Handoff.register(
      Agent.make({ name: "math" }),
      modelLayer((options) => {
        observed = options.prompt
        return Stream.make(textDelta("child result"))
      }),
    )
    return Effect.gen(function* () {
      const history = Prompt.fromMessages([
        Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "prior" })] }),
      ])
      const result = yield* registration.run({
        prompt: "current",
        history,
        system: "system override",
        sessionId: "session-1",
        logicalOperationId: "operation-1",
        modelCallOrdinalStart: 3,
        sessionOwnerToken: "owner-1",
        toolProgress: { _tag: "Backpressure", capacity: 4 },
        compaction: { contextWindow: 1024 },
      })
      expect(result.text).toBe("child result")
      expect(observed).toBeDefined()
      expect(promptText(observed!)).toContain("prior")
    })
  })

  it("maps registration layer failures to a named typed error", () => {
    const registration = Handoff.register(
      Agent.make({ name: "unavailable" }),
      Layer.effect(LanguageModel.LanguageModel, Effect.fail("service unavailable")),
    )
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(registration.run({ prompt: "hello" }))
      expect(failure._tag).toBe("@batonfx/core/RegistrationError")
      if (Schema.is(Handoff.RegistrationError)(failure)) {
        expect(failure.agent).toBe("unavailable")
        expect(failure.cause).toBe("service unavailable")
      }
      expect(Schema.is(Handoff.RegistrationError)(failure)).toBe(true)
    })
  })

  it("names delegate tools by registered specialist", () => {
    const registration = Handoff.register(
      Agent.make({ name: "math" }),
      modelLayer(() => Stream.make(textDelta("done"))),
    )
    const delegate = Handoff.delegateTool(registration)
    expect(registration.name).toBe("math")
    expect(Object.keys(delegate.tools)).toEqual(["delegate_to_math"])
  })

  ItLayer.make(it, "builds a supervisor that same-run handoffs to specialists", () => {
    let supervisorCalls = 0
    let mathCalls = 0
    const mathTarget = Handoff.target(Agent.make({ name: "math" }))
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const content = promptText(options.prompt)
          if (content.includes("math child task")) {
            mathCalls += 1
            return Stream.make(textDelta("42"))
          }
          supervisorCalls += 1
          return supervisorCalls === 1
            ? Stream.make(toolCallPart("call-handoff", "handoff_to_math", { prompt: "math child task" }))
            : Stream.make(textDelta("supervisor got 42"))
        }),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(
          Agent.stream(supervisorSetup.agent, {
            prompt: "solve",
            sessionId: "session-handoff-1",
            logicalOperationId: "op-handoff-1",
          }),
        )
        const started = events.find((event) => event._tag === "ToolExecutionStarted")
        expect(started?._tag === "ToolExecutionStarted" && started.call.name).toBe("handoff_to_math")
        expect(mathCalls).toBe(1)
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("42")
      }),
    ] as const
  })

  ItLayer.make(it, "rejects duplicate registered names", () => {
    const first = Handoff.target(Agent.make({ name: "math" }))
    const second = Handoff.target(Agent.make({ name: "math" }))
    let modelCalls = 0
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [first, second] })
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(textDelta("unexpected"))
        }),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(supervisorSetup.agent, { prompt: "solve" })))
        expect(failure).toEqual(
          AgentEvent.ToolNameCollision.make({
            name: "handoff_to_math",
            origins: [
              { _tag: "Handoff", specialist: "math", mode: "same-run" },
              { _tag: "Handoff", specialist: "math", mode: "same-run" },
            ],
          }),
        )
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "fans out registered agents with bounded concurrency and ordered results", () => {
    let active = 0
    let maxActive = 0
    const children = Array.from({ length: 6 }, (_, index) => ({
      registration: Handoff.register(
        Agent.make({ name: `child-${index}` }),
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
      ),
      prompt: `task ${index}`,
    }))
    return [
      Layer.mergeAll(Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
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

  ItLayer.make(it, "supports zero-argument currying", () => {
    const runFanOut = Handoff.fanOut()
    return [
      Layer.empty,
      Effect.gen(function* () {
        const results = yield* runFanOut([])
        expect(results).toEqual([])
      }),
    ] as const
  })

  ItLayer.make(it, "propagates registered run errors", () => {
    const child = Handoff.register(
      Agent.make({ name: "failing-child" }),
      modelLayer(() => Stream.fail(new Error("child failed") as never)),
    )
    return [
      Layer.mergeAll(Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Handoff.fanOut([{ registration: child, prompt: "fail" }]))
        expect(failure._tag).toBe("@batonfx/core/AgentError")
      }),
    ] as const
  })
})
