import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { LanguageModel, Prompt, Response, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Handoff, ModelMiddleware, ToolExecutor } from "../src/index"
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

layer(Layer.empty)("Handoff same-run", (it) => {
  ItLayer.make(it, "preserves session and logical operation identity across handoff", () => {
    let mathTurn = 0
    const mathTarget = Handoff.target(Agent.make({ name: "math" }))
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    let supervisorCalls = 0
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          const content = promptText(options.prompt)
          if (content.includes("continue as math")) {
            mathTurn += 1
            return Stream.make(textDelta("math-answer"))
          }
          supervisorCalls += 1
          return supervisorCalls === 1
            ? Stream.make(toolCallPart("h1", "handoff_to_math", { prompt: "continue as math" }))
            : Stream.make(textDelta("supervisor-done"))
        }),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(Agent.stream(supervisorSetup.agent, { prompt: "start" }))
        expect(mathTurn).toBe(1)
        expect(events.at(-1)?._tag).toBe("Completed")
      }),
    ] as const
  })

  ItLayer.make(it, "keeps inline delegate separate from same-run handoff", () => {
    let childCalls = 0
    let parentCalls = 0
    const childRegistration = Handoff.register(
      Agent.make({ name: "worker" }),
      modelLayer((options) => {
        childCalls += 1
        return promptText(options.prompt).includes("delegate task")
          ? Stream.make(textDelta("delegated-result"))
          : Stream.make(textDelta("unused"))
      }),
    )
    const delegate = Handoff.delegateTool(childRegistration)
    const parentModel = modelLayer((options) => {
      const content = promptText(options.prompt)
      if (content.includes("delegated-result")) return Stream.make(textDelta("parent-final"))
      parentCalls += 1
      return parentCalls === 1
        ? Stream.make(toolCallPart("d1", "delegate_to_worker", { prompt: "delegate task" }))
        : Stream.make(textDelta("unexpected"))
    })
    return [
      Layer.mergeAll(
        parentModel,
        ToolExecutor.layerToolkit(delegate),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const parent = Agent.make({
          name: "parent",
          toolkit: Toolkit.make(delegate.tool),
        })
        const events = yield* Stream.runCollect(Agent.stream(parent, { prompt: "go" }))
        const last = events.at(-1)
        expect(last?._tag).toBe("Completed")
        if (last?._tag === "Completed") expect(last.text).toBe("parent-final")
        expect(childCalls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "rejects handoff when target is missing from catalog", () => {
    const mathTarget = Handoff.target(Agent.make({ name: "math" }))
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("h1", "handoff_to_math", { prompt: "go" }))),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        Handoff.layerCatalog([]),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(supervisorSetup.agent, { prompt: "go" })))
        expect(failure._tag).toBe("@batonfx/core/HandoffTargetMissing")
      }),
    ] as const
  })

  ItLayer.make(it, "rejects projection that would leave unresolved tool calls", () => {
    const mathTarget = Handoff.target(Agent.make({ name: "math" }) as never)
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.make(toolCallPart("h1", "handoff_to_math", { prompt: "go" }))),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          Stream.runDrain(
            Agent.stream(supervisorSetup.agent, {
              prompt: "go",
              history: Prompt.fromMessages([
                Prompt.makeMessage("assistant", {
                  content: [
                    Prompt.makePart("tool-call", {
                      id: "pending",
                      name: "missing",
                      params: {},
                      providerExecuted: false,
                    }),
                  ],
                }),
              ]),
            }),
          ),
        )
        expect(failure._tag).toBe("@batonfx/core/HandoffRejected")
      }),
    ] as const
  })
})
