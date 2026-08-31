import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentManifest,
  Approvals,
  DurableDriver,
  ExecutableManifest,
  Handoff,
  ModelMiddleware,
  Pins,
  ToolExecutor,
} from "../../../src/index"
import { ItLayer } from "../it-layer"
import { close } from "../../../src/core/agent/closure.js"
import { layer as deterministicLayer } from "../../../src/ai/provider/deterministic.js"
import { unusedToolHandlerLayer } from "../tool-handler-layer"
import { withProviderFinish } from "../provider-finish"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: (options) => withProviderFinish(streamText(options)),
    }),
  )

const textDelta = (delta: string) => ({ type: "text-delta", id: "text", delta }) satisfies Response.StreamPartEncoded
const toolCallPart = (id: string, name: string, params: Readonly<Record<string, Schema.Json>>) =>
  ({ type: "tool-call", id, name, params, providerExecuted: false }) satisfies Response.StreamPartEncoded
const promptText = (prompt: Prompt.Prompt): string => JSON.stringify(prompt.content)

layer(Layer.empty)("Handoff same-run", (it) => {
  ItLayer.make(it, "persists the exact active Agent pin and resumes from it", () => {
    const model = Pins.makeModel({ model: "handoff-test" })
    const childAgent = Agent.make({ name: "pinned-math" })
    const child = AgentManifest.fromLiveAgent(childAgent, {
      model,
      tools: [],
      skills: [],
      services: [],
      policy: { _tag: "Portable", policy: { _tag: "Forever" } },
      budget: {},
      children: [],
    })
    const target = Handoff.target(childAgent, { pin: child.pin })
    const supervisorSetup = Handoff.supervisor({ name: "pinned-supervisor", specialists: [target] })
    const root = AgentManifest.fromLiveAgent(supervisorSetup.agent, {
      model,
      tools: [{ name: "handoff_to_pinned-math", pin: Pins.makeCapability({ tool: "handoff", version: 1 }) }],
      skills: [],
      services: [],
      policy: { _tag: "Portable", policy: { _tag: "Forever" } },
      budget: {},
      children: [{ selection: "pinned-math" }],
    })
    const executable = ExecutableManifest.make({
      root: root.pin,
      profiles: [{ selection: "pinned-math", agent: child.pin }],
      entries: [
        { _tag: "Agent", ...root },
        { _tag: "Agent", ...child },
      ],
    })
    let handoffCheckpoint: DurableDriver.DriverCheckpoint | undefined
    let handoffCommit: Handoff.Commit | undefined
    let calls = 0
    const journal = Layer.succeed(DurableDriver.DriverJournal, {
      onScheduled: () => Effect.void,
      onCompleted: (
        operation: DurableDriver.DriverOperation,
        outcome: DurableDriver.OperationOutcome,
        checkpoint: DurableDriver.DriverCheckpoint,
      ) =>
        Effect.sync(() => {
          if (operation.kind === "handoff" && outcome._tag === "Succeeded") {
            handoffCheckpoint = checkpoint
            handoffCommit = Schema.decodeUnknownOption(Handoff.Commit)(outcome.value).pipe(Option.getOrUndefined)
          }
        }),
      onCheckpoint: () => Effect.void,
    })
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("pinned-handoff", "handoff_to_pinned-math", { prompt: "continue" }))
            : Stream.make(textDelta("complete"))
        }),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        journal,
      ),
      Effect.gen(function* () {
        yield* Agent.stream(supervisorSetup.agent, {
          prompt: "start",
          executableRef: executable.ref,
          executableManifest: executable.manifest,
        }).pipe(Stream.runDrain)
        expect(handoffCheckpoint?.executable?.active).toBe(child.pin)
        expect(handoffCommit?.state).toMatchObject({
          root: "pinned-supervisor",
          active: "pinned-math",
          handoffCount: 1,
          edgeCounts: [{ source: "pinned-supervisor", target: "pinned-math", count: 1 }],
          pendingContinuation: { prompt: Prompt.make("continue") },
        })
        expect(handoffCommit?.state.path).toHaveLength(1)
        yield* Agent.stream(childAgent, {
          prompt: "restart",
          executableRef: { ...executable.ref, active: child.pin },
          executableManifest: executable.manifest,
          driverCheckpoint: handoffCheckpoint!,
        }).pipe(Stream.runDrain)
      }),
    ] as const
  })

  ItLayer.make(it, "preserves session and logical operation identity across handoff", () => {
    let mathTurn = 0
    const mathTarget = Handoff.target(Agent.make({ name: "math" }))
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    let supervisorCalls = 0
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
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

  ItLayer.make(it, "reuses the same handoff operation identity across equivalent restarts", () => {
    const mathTarget = Handoff.target(Agent.make({ name: "stable-math" }))
    const supervisorSetup = Handoff.supervisor({ name: "stable-supervisor", specialists: [mathTarget] })
    const completedKeys: Array<string> = []
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
        modelLayer((options) =>
          promptText(options.prompt).includes("continue stable")
            ? Stream.make(textDelta("complete"))
            : Stream.make(toolCallPart("stable-call", "handoff_to_stable-math", { prompt: "continue stable" })),
        ),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
        Layer.succeed(DurableDriver.DriverJournal, {
          onScheduled: () => Effect.void,
          onCompleted: (operation: DurableDriver.DriverOperation) =>
            Effect.sync(() => {
              if (operation.kind === "handoff") {
                completedKeys.push(operation.key)
              }
            }),
          onCheckpoint: () => Effect.void,
        }),
      ),
      Effect.gen(function* () {
        for (let restart = 0; restart < 2; restart++) {
          yield* Agent.stream(supervisorSetup.agent, {
            prompt: "start stable",
            logicalOperationId: "stable-handoff-run",
          }).pipe(Stream.runDrain)
        }
        expect(completedKeys).toHaveLength(2)
        expect(completedKeys[0]).toBe(completedKeys[1])
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
        unusedToolHandlerLayer,
        parentModel,
        ToolExecutor.layerToolkit(delegate).pipe(Layer.provide(parentModel)),
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
        unusedToolHandlerLayer,
        modelLayer(() => Stream.make(toolCallPart("h1", "handoff_to_math", { prompt: "go" }))),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        Handoff.layerCatalog([]),
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(supervisorSetup.agent, { prompt: "go" })))
        expect(failure._tag).toBe("generalist/core/TargetMissing")
      }),
    ] as const
  })

  ItLayer.make(it, "rejects unresolved history before invoking the handoff model", () => {
    const mathTarget = Handoff.target(
      close(
        Agent.make({ name: "math" }),
        modelLayer(() => Stream.empty),
      ),
      undefined,
    )
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    let modelCalls = 0
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
        modelLayer(() => {
          modelCalls += 1
          return Stream.make(toolCallPart("h1", "handoff_to_math", { prompt: "go" }))
        }),
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
        expect(failure).toMatchObject({
          _tag: "generalist/core/AgentError",
          message: "Invalid framework tool history",
        })
        expect(modelCalls).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "runs the specialist on its target model layer after handoff", () => {
    let ambientCalls = 0
    const mathTarget = Handoff.target(Agent.make({ name: "math" }), {
      model: modelLayer(() => Stream.make(textDelta("specialist-model-answer"))),
    })
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
        modelLayer(() => {
          ambientCalls += 1
          return ambientCalls === 1
            ? Stream.make(toolCallPart("h1", "handoff_to_math", { prompt: "go" }))
            : Stream.make(textDelta("ambient-answer"))
        }),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(Agent.stream(supervisorSetup.agent, { prompt: "start" }))
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("specialist-model-answer")
        expect(ambientCalls).toBe(1)
      }),
    ] as const
  })

  ItLayer.make(it, "applies a specialist's declared selection through the ambient run's registry", () => {
    const mathTarget = Handoff.target(
      Agent.make({ name: "math", model: { provider: "deterministic", model: "deterministic" } }),
    )
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
        modelLayer(() => Stream.make(toolCallPart("h1", "handoff_to_math", { prompt: "go" }))),
        deterministicLayer(),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const events = yield* Stream.runCollect(Agent.stream(supervisorSetup.agent, { prompt: "start" }))
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("deterministic response")
      }),
    ] as const
  })

  ItLayer.make(it, "fails loudly when a specialist declares a selection but no registry is provided", () => {
    const mathTarget = Handoff.target(
      Agent.make({ name: "math", model: { provider: "deterministic", model: "deterministic" } }),
    )
    const supervisorSetup = Handoff.supervisor({ name: "supervisor", specialists: [mathTarget] })
    return [
      Layer.mergeAll(
        unusedToolHandlerLayer,
        modelLayer(() => Stream.make(toolCallPart("h1", "handoff_to_math", { prompt: "go" }))),
        ToolExecutor.layerToolkit(supervisorSetup.toolkit),
        supervisorSetup.catalog,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
      Effect.gen(function* () {
        const failure = yield* Effect.flip(Stream.runDrain(Agent.stream(supervisorSetup.agent, { prompt: "start" })))
        expect(failure).toMatchObject({ _tag: "generalist/core/HandoffRequirementsMissing" })
      }),
    ] as const
  })
})
