import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Layer, Option, Schedule, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  Approvals,
  Compaction,
  Instructions,
  ModelResilience,
  ModelMiddleware,
  Permissions,
  Session,
  SkillSource,
  Steering,
  ToolContext,
  ToolExecutor,
  ToolOutput,
  TurnPolicy,
} from "../src/index"
import { unusedToolHandlerLayer } from "./tool-handler-layer"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (
  streamText: ModelParams["streamText"],
  generateText: ModelParams["generateText"] = () => Effect.succeed([{ type: "text", text: "unused" }]),
) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText,
      streamText,
    }),
  )

const echoTool = Tool.make("echo", {
  description: "Echo input for tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const gatedTool = Tool.make("gated", {
  description: "Requires approval",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
  needsApproval: true,
})

const testSkill = (
  name: string,
  description: string,
  body: string,
  options: Partial<SkillSource.Frontmatter> = {},
): SkillSource.Skill => {
  const frontmatter: SkillSource.Frontmatter = { name, description, ...options }
  return {
    frontmatter,
    listing: SkillSource.makeListing(frontmatter),
    body: Effect.succeed(body),
    tools: [],
  }
}

const echoExecutor = ToolExecutor.testLayer({
  execute: (request) =>
    Effect.succeed({
      _tag: "Success",
      result: { echoed: request.call.params },
      encodedResult: { echoed: request.call.params },
    }),
})

const unusedExecutor = ToolExecutor.testLayer({
  execute: () => Effect.die("unexpected tool execution"),
})

const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const providerToolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: true })

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const systemText = (prompt: Prompt.Prompt): string | undefined => {
  for (const message of prompt.content) {
    if (message.role === "system") return message.content
  }
  return undefined
}

const usage = (
  inputTokens: Partial<Response.Usage["inputTokens"]>,
  outputTokens: Partial<Response.Usage["outputTokens"]>,
) =>
  new Response.Usage({
    inputTokens: {
      uncached: inputTokens.uncached,
      total: inputTokens.total,
      cacheRead: inputTokens.cacheRead,
      cacheWrite: inputTokens.cacheWrite,
    },
    outputTokens: {
      total: outputTokens.total,
      text: outputTokens.text,
      reasoning: outputTokens.reasoning,
    },
  })

const finishPart = (reason: Response.FinishReason, reportedUsage: Response.Usage) =>
  Response.makePart("finish", { reason, usage: reportedUsage, response: undefined })

const objectSchema = Schema.Struct({ ok: Schema.Boolean })

const transientModelError = AiError.make({
  module: "AgentTestLanguageModel",
  method: "streamText",
  reason: new AiError.RateLimitError({}),
})

const contextOverflowError = (description: string) =>
  AiError.make({
    module: "AgentTestLanguageModel",
    method: "streamText",
    reason: new AiError.UnknownError({ description }),
  })

const retryTransientModelError = ModelResilience.layer({
  retrySchedule: Schedule.recurs(1),
  classify: (error) => (error === transientModelError ? "transient" : "terminal"),
})

layer(unusedToolHandlerLayer)("Agent", (it) => {
  it("adds usage fieldwise without inventing absent leaves", () => {
    const first = usage({ uncached: 1, total: 10, cacheWrite: 3 }, { total: 4, text: 2 })
    const second = usage({ uncached: 4, total: 20, cacheRead: 5 }, { total: 6, reasoning: 7 })

    const summed = AgentEvent.addUsage(first, second)

    expect(summed.inputTokens.uncached).toBe(5)
    expect(summed.inputTokens.total).toBe(30)
    expect(summed.inputTokens.cacheRead).toBe(5)
    expect(summed.inputTokens.cacheWrite).toBe(3)
    expect(summed.outputTokens.total).toBe(10)
    expect(summed.outputTokens.text).toBe(2)
    expect(summed.outputTokens.reasoning).toBe(7)
    expect(AgentEvent.addUsage(usage({}, {}), usage({}, {})).inputTokens.total).toBeUndefined()
  })

  it("constructs AgentError without a cause", () => {
    const error = new AgentEvent.AgentError({ message: "boom", turn: 0 })

    expect(error._tag).toBe("@batonfx/core/AgentError")
    expect(error.cause).toBeUndefined()
  })

  it.effect("fails before model calls when toolOutputMaxBytes is invalid", () => {
    let modelCalls = 0
    const invalidValues = [-1, Number.NaN, Number.POSITIVE_INFINITY]
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "invalid-tool-output-limit-agent" })

      for (const toolOutputMaxBytes of invalidValues) {
        const failure = yield* Effect.flip(
          Stream.runDrain(Agent.stream(agent, { prompt: "hello", toolOutputMaxBytes })),
        )

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toBe(
          "RunOptions.toolOutputMaxBytes must be a non-negative finite number",
        )
      }
      expect(modelCalls).toBe(0)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            modelCalls += 1
            return Stream.make(textDelta("unexpected"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("fails before model calls when compaction contextWindow is invalid", () => {
    let modelCalls = 0
    const invalidValues = [0, -1, Number.NaN, Number.POSITIVE_INFINITY]
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "invalid-context-window-agent" })

      for (const contextWindow of invalidValues) {
        const failure = yield* Effect.flip(
          Stream.runDrain(Agent.stream(agent, { prompt: "hello", compaction: { contextWindow } })),
        )

        expect(failure._tag).toBe("@batonfx/core/AgentError")
        expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toBe(
          "RunOptions.compaction.contextWindow must be a positive finite number",
        )
      }
      expect(modelCalls).toBe(0)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            modelCalls += 1
            return Stream.make(textDelta("unexpected"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("runs an agent turn and emits loop events", () =>
    Effect.gen(function* () {
      const agent = Agent.make({
        name: "loop-test-agent",
        instructions: "Always mention relay input when you answer.",
      })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "relay input" }))

      expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "TurnCompleted", "Completed"])
      const completed = events.at(-1)
      expect(completed?._tag).toBe("Completed")
      if (completed?._tag === "Completed") {
        expect(completed.text).toBe("saw system and input")
        expect(completed.turns).toBe(1)
        expect("usage" in completed).toBe(false)
      }
      const modelPart = events[1]
      if (modelPart?._tag === "ModelPart") {
        expect(modelPart.part.type).toBe("text-delta")
      }
      const turnCompleted = events.find((event) => event._tag === "TurnCompleted")
      if (turnCompleted?._tag === "TurnCompleted") {
        expect("usage" in turnCompleted).toBe(false)
        expect("finishReason" in turnCompleted).toBe(false)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) =>
            Stream.make(
              textDelta(
                JSON.stringify(options.prompt.content).includes("Always mention relay input") &&
                  JSON.stringify(options.prompt.content).includes("relay input")
                  ? "saw system and input"
                  : "missing system or input",
              ),
            ),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    ),
  )

  it.effect("runs a no-tool agent with only a language model layer", () =>
    Effect.gen(function* () {
      const agent = Agent.make("minimal-agent", { instructions: "Answer directly." })

      const result = yield* Agent.generate(agent, { prompt: "hello" })

      expect(result.text).toBe("minimal done")
    }).pipe(Effect.provide(modelLayer(() => Stream.make(textDelta("minimal done"))))),
  )

  it.effect("executes Effect toolkit handlers without a ToolExecutor layer", () => {
    let calls = 0
    let handled = false
    const toolkit = Toolkit.make(echoTool)
    return Effect.gen(function* () {
      const agent = Agent.make("toolkit-handler-agent", { toolkit })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use echo" }))

      expect(handled).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-effect-toolkit", "echo", { text: "from model" }))
              : Stream.make(
                  textDelta(JSON.stringify(options.prompt.content).includes("handled by toolkit") ? "done" : "missing"),
                )
          }),
          toolkit.toLayer({
            echo: ({ text }) =>
              Effect.sync(() => {
                handled = true
                return { echoed: text, marker: "handled by toolkit" }
              }),
          }),
        ),
      ),
    )
  })

  it.effect("keeps ToolExecutor as an override when it is provided", () => {
    let calls = 0
    let toolkitHandlerCalls = 0
    let executorCalls = 0
    const toolkit = Toolkit.make(echoTool)
    return Effect.gen(function* () {
      const agent = Agent.make("tool-executor-override-agent", { toolkit })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use echo" }))

      expect(toolkitHandlerCalls).toBe(0)
      expect(executorCalls).toBe(1)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-override", "echo", { text: "from model" }))
              : Stream.make(
                  textDelta(
                    JSON.stringify(options.prompt.content).includes("handled by executor") ? "done" : "missing",
                  ),
                )
          }),
          toolkit.toLayer({
            echo: () =>
              Effect.sync(() => {
                toolkitHandlerCalls += 1
                return { marker: "handled by toolkit" }
              }),
          }),
          ToolExecutor.testLayer({
            execute: () =>
              Effect.sync(() => {
                executorCalls += 1
                return {
                  _tag: "Success",
                  result: { marker: "handled by executor" },
                  encodedResult: { marker: "handled by executor" },
                }
              }),
          }),
        ),
      ),
    )
  })

  it.effect("fails approval-gated tools closed when Approvals is absent", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make("missing-approvals-agent", { toolkit: Toolkit.make(gatedTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use gated" }))
      const completion = events.find((event) => event._tag === "ToolExecutionCompleted")

      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
      if (completion?._tag === "ToolExecutionCompleted") {
        expect(completion.result.isFailure).toBe(true)
        expect(JSON.stringify(completion.result.encodedResult)).toContain("Approvals service is required")
      }
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-missing-approvals", "gated", { text: "from model" }))
              : Stream.make(textDelta("after failed approval"))
          }),
          Toolkit.make(gatedTool).toLayer({
            gated: () => Effect.die("approval-gated call must not execute"),
          }),
        ),
      ),
    )
  })

  it.effect("uses an Instructions baseline for the first-turn system message", () => {
    let capturedSystem: string | undefined
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "instructions-agent", instructions: "fallback instructions" })

      yield* Stream.runDrain(Agent.stream(agent, { prompt: "hello" }))

      expect(capturedSystem).toBe("first\n\nsecond")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            capturedSystem = systemText(options.prompt)
            return Stream.make(textDelta("done"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          Instructions.layer([
            Instructions.staticSource("first", "first"),
            Instructions.staticSource("second", "second"),
          ]),
        ),
      ),
    )
  })

  it.effect("keeps options.system ahead of an Instructions baseline", () => {
    let capturedSystem: string | undefined
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "instructions-system-agent", instructions: "fallback instructions" })

      yield* Stream.runDrain(Agent.stream(agent, { prompt: "hello", system: "override" }))

      expect(capturedSystem).toBe("override")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            capturedSystem = systemText(options.prompt)
            return Stream.make(textDelta("done"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          Instructions.layer([Instructions.staticSource("registry", "registry")]),
        ),
      ),
    )
  })

  it.effect("keeps explicit history ahead of an Instructions baseline", () => {
    let capturedSystem: string | undefined
    let capturedPrompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "instructions-history-agent", instructions: "fallback instructions" })

      yield* Stream.runDrain(
        Agent.stream(agent, {
          prompt: "new input",
          history: [
            { role: "system", content: "history system" },
            { role: "user", content: [{ type: "text", text: "earlier" }] },
          ],
        }),
      )

      expect(capturedSystem).toBe("history system")
      expect(capturedPrompt).not.toContain("registry")
      expect(capturedPrompt).not.toContain("fallback instructions")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            capturedSystem = systemText(options.prompt)
            capturedPrompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("done"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          Instructions.layer([Instructions.staticSource("registry", "registry")]),
        ),
      ),
    )
  })

  it.effect("falls back to agent instructions when the Instructions baseline is empty", () => {
    let capturedSystem: string | undefined
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "empty-instructions-agent", instructions: "fallback instructions" })

      yield* Stream.runDrain(Agent.stream(agent, { prompt: "hello" }))

      expect(capturedSystem).toBe("fallback instructions")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            capturedSystem = systemText(options.prompt)
            return Stream.make(textDelta("done"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          Instructions.layer([Instructions.staticSource("empty", "")]),
        ),
      ),
    )
  })

  it.effect("injects skill listings and loads only activated skill bodies", () => {
    let calls = 0
    let firstPrompt = ""
    let secondPrompt = ""
    let firstTools: ReadonlyArray<string> = []
    let secondTools: ReadonlyArray<string> = []
    let deployBodyReads = 0
    const reviewTool = Tool.make("review_tool", {
      description: "Review helper",
      parameters: Schema.Struct({ target: Schema.String }),
      success: Schema.Unknown,
    })
    const review: SkillSource.Skill = {
      ...testSkill("review", "Review code before changing it.", "FULL REVIEW BODY", {
        allowedTools: ["read", "grep"],
      }),
      tools: [reviewTool],
    }
    const deployBase = testSkill("deploy", "Deploy after verification.", "FULL DEPLOY BODY", {
      allowedTools: ["deploy"],
    })
    const deploy: SkillSource.Skill = {
      ...deployBase,
      body: Effect.sync(() => {
        deployBodyReads += 1
        return "FULL DEPLOY BODY"
      }),
    }
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "skill-agent", instructions: "base instructions" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "review this" }))
      const activation = events.find(
        (event) => event._tag === "ToolExecutionCompleted" && event.call.name === "activate_skill",
      )

      expect(calls).toBe(2)
      expect(firstTools).toContain("activate_skill")
      expect(firstTools).not.toContain("review_tool")
      expect(secondTools).toContain("review_tool")
      expect(firstPrompt).toContain("base instructions")
      expect(firstPrompt).toContain("- review: Review code before changing it.")
      expect(firstPrompt).toContain("- deploy: Deploy after verification.")
      expect(firstPrompt).not.toContain("FULL REVIEW BODY")
      expect(firstPrompt).not.toContain("FULL DEPLOY BODY")
      expect(secondPrompt).toContain("FULL REVIEW BODY")
      expect(secondPrompt).toContain("read")
      expect(secondPrompt).toContain("grep")
      expect(secondPrompt).not.toContain("FULL DEPLOY BODY")
      expect(deployBodyReads).toBe(0)
      expect(activation?._tag === "ToolExecutionCompleted" && activation.result.result).toEqual({
        name: "review",
        body: "FULL REVIEW BODY",
        allowedTools: ["read", "grep"],
      })
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            const content = JSON.stringify(options.prompt.content)
            if (calls === 1) {
              firstPrompt = content
              firstTools = options.tools.map((tool) => tool.name)
              return Stream.make(toolCallPart("skill-call-review", "activate_skill", { name: "review" }))
            }
            secondPrompt = content
            secondTools = options.tools.map((tool) => tool.name)
            return Stream.make(textDelta("used review"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
          SkillSource.fromSkills([review, deploy]),
        ),
      ),
    )
  })

  it.effect("keeps runs without SkillSource unchanged", () => {
    let capturedPrompt = ""
    let capturedTools: ReadonlyArray<string> = []
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "no-skills-agent", instructions: "plain instructions" })

      const result = yield* Agent.generate(agent, { prompt: "hello" })

      expect(result.text).toBe("done")
      expect(capturedPrompt).toBe(
        `[{"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","options":{},"role":"system","content":"plain instructions"},{"content":[{"text":"hello","~effect/ai/Prompt/Part":"~effect/ai/Prompt/Part","type":"text","options":{}}],"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","role":"user","options":{}}]`,
      )
      expect(capturedTools).toEqual([])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            capturedPrompt = JSON.stringify(options.prompt.content)
            capturedTools = options.tools.map((tool) => tool.name)
            return Stream.make(textDelta("done"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("preserves empty system instructions without SkillSource", () => {
    let capturedPrompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "empty-system-agent", instructions: "" })

      const result = yield* Agent.generate(agent, { prompt: "hello" })

      expect(result.text).toBe("done")
      expect(capturedPrompt).toBe(
        `[{"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","options":{},"role":"system","content":""},{"content":[{"text":"hello","~effect/ai/Prompt/Part":"~effect/ai/Prompt/Part","type":"text","options":{}}],"~effect/ai/Prompt/Message":"~effect/ai/Prompt/Message","role":"user","options":{}}]`,
      )
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            capturedPrompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("done"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("surfaces finish usage while preserving raw finish parts", () => {
    const reportedUsage = usage({ total: 12, cacheRead: 2 }, { total: 5, text: 4 })
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "usage-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "report usage" }))

      expect(events.map((event) => event._tag)).toEqual([
        "TurnStarted",
        "ModelPart",
        "ModelPart",
        "TurnCompleted",
        "Completed",
      ])
      const finishModelPart = events.find((event) => event._tag === "ModelPart" && event.part.type === "finish")
      expect(finishModelPart?._tag === "ModelPart" && finishModelPart.part.type === "finish").toBe(true)
      const turnCompleted = events.find((event) => event._tag === "TurnCompleted")
      if (turnCompleted?._tag === "TurnCompleted") {
        expect(turnCompleted.usage).toEqual(reportedUsage)
        expect(turnCompleted.finishReason).toBe("stop")
      }
      const completed = events.at(-1)
      if (completed?._tag === "Completed") {
        expect(completed.usage).toEqual(reportedUsage)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.fromIterable([textDelta("done"), finishPart("stop", reportedUsage)])),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("executes tool-call stream parts through ToolExecutor", () => {
    let calls = 0
    let secondCallSawToolResult = false
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "tool-test-agent",
        toolkit: Toolkit.make(echoTool),
      })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

      expect(calls).toBe(2)
      expect(secondCallSawToolResult).toBe(true)
      expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(2)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
      const completed = events.at(-1)
      expect(completed?._tag).toBe("Completed")
      if (completed?._tag === "Completed") {
        expect(completed.text).toBe("after tool")
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-1", "echo", { text: "from model" }))
            }
            secondCallSawToolResult = JSON.stringify(options.prompt.content).includes("from model")
            return Stream.make(textDelta("after tool"))
          }),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("provides ToolContext to executors and emits ToolProgress events", () => {
    let calls = 0
    let requestSessionId = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "context-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "use the context tool", sessionId: "session-1" }),
      )

      const tags = events.map((event) => event._tag)
      expect(requestSessionId).toBe("session-1")
      expect(tags.indexOf("ToolExecutionStarted")).toBeLessThan(tags.indexOf("ToolProgress"))
      expect(tags.indexOf("ToolProgress")).toBeLessThan(tags.indexOf("ToolExecutionCompleted"))
      const progress = events.find((event) => event._tag === "ToolProgress")
      if (progress?._tag === "ToolProgress") {
        expect(progress.turn).toBe(0)
        expect(progress.toolCallId).toBe("tool-call-context")
        expect(progress.message).toBe("working")
        expect(progress.data).toEqual({ phase: "started" })
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-context", "echo", { text: "from model" }))
              : Stream.make(textDelta("after context"))
          }),
          ToolExecutor.testLayer({
            execute: (request) =>
              Effect.gen(function* () {
                requestSessionId = request.sessionId
                const context = yield* ToolContext.ToolContext
                expect(context.sessionId).toBe("session-1")
                expect(context.signal.aborted).toBe(false)
                yield* context.emit({
                  toolCallId: request.call.id,
                  message: "working",
                  data: { phase: "started" },
                })
                return { _tag: "Success", result: { ok: true }, encodedResult: { ok: true } }
              }),
          }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("provides ToolContext to default toolkit handlers", () => {
    let calls = 0
    let handlerSessionId = ""
    const handledTool = Tool.make("handled-context", {
      description: "Reads Baton ToolContext from a toolkit handler",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
      dependencies: [ToolContext.ToolContext],
    })
    const toolkit = Toolkit.make(handledTool)
    return Effect.gen(function* () {
      const handledToolkit = yield* toolkit.pipe(
        Effect.provide(
          toolkit.toLayer({
            "handled-context": () =>
              Effect.gen(function* () {
                const context = yield* ToolContext.ToolContext
                handlerSessionId = context.sessionId
                yield* context.emit({ toolCallId: "tool-call-handled-context", message: "from handler" })
                return { ok: true }
              }),
          }),
        ),
      )
      const agent = Agent.make({ name: "toolkit-context-agent", toolkit })

      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "use handler", sessionId: "session-toolkit" }),
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            modelLayer(() => {
              calls += 1
              return calls === 1
                ? Stream.make(toolCallPart("tool-call-handled-context", "handled-context", { text: "from model" }))
                : Stream.make(textDelta("after handler"))
            }),
            ToolExecutor.fromToolkit(handledToolkit),
            Approvals.autoApprove,
            ModelMiddleware.identityLayer,
          ),
        ),
      )

      expect(handlerSessionId).toBe("session-toolkit")
      expect(events.some((event) => event._tag === "ToolProgress")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    })
  })

  it.effect("passes sessionId to approvals for gated tools", () => {
    let calls = 0
    let approvalSessionId = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "gated-session-agent", toolkit: Toolkit.make(gatedTool) })

      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "needs approval", sessionId: "session-approval" }),
      )

      expect(approvalSessionId).toBe("session-approval")
      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-gated-session", "gated", { text: "from model" }))
              : Stream.make(textDelta("after denial"))
          }),
          unusedExecutor,
          Approvals.testLayer({
            check: (request) => {
              approvalSessionId = request.sessionId
              return Effect.succeed({ _tag: "Denied" })
            },
          }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("denies through Permissions before approvals or executor", () => {
    let calls = 0
    let secondPrompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "permission-deny-agent", toolkit: Toolkit.make(gatedTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "needs permission" }))

      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
      const denied = events.find((event) => event._tag === "ToolExecutionCompleted")
      if (denied?._tag === "ToolExecutionCompleted") {
        expect(denied.result.isFailure).toBe(true)
        expect(JSON.stringify(denied.result.encodedResult)).toContain("Permission denied")
      }
      expect(secondPrompt).toContain("Permission denied")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-permission-deny", "gated", { text: "blocked" }))
            }
            secondPrompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("saw denied permission"))
          }),
          ToolExecutor.testLayer({ execute: () => Effect.die("permission-denied call must not execute") }),
          Approvals.testLayer({ check: () => Effect.die("permission-denied call must not ask approvals") }),
          Permissions.fromRuleset({ rules: [{ pattern: "gated", level: "deny" }] }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("allows through Permissions while preserving tool-declared approvals", () => {
    let calls = 0
    let secondPrompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "permission-allow-agent", toolkit: Toolkit.make(gatedTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "needs approval" }))

      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
      expect(secondPrompt).toContain("Tool call denied")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-permission-allow", "gated", { text: "still gated" }))
            }
            secondPrompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("saw approval denial"))
          }),
          ToolExecutor.testLayer({ execute: () => Effect.die("approval-denied call must not execute") }),
          Approvals.denyAll,
          Permissions.allowAll,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("suspends permission asks through the existing approval suspension path", () => {
    const events: Array<AgentEvent.Event> = []
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "permission-ask-agent", toolkit: Toolkit.make(gatedTool) })

      const failure = yield* Effect.flip(
        Stream.runForEach(Agent.stream(agent, { prompt: "needs permission" }), (event) =>
          Effect.sync(() => {
            events.push(event)
          }),
        ),
      )

      expect(events.map((event) => event._tag)).toEqual([
        "TurnStarted",
        "ModelPart",
        "ApprovalRequested",
        "TurnCompleted",
      ])
      expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
      if (failure._tag === "@batonfx/core/AgentSuspended") {
        expect(failure.reason).toBe("approval")
        expect(failure.token).toBe("permission:tool-call-permission-ask")
        expect(failure.tool_name).toBe("gated")
        expect(failure.tool_params).toEqual({ text: "ask" })
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("tool-call-permission-ask", "gated", { text: "ask" }))),
          ToolExecutor.testLayer({ execute: () => Effect.die("permission ask must not execute") }),
          Approvals.testLayer({ check: () => Effect.die("permission ask must not ask approvals") }),
          Permissions.fromRuleset({ rules: [], fallback: "ask" }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("executes permission Approved answers without consulting Approvals again", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "permission-approved-agent", toolkit: Toolkit.make(gatedTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "ask then approve" }))

      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-permission-approved", "gated", { text: "approved" }))
              : Stream.make(textDelta("after approved permission"))
          }),
          echoExecutor,
          Approvals.testLayer({ check: () => Effect.die("permission-approved call must not ask approvals") }),
          Permissions.interactive({
            ruleset: { rules: [], fallback: "ask" },
            onAsk: () => Effect.succeed({ _tag: "Approved" }),
          }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("remembers Always answers through the optional RuleStore", () => {
    let calls = 0
    const remembered: Array<Permissions.Rule> = []
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "permission-always-agent", toolkit: Toolkit.make(gatedTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "ask always" }))

      expect(remembered).toEqual([{ pattern: "gated", level: "allow" }])
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-permission-always", "gated", { text: "always" }))
              : Stream.make(textDelta("after always"))
          }),
          echoExecutor,
          Approvals.testLayer({ check: () => Effect.die("permission-always call must not ask approvals") }),
          Permissions.interactive({
            ruleset: { rules: [], fallback: "ask" },
            onAsk: () => Effect.succeed({ _tag: "Always" }),
          }),
          Permissions.ruleStoreTestLayer({
            remember: (rule) =>
              Effect.sync(() => {
                remembered.push(rule)
              }),
          }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("preserves completion behavior when Steering is absent", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "no-steering-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "complete" }))

      expect(calls).toBe(1)
      expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "TurnCompleted", "Completed"])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.make(textDelta("done"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("leaves Session untouched when Compaction is absent", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "no-compaction-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "complete" }))
      const session = yield* Session.SessionStore

      expect(calls).toBe(1)
      expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "TurnCompleted", "Completed"])
      expect(yield* session.path()).toEqual([])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.make(textDelta("done"))
          }),
          Session.memoryLayer,
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("does not duplicate a pre-populated Session path when Compaction is active", () => {
    let calls = 0
    const seed = Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "seed" })] })
    return Effect.gen(function* () {
      const session = yield* Session.SessionStore
      yield* session.append({ _tag: "Message", message: seed })
      const agent = Agent.make({ name: "prepopulated-session-agent" })

      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "next", history: Prompt.fromMessages([seed]) }),
      )
      const path = yield* session.path()
      const seedEntries = path.filter(
        (entry) => entry._tag === "Message" && JSON.stringify(entry.message.content).includes("seed"),
      )

      expect(calls).toBe(1)
      expect(seedEntries).toHaveLength(1)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.make(textDelta("done"))
          }),
          Session.memoryLayer,
          Compaction.testLayer({ maybeCompact: () => Effect.succeed(Option.none()) }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("applies proactive compaction before a model call", () => {
    let prompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "proactive-compaction-agent" })

      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "original prompt", compaction: { contextWindow: 10 } }),
      )

      expect(prompt).toContain("compacted history")
      expect(prompt).toContain("compacted prompt")
      expect(prompt).not.toContain("original prompt")
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            prompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("done"))
          }),
          Compaction.testLayer({
            maybeCompact: () =>
              Effect.succeed(
                Option.some({
                  _tag: "Microcompact",
                  history: Prompt.make("compacted history"),
                  prompt: Prompt.make("compacted prompt"),
                }),
              ),
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("summarizes through the default Compaction layer and records a session boundary", () => {
    let streamCalls = 0
    let summaryCalls = 0
    let secondPrompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "default-compaction-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "old context" }))
      const session = yield* Session.SessionStore
      const path = yield* session.path()

      expect(streamCalls).toBe(2)
      expect(summaryCalls).toBe(1)
      expect(secondPrompt).toContain("<conversation-checkpoint>")
      expect(secondPrompt).toContain("checkpoint summary")
      expect(secondPrompt).toContain("tool-call-compact-summary")
      expect(path.some((entry) => entry._tag === "Compaction")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            (options) => {
              streamCalls += 1
              if (streamCalls === 1) {
                return Stream.make(
                  toolCallPart("tool-call-compact-summary", "echo", { text: "needs summary" }),
                  finishPart("stop", usage({ total: 100 }, { total: 1 })),
                )
              }
              secondPrompt = JSON.stringify(options.prompt.content)
              return Stream.make(textDelta("after compaction"))
            },
            (options) => {
              summaryCalls += 1
              expect(options.toolChoice).toBe("none")
              return Effect.succeed([{ type: "text", text: "checkpoint summary" }])
            },
          ),
          echoExecutor,
          Approvals.autoApprove,
          Session.memoryLayer,
          Compaction.layer({ contextWindow: 10, reserveTokens: 1, keepRecentTokens: 1 }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("keeps the seeded system message after a Summarize compaction", () => {
    let streamCalls = 0
    let secondPrompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "system-compaction-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "old context", system: "You are a careful test agent" }),
      )

      expect(streamCalls).toBe(2)
      expect(secondPrompt).toContain("<conversation-checkpoint>")
      expect(secondPrompt).toContain("You are a careful test agent")
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            (options) => {
              streamCalls += 1
              if (streamCalls === 1) {
                return Stream.make(
                  toolCallPart("tool-call-system-compact", "echo", { text: "needs summary" }),
                  finishPart("stop", usage({ total: 100 }, { total: 1 })),
                )
              }
              secondPrompt = JSON.stringify(options.prompt.content)
              return Stream.make(textDelta("after compaction"))
            },
            () => Effect.succeed([{ type: "text", text: "checkpoint summary" }]),
          ),
          echoExecutor,
          Approvals.autoApprove,
          Session.memoryLayer,
          Compaction.layer({ contextWindow: 10, reserveTokens: 1, keepRecentTokens: 1 }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("uses Compaction layer reserveTokens instead of the Agent default", () => {
    let streamCalls = 0
    let summaryCalls = 0
    let secondPrompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "reserve-compaction-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "old context" }))

      expect(streamCalls).toBe(2)
      expect(summaryCalls).toBe(0)
      expect(secondPrompt).not.toContain("<conversation-checkpoint>")
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            (options) => {
              streamCalls += 1
              if (streamCalls === 1) {
                return Stream.make(
                  toolCallPart("tool-call-reserve", "echo", { text: "reserve" }),
                  finishPart("stop", usage({ total: 10_000 }, { total: 1 })),
                )
              }
              secondPrompt = JSON.stringify(options.prompt.content)
              return Stream.make(textDelta("after reserve"))
            },
            () => {
              summaryCalls += 1
              return Effect.succeed([{ type: "text", text: "unexpected summary" }])
            },
          ),
          echoExecutor,
          Approvals.autoApprove,
          Session.memoryLayer,
          Compaction.layer({ contextWindow: 20_000, reserveTokens: 1, keepRecentTokens: 1 }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("reactively compacts and retries a pre-emission overflow once", () => {
    let calls = 0
    let overflowRequests = 0
    let retriedPrompt = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "reactive-compaction-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "too large" }))

      expect(calls).toBe(2)
      expect(overflowRequests).toBe(1)
      expect(retriedPrompt).toContain("after overflow")
      expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(1)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) return Stream.fail(contextOverflowError("maximum context length exceeded"))
            retriedPrompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("recovered"))
          }),
          Compaction.testLayer({
            maybeCompact: (request) =>
              Effect.sync(() => {
                if (request.overflow) overflowRequests += 1
                return Option.some({
                  _tag: "Microcompact",
                  history: Prompt.empty,
                  prompt: Prompt.make("after overflow"),
                })
              }),
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("fails after one reactive compaction retry", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "reactive-compaction-fail-agent" })

      const error = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "too large" })))

      expect(calls).toBe(2)
      expect(error._tag).toBe("@batonfx/core/AgentError")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.fail(contextOverflowError("context window overflow"))
          }),
          Compaction.testLayer({
            maybeCompact: () =>
              Effect.succeed(
                Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("retry") }),
              ),
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("does not retry overflow after partial emission", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "partial-overflow-agent" })

      const error = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "partial" })))

      expect(calls).toBe(1)
      expect(error._tag).toBe("@batonfx/core/AgentError")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.concat(
              Stream.make(textDelta("partial")),
              Stream.fail(contextOverflowError("context length exceeded")),
            )
          }),
          Compaction.testLayer({
            maybeCompact: () =>
              Effect.succeed(
                Option.some({ _tag: "Microcompact", history: Prompt.empty, prompt: Prompt.make("retry") }),
              ),
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("drains steering after tool calls and before tool results", () => {
    let calls = 0
    let secondMessages: ReadonlyArray<Prompt.Message> = []
    return Effect.gen(function* () {
      const steering = yield* Steering.Steering
      yield* steering.steer({ prompt: "steer one" })
      yield* steering.steer({ prompt: "steer two" })
      const agent = Agent.make({ name: "steering-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use tool" }))

      expect(calls).toBe(2)
      const secondPrompt = JSON.stringify(secondMessages)
      expect(secondPrompt).toContain("steer one")
      expect(secondPrompt).toContain("steer two")
      expect(secondPrompt).toContain("from model")
      const toolCallIndex = secondMessages.findIndex((message) => message.role === "assistant")
      const steerOneIndex = secondMessages.findIndex((message) => JSON.stringify(message.content).includes("steer one"))
      const steerTwoIndex = secondMessages.findIndex((message) => JSON.stringify(message.content).includes("steer two"))
      const toolResultIndex = secondMessages.findIndex((message) => message.role === "tool")
      expect(toolCallIndex).toBeGreaterThanOrEqual(0)
      expect(steerOneIndex).toBeGreaterThan(toolCallIndex)
      expect(steerTwoIndex).toBeGreaterThan(steerOneIndex)
      expect(toolResultIndex).toBeGreaterThan(steerTwoIndex)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-steer", "echo", { text: "from model" }))
            }
            secondMessages = options.prompt.content
            return Stream.make(textDelta("after steering"))
          }),
          echoExecutor,
          Approvals.autoApprove,
          Steering.layer({ steeringMode: "all" }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("steering one-at-a-time leaves later steering queued", () => {
    let calls = 0
    let secondPrompt = ""
    return Effect.gen(function* () {
      const steering = yield* Steering.Steering
      yield* steering.steer({ prompt: "first steer" })
      yield* steering.steer({ prompt: "second steer" })
      const agent = Agent.make({ name: "steering-one-agent", toolkit: Toolkit.make(echoTool) })

      yield* Stream.runDrain(Agent.stream(agent, { prompt: "use tool" }))
      const remaining = yield* steering.takeSteering()

      expect(secondPrompt).toContain("first steer")
      expect(secondPrompt).not.toContain("second steer")
      expect(remaining.map((message) => message.prompt)).toEqual(["second steer"])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-steering-one", "echo", { text: "from model" }))
            }
            secondPrompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("after first steering"))
          }),
          echoExecutor,
          Approvals.autoApprove,
          Steering.layer({ steeringMode: "one-at-a-time" }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("drains follow-up only when the run would otherwise complete", () => {
    let calls = 0
    const prompts: Array<string> = []
    return Effect.gen(function* () {
      const steering = yield* Steering.Steering
      yield* steering.followUp({ prompt: "follow one" })
      yield* steering.followUp({ prompt: "follow two" })
      const agent = Agent.make({ name: "follow-up-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "start" }))

      expect(calls).toBe(3)
      expect(prompts[1]).toContain("follow one")
      expect(prompts[2]).toContain("follow two")
      expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(3)
      const completed = events.at(-1)
      if (completed?._tag === "Completed") expect(completed.turns).toBe(3)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            prompts.push(JSON.stringify(options.prompt.content))
            calls += 1
            return Stream.make(textDelta(`turn ${calls}`))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          Steering.layer(),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("follow-up all mode combines queued follow-ups into one next turn", () => {
    let calls = 0
    let secondPrompt = ""
    return Effect.gen(function* () {
      const steering = yield* Steering.Steering
      yield* steering.followUp({ prompt: "follow one" })
      yield* steering.followUp({ prompt: "follow two" })
      const agent = Agent.make({ name: "follow-up-all-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "start" }))

      expect(calls).toBe(2)
      expect(secondPrompt).toContain("follow one")
      expect(secondPrompt).toContain("follow two")
      const completed = events.at(-1)
      if (completed?._tag === "Completed") expect(completed.turns).toBe(2)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 2) secondPrompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta(`turn ${calls}`))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          Steering.layer({ followUpMode: "all" }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("follow-up delays terminal structured output until follow-up is drained", () => {
    let calls = 0
    return Effect.gen(function* () {
      const steering = yield* Steering.Steering
      yield* steering.followUp({ prompt: "follow before object" })
      const agent = Agent.make({ name: "follow-up-structured-agent" })

      const events = yield* Stream.runCollect(Agent.streamObject(agent, { prompt: "start", schema: objectSchema }))

      expect(calls).toBe(2)
      expect(events.filter((event) => event._tag === "TurnStarted")).toHaveLength(2)
      const structured = events.find((event) => event._tag === "StructuredOutput")
      if (structured?._tag === "StructuredOutput") expect(structured.turn).toBe(2)
      const completed = events.at(-1)
      if (completed?._tag === "Completed") expect(completed.turns).toBe(3)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            () => {
              calls += 1
              return Stream.make(textDelta(`turn ${calls}`))
            },
            () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          Steering.layer(),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("interrupting Agent.stream preserves undrained steering queues", () => {
    let started: Deferred.Deferred<void> | undefined
    return Effect.gen(function* () {
      const currentStarted = yield* Deferred.make<void>()
      started = currentStarted
      const steering = yield* Steering.Steering
      yield* steering.steer({ prompt: "queued steering" })
      yield* steering.followUp({ prompt: "queued follow-up" })
      const agent = Agent.make({ name: "interrupt-steering-agent" })
      const run = Stream.runDrain(Agent.stream(agent, { prompt: "never finish" }))
      const fiber = yield* run.pipe(Effect.forkChild({ startImmediately: true }))

      yield* Deferred.await(currentStarted)
      yield* Fiber.interrupt(fiber)

      expect((yield* steering.takeSteering()).map((message) => message.prompt)).toEqual(["queued steering"])
      expect((yield* steering.takeFollowUp()).map((message) => message.prompt)).toEqual(["queued follow-up"])
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.fromEffect(
              started === undefined ? Effect.die("missing started Deferred") : Deferred.succeed(started, undefined),
            ).pipe(Stream.drain, Stream.concat(Stream.never)),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          Steering.layer(),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("interrupting Agent.stream while needsApproval awaits exits interrupted", () => {
    let started: Deferred.Deferred<void> | undefined
    const waitingApprovalTool = Tool.make("waiting-approval", {
      description: "Requires waiting approval",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
      needsApproval: () =>
        Effect.gen(function* () {
          if (started === undefined) return yield* Effect.die("missing started Deferred")
          yield* Deferred.succeed(started, undefined)
          return yield* Effect.never
        }),
    })
    return Effect.gen(function* () {
      const currentStarted = yield* Deferred.make<void>()
      started = currentStarted
      const agent = Agent.make({
        name: "interrupt-waiting-approval-agent",
        toolkit: Toolkit.make(waitingApprovalTool),
      })
      const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "needs approval" })).pipe(
        Effect.forkChild({ startImmediately: true }),
      )

      yield* Deferred.await(currentStarted)
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)

      expect(Exit.hasInterrupts(exit)).toBe(true)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.make(toolCallPart("tool-call-waiting-approval", "waiting-approval", { text: "wait" })),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("interrupting Agent.stream before the first model part exits interrupted", () => {
    let started: Deferred.Deferred<void> | undefined
    return Effect.gen(function* () {
      const currentStarted = yield* Deferred.make<void>()
      started = currentStarted
      const agent = Agent.make({ name: "external-interrupt-model-stream-agent" })
      const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "never emit" })).pipe(
        Effect.forkChild({ startImmediately: true }),
      )

      yield* Deferred.await(currentStarted)
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)

      expect(Exit.hasInterrupts(exit)).toBe(true)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.fromEffect(
              started === undefined ? Effect.die("missing started Deferred") : Deferred.succeed(started, undefined),
            ).pipe(Stream.drain, Stream.concat(Stream.never)),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("preserves interrupt causes while needsApproval is evaluating", () => {
    let started: Deferred.Deferred<void> | undefined
    const interruptibleApprovalTool = Tool.make("interruptible-approval", {
      description: "Requires interruptible approval",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
      needsApproval: () =>
        Effect.gen(function* () {
          if (started === undefined) return yield* Effect.die("missing started Deferred")
          yield* Deferred.succeed(started, undefined)
          return yield* Effect.interrupt
        }),
    })
    return Effect.gen(function* () {
      const currentStarted = yield* Deferred.make<void>()
      started = currentStarted
      const agent = Agent.make({
        name: "interrupt-approval-agent",
        toolkit: Toolkit.make(interruptibleApprovalTool),
      })
      const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "needs approval" })).pipe(
        Effect.forkChild({ startImmediately: true }),
      )

      yield* Deferred.await(currentStarted)
      const exit = yield* Fiber.await(fiber)

      expect(Exit.hasInterrupts(exit)).toBe(true)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.make(toolCallPart("tool-call-interrupt-approval", "interruptible-approval", { text: "wait" })),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("preserves interrupt causes before the first model part", () => {
    let started: Deferred.Deferred<void> | undefined
    return Effect.gen(function* () {
      const currentStarted = yield* Deferred.make<void>()
      started = currentStarted
      const agent = Agent.make({ name: "interrupt-model-stream-agent" })
      const fiber = yield* Stream.runDrain(Agent.stream(agent, { prompt: "never emit" })).pipe(
        Effect.forkChild({ startImmediately: true }),
      )

      yield* Deferred.await(currentStarted)
      const exit = yield* Fiber.await(fiber)

      expect(Exit.hasInterrupts(exit)).toBe(true)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.fromEffect(
              started === undefined ? Effect.die("missing started Deferred") : Deferred.succeed(started, undefined),
            ).pipe(Stream.drain, Stream.concat(Stream.fromEffect(Effect.interrupt))),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("aborts ToolContext signals when a running tool stream is interrupted", () => {
    let calls = 0
    let aborted = false
    return Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const agent = Agent.make({ name: "abort-agent", toolkit: Toolkit.make(echoTool) })
      const run = Stream.runDrain(Agent.stream(agent, { prompt: "abort the tool" })).pipe(
        Effect.provide(
          Layer.mergeAll(
            modelLayer(() => {
              calls += 1
              return Stream.make(toolCallPart("tool-call-abort", "echo", { text: "from model" }))
            }),
            ToolExecutor.testLayer({
              execute: () =>
                Effect.gen(function* () {
                  const context = yield* ToolContext.ToolContext
                  context.signal.addEventListener("abort", () => {
                    aborted = true
                  })
                  yield* Deferred.succeed(started, undefined)
                  yield* Effect.never
                  return { _tag: "Failure", message: "unreachable" }
                }),
            }),
            Approvals.autoApprove,
            ModelMiddleware.identityLayer,
          ),
        ),
      )

      const fiber = yield* run.pipe(Effect.forkChild({ startImmediately: true }))
      yield* Deferred.await(started)
      yield* Fiber.interrupt(fiber)

      expect(aborted).toBe(true)
    })
  })

  it.effect("spills large successful tool results before re-feeding them", () => {
    let calls = 0
    let stored: { readonly toolCallId: string; readonly content: unknown } | undefined
    let secondPrompt = ""
    const largeOutput = "x".repeat(256)
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "spill-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(
        Agent.stream(agent, { prompt: "use big tool", sessionId: "spill-session", toolOutputMaxBytes: 48 }),
      )

      const completed = events.find((event) => event._tag === "ToolExecutionCompleted")
      expect(stored).toEqual({
        toolCallId: "tool-call-spill",
        content: { result: largeOutput, encodedResult: largeOutput },
      })
      if (completed?._tag === "ToolExecutionCompleted") {
        expect(completed.result.encodedResult).toMatchObject({
          inline: { truncated: true, maxBytes: 48 },
          outputPaths: ["mem:tool-call-spill"],
        })
        expect(JSON.stringify(completed.result.encodedResult)).not.toContain(largeOutput)
      }
      expect(secondPrompt).toContain("mem:tool-call-spill")
      expect(secondPrompt).not.toContain(largeOutput)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-spill", "echo", { text: "from model" }))
            }
            secondPrompt = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("after spill"))
          }),
          ToolExecutor.testLayer({
            execute: () => Effect.succeed({ _tag: "Success", result: largeOutput, encodedResult: largeOutput }),
          }),
          ToolOutput.testLayer({
            put: (toolCallId, content) => {
              stored = { toolCallId, content }
              return Effect.succeed(Option.some(`mem:${toolCallId}`))
            },
          }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("accumulates usage across tool-calling turns", () => {
    let calls = 0
    const firstUsage = usage({ total: 10, uncached: 8 }, { total: 2 })
    const secondUsage = usage({ total: 7, cacheRead: 3 }, { total: 5, text: 4, reasoning: 1 })
    const expectedUsage = AgentEvent.addUsage(firstUsage, secondUsage)
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "multi-usage-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

      const turnCompleted = events.filter((event) => event._tag === "TurnCompleted")
      expect(turnCompleted).toHaveLength(2)
      if (turnCompleted[0]?._tag === "TurnCompleted") {
        expect(turnCompleted[0].usage).toEqual(firstUsage)
        expect(turnCompleted[0].finishReason).toBe("tool-calls")
      }
      if (turnCompleted[1]?._tag === "TurnCompleted") {
        expect(turnCompleted[1].usage).toEqual(secondUsage)
        expect(turnCompleted[1].finishReason).toBe("stop")
      }
      expect(events.filter((event) => event._tag === "ModelPart" && event.part.type === "finish")).toHaveLength(2)
      const completed = events.at(-1)
      if (completed?._tag === "Completed") {
        expect(completed.usage).toEqual(expectedUsage)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.fromIterable([
                  toolCallPart("tool-call-usage", "echo", { text: "from model" }),
                  finishPart("tool-calls", firstUsage),
                ])
              : Stream.fromIterable([textDelta("after tool"), finishPart("stop", secondUsage)])
          }),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("emits StructuredOutput immediately before Completed", () => {
    const structuredUsage = usage({ total: 3 }, { total: 1, text: 1 })
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "structured-agent" })

      const events = yield* Stream.runCollect(
        Agent.streamObject(agent, { prompt: "make object", schema: objectSchema }),
      )

      expect(events.map((event) => event._tag)).toEqual([
        "TurnStarted",
        "ModelPart",
        "TurnCompleted",
        "StructuredOutput",
        "Completed",
      ])
      const structuredIndex = events.findIndex((event) => event._tag === "StructuredOutput")
      expect(structuredIndex).toBe(events.length - 2)
      const structured = events[structuredIndex]
      if (structured?._tag === "StructuredOutput") {
        expect(structured.turn).toBe(1)
        expect(structured.value).toEqual({ ok: true })
        expect(structured.content.some((part) => part.type === "finish")).toBe(true)
      }
      const completed = events.at(-1)
      if (completed?._tag === "Completed") {
        expect(completed.text).toBe("normal answer")
        expect(completed.turns).toBe(2)
        expect(completed.usage).toEqual(structuredUsage)
        expect(JSON.stringify(completed.transcript.content)).toContain(Agent.defaultObjectPrompt)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            () => Stream.make(textDelta("normal answer")),
            () => Effect.succeed([{ type: "text", text: '{"ok":true}' }, finishPart("stop", structuredUsage)]),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("generateObject returns the typed structured value", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "generate-object-agent" })

      const result = yield* Agent.generateObject(agent, { prompt: "make typed object", schema: objectSchema })

      expect(result.text).toBe("normal answer")
      expect(result.turns).toBe(2)
      expect(result.value).toEqual({ ok: true })
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            () => Stream.make(textDelta("normal answer")),
            () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    ),
  )

  it.effect("runs the tool loop before the terminal structured turn", () => {
    let streamCalls = 0
    let structuredPrompt = ""
    const structuredUsage = usage({ total: 5 }, { total: 2 })
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "structured-tool-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(Agent.streamObject(agent, { prompt: "use tool", schema: objectSchema }))

      expect(streamCalls).toBe(2)
      expect(structuredPrompt).toContain("from model")
      expect(events.findIndex((event) => event._tag === "ToolExecutionCompleted")).toBeLessThan(
        events.findIndex((event) => event._tag === "StructuredOutput"),
      )
      const structured = events.find((event) => event._tag === "StructuredOutput")
      if (structured?._tag === "StructuredOutput") {
        expect(structured.turn).toBe(2)
        expect(structured.content.some((part) => part.type === "finish")).toBe(true)
      }
      const completed = events.at(-1)
      if (completed?._tag === "Completed") {
        expect(completed.text).toBe("after tool")
        expect(completed.turns).toBe(3)
        expect(completed.usage).toEqual(structuredUsage)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            () => {
              streamCalls += 1
              return streamCalls === 1
                ? Stream.make(toolCallPart("tool-call-structured", "echo", { text: "from model" }))
                : Stream.make(textDelta("after tool"))
            },
            (options) => {
              structuredPrompt = JSON.stringify(options.prompt.content)
              return Effect.succeed([{ type: "text", text: '{"ok":true}' }, finishPart("stop", structuredUsage)])
            },
          ),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("fails AgentError at the structured turn when schema decoding fails", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "structured-decode-agent" })

      const failure = yield* Effect.flip(
        Stream.runCollect(Agent.streamObject(agent, { prompt: "bad object", schema: objectSchema })),
      )

      expect(failure._tag).toBe("@batonfx/core/AgentError")
      if (failure._tag === "@batonfx/core/AgentError") {
        expect(failure.turn).toBe(1)
        expect(AiError.isAiError(failure.cause)).toBe(true)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            () => Stream.make(textDelta("normal answer")),
            () => Effect.succeed([{ type: "text", text: '{"ok":"nope"}' }]),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    ),
  )

  it.effect("performs the terminal structured turn after resume", () => {
    let calls = 0
    let sawResumedToolResult = false
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "resume-structured-agent", toolkit: Toolkit.make(echoTool) })

      const events = yield* Stream.runCollect(
        Agent.streamObject(agent, {
          prompt: "ignored original prompt",
          history: [
            { role: "system", content: "resume history system" },
            { role: "user", content: [{ type: "text", text: "earlier user input" }] },
          ],
          resume: { call: { id: "tool-call-resume-structured", name: "echo", params: { text: "resumed" } } },
          schema: objectSchema,
        }),
      )

      expect(calls).toBe(1)
      expect(sawResumedToolResult).toBe(true)
      expect(events.map((event) => event._tag)).toEqual([
        "ToolExecutionStarted",
        "ToolExecutionCompleted",
        "TurnCompleted",
        "TurnStarted",
        "ModelPart",
        "TurnCompleted",
        "StructuredOutput",
        "Completed",
      ])
      const structured = events.find((event) => event._tag === "StructuredOutput")
      if (structured?._tag === "StructuredOutput") expect(structured.turn).toBe(2)
      const completed = events.at(-1)
      if (completed?._tag === "Completed") {
        expect(completed.text).toBe("after resume")
        expect(completed.turns).toBe(3)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            (options) => {
              calls += 1
              sawResumedToolResult = sawResumedToolResult || JSON.stringify(options.prompt.content).includes("resumed")
              return Stream.make(textDelta("after resume"))
            },
            () => Effect.succeed([{ type: "text", text: '{"ok":true}' }]),
          ),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("uses ModelResilience for the terminal structured turn", () => {
    let structuredCalls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "resilient-structured-agent" })

      const events = yield* Stream.runCollect(
        Agent.streamObject(agent, { prompt: "retry object", schema: objectSchema }),
      )

      expect(structuredCalls).toBe(2)
      const structured = events.find((event) => event._tag === "StructuredOutput")
      if (structured?._tag === "StructuredOutput") expect(structured.value).toEqual({ ok: true })
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(
            () => Stream.make(textDelta("normal answer")),
            () => {
              structuredCalls += 1
              return structuredCalls === 1
                ? Effect.fail(transientModelError)
                : Effect.succeed([{ type: "text", text: '{"ok":true}' }])
            },
          ),
          unusedExecutor,
          Approvals.autoApprove,
          retryTransientModelError,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("fails typed on in-band stream error parts", () => {
    const streamError = new Error("stream exploded")
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "error-agent" })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "relay input" })))

      expect(failure._tag).toBe("@batonfx/core/AgentError")
      expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toContain("stream exploded")
      expect(failure._tag === "@batonfx/core/AgentError" && failure.turn).toBe(0)
      expect(failure._tag === "@batonfx/core/AgentError" && failure.cause).toBe(streamError)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() =>
            Stream.fromIterable([textDelta("partial"), Response.makePart("error", { error: streamError })]),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("fails typed when the stream channel fails", () => {
    const streamFailure = AiError.make({
      module: "TestLanguageModel",
      method: "streamText",
      reason: new AiError.UnknownError({ description: "stream channel exploded" }),
    })
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "channel-error-agent" })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "relay input" })))

      expect(failure._tag).toBe("@batonfx/core/AgentError")
      expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toContain("stream channel exploded")
      expect(failure._tag === "@batonfx/core/AgentError" && failure.cause).toBe(streamFailure)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.fail(streamFailure)))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("does not retry model failures when ModelResilience is absent", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "no-model-retry-agent" })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "retry absent" })))

      expect(calls).toBe(1)
      expect(failure._tag).toBe("@batonfx/core/AgentError")
      if (failure._tag === "@batonfx/core/AgentError") expect(failure.cause).toBe(transientModelError)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.fail(transientModelError)
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("retries model stream failures before any part is emitted", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "model-retry-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "retry model" }))

      expect(calls).toBe(2)
      const completed = events.at(-1)
      if (completed?._tag === "Completed") expect(completed.text).toBe("after retry")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1 ? Stream.fail(transientModelError) : Stream.make(textDelta("after retry"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          retryTransientModelError,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("surfaces terminal pre-emission model failures through AgentError", () => {
    let calls = 0
    let classifications = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "model-terminal-failure-agent" })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "terminal model" })))

      expect(calls).toBe(1)
      expect(classifications).toBe(1)
      expect(failure._tag).toBe("@batonfx/core/AgentError")
      if (failure._tag === "@batonfx/core/AgentError") expect(failure.cause).toBe(transientModelError)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.fail(transientModelError)
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelResilience.layer({
            retrySchedule: Schedule.recurs(3),
            classify: () => {
              classifications += 1
              return "terminal"
            },
          }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("does not retry model stream failures after a part is emitted", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "model-partial-failure-agent" })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "partial model" })))

      expect(calls).toBe(1)
      expect(failure._tag).toBe("@batonfx/core/AgentError")
      if (failure._tag === "@batonfx/core/AgentError") expect(failure.cause).toBe(transientModelError)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.make(textDelta("partial")).pipe(Stream.concat(Stream.fail(transientModelError)))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelResilience.layer({ retrySchedule: Schedule.recurs(3), classify: () => "transient" }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("does not retry in-band model error parts", () => {
    let calls = 0
    let classifications = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "model-in-band-error-agent" })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "in-band error" })))

      expect(calls).toBe(1)
      expect(classifications).toBe(0)
      expect(failure._tag).toBe("@batonfx/core/AgentError")
      if (failure._tag === "@batonfx/core/AgentError") expect(failure.cause).toBe(transientModelError)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.make(Response.makePart("error", { error: transientModelError }))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelResilience.layer({
            retrySchedule: Schedule.recurs(3),
            classify: () => {
              classifications += 1
              return "transient"
            },
          }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("wraps per-turn model overrides with ModelResilience", () => {
    let ambientCalls = 0
    let overrideCalls = 0
    const overrideModel = modelLayer(() => {
      overrideCalls += 1
      return overrideCalls === 1 ? Stream.fail(transientModelError) : Stream.make(textDelta("override ok"))
    })
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "override-model-retry-agent",
        toolkit: Toolkit.make(echoTool),
        policy: TurnPolicy.make(() => Effect.succeed(TurnPolicy.decision.continue({ model: overrideModel }))),
      })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use tool then override" }))

      expect(ambientCalls).toBe(1)
      expect(overrideCalls).toBe(2)
      const completed = events.at(-1)
      if (completed?._tag === "Completed") expect(completed.text).toBe("override ok")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            ambientCalls += 1
            return Stream.make(toolCallPart("tool-call-override-model", "echo", { text: "from model" }))
          }),
          echoExecutor,
          Approvals.autoApprove,
          retryTransientModelError,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("fails typed when the turn policy stops with pending tool results", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "policy-stop-agent",
        toolkit: Toolkit.make(echoTool),
        policy: TurnPolicy.recurs(0),
      })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "loop forever" })))

      expect(calls).toBe(1)
      expect(failure._tag).toBe("@batonfx/core/TurnLimitExceeded")
      if (failure._tag === "@batonfx/core/TurnLimitExceeded") {
        expect(failure.turn).toBe(1)
        expect(failure.pending).toEqual([{ tool_call_id: "tool-call-1", tool_name: "echo" }])
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return Stream.make(toolCallPart(`tool-call-${calls}`, "echo", { text: `call ${calls}` }))
          }),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("applies per-turn instruction overrides from the policy", () => {
    let calls = 0
    let secondCallSawInjectedSystem = false
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "override-agent",
        toolkit: Toolkit.make(echoTool),
        policy: TurnPolicy.make(() =>
          Effect.succeed(TurnPolicy.decision.continue({ instructions: "injected system content" })),
        ),
      })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

      expect(secondCallSawInjectedSystem).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-override", "echo", { text: "from model" }))
            }
            secondCallSawInjectedSystem = JSON.stringify(options.prompt.content).includes("injected system content")
            return Stream.make(textDelta("after override"))
          }),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("suspends when the executor returns Suspend", () =>
    Effect.gen(function* () {
      const agent = Agent.make({
        name: "suspend-agent",
        toolkit: Toolkit.make(echoTool),
      })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "wait please" })))

      expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
      if (failure._tag === "@batonfx/core/AgentSuspended") {
        expect(failure.token).toBe("wait-1")
        expect(failure.reason).toBe("tool-wait")
        expect(failure.tool_call_id).toBe("tool-call-wait")
        expect(failure.tool_name).toBe("echo")
        expect(failure.tool_params).toEqual({ text: "hold" })
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("tool-call-wait", "echo", { text: "hold" }))),
          ToolExecutor.testLayer({ execute: () => Effect.succeed({ _tag: "Suspend", token: "wait-1" }) }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    ),
  )

  it.effect("resumes a suspended run by executing the pending call first", () => {
    let calls = 0
    let sawOriginalPrompt = false
    let sawResumedToolResult = false
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "resume-agent",
        toolkit: Toolkit.make(echoTool),
      })

      const events = yield* Stream.runCollect(
        Agent.stream(agent, {
          prompt: "ignored original prompt",
          history: [
            { role: "system", content: "resume history system" },
            { role: "user", content: [{ type: "text", text: "earlier user input" }] },
          ],
          resume: { call: { id: "tool-call-resume", name: "echo", params: { text: "resumed" } } },
        }),
      )

      expect(calls).toBe(1)
      expect(sawOriginalPrompt).toBe(false)
      expect(sawResumedToolResult).toBe(true)
      expect(events.map((event) => event._tag)).toEqual([
        "ToolExecutionStarted",
        "ToolExecutionCompleted",
        "TurnCompleted",
        "TurnStarted",
        "ModelPart",
        "TurnCompleted",
        "Completed",
      ])
      const completed = events.at(-1)
      if (completed?._tag === "Completed") {
        expect(completed.text).toBe("after resume")
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            const content = JSON.stringify(options.prompt.content)
            sawOriginalPrompt = sawOriginalPrompt || content.includes("ignored original prompt")
            sawResumedToolResult = sawResumedToolResult || content.includes("resumed")
            return Stream.make(textDelta("after resume"))
          }),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("passes provider-executed tool calls through without local gating or execution", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "provider-tool-agent", toolkit: Toolkit.make(gatedTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "provider already handled it" }))

      expect(events.map((event) => event._tag)).toEqual(["TurnStarted", "ModelPart", "TurnCompleted", "Completed"])
      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
      const modelPart = events.find((event) => event._tag === "ModelPart")
      if (modelPart?._tag === "ModelPart" && modelPart.part.type === "tool-call") {
        expect(modelPart.part.providerExecuted).toBe(true)
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(providerToolCallPart("provider-call", "gated", { text: "done upstream" }))),
          unusedExecutor,
          Approvals.testLayer({ check: () => Effect.die("approvals must not be consulted") }),
          ModelMiddleware.identityLayer,
        ),
      ),
    ),
  )

  it.effect("evaluates needsApproval functions and executes when they return false", () => {
    let calls = 0
    let executed = 0
    let sawParams: unknown
    let sawToolCallId = ""
    let sawMessages = ""
    const dynamicTool = Tool.make("dynamic", {
      description: "Dynamic approval test tool",
      parameters: Schema.Struct({ amount: Schema.Number }),
      success: Schema.Unknown,
      needsApproval: (params, context) => {
        sawParams = params
        sawToolCallId = context.toolCallId
        sawMessages = JSON.stringify(context.messages)
        return params.amount > 100
      },
    })
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "dynamic-approval-agent", toolkit: Toolkit.make(dynamicTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "safe amount" }))

      expect(executed).toBe(1)
      expect(sawParams).toEqual({ amount: 10 })
      expect(sawToolCallId).toBe("tool-call-dynamic-safe")
      expect(sawMessages).toContain("safe amount")
      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-dynamic-safe", "dynamic", { amount: 10 }))
              : Stream.make(textDelta("safe executed"))
          }),
          ToolExecutor.testLayer({
            execute: () => {
              executed += 1
              return Effect.succeed({ _tag: "Success", result: { ok: true }, encodedResult: { ok: true } })
            },
          }),
          Approvals.testLayer({ check: () => Effect.die("approvals must not be consulted") }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("evaluates needsApproval functions and gates when they return true", () => {
    let calls = 0
    let approvals = 0
    const dynamicTool = Tool.make("dynamic-gated", {
      description: "Dynamic approval gated test tool",
      parameters: Schema.Struct({ amount: Schema.Number }),
      success: Schema.Unknown,
      needsApproval: (params) => params.amount > 100,
    })
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "dynamic-gated-agent", toolkit: Toolkit.make(dynamicTool) })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "large amount" }))

      expect(approvals).toBe(1)
      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-dynamic-gated", "dynamic-gated", { amount: 500 }))
              : Stream.make(textDelta("saw denial"))
          }),
          unusedExecutor,
          Approvals.testLayer({
            check: () => {
              approvals += 1
              return Effect.succeed({ _tag: "Denied" })
            },
          }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("fails closed when needsApproval functions throw or fail", () => {
    let approvals = 0
    let calls = 0
    const failingNeedsApproval = (() => Effect.fail(new Error("approval predicate failed"))) as unknown as (
      params: { readonly amount: number },
      context: Tool.NeedsApprovalContext,
    ) => boolean
    const throwingTool = Tool.make("throwing-approval", {
      description: "Throwing approval test tool",
      parameters: Schema.Struct({ amount: Schema.Number }),
      success: Schema.Unknown,
      needsApproval: () => {
        throw new Error("approval predicate exploded")
      },
    })
    const failingTool = Tool.make("failing-approval", {
      description: "Failing approval test tool",
      parameters: Schema.Struct({ amount: Schema.Number }),
      success: Schema.Unknown,
      needsApproval: failingNeedsApproval,
    })
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "fail-closed-agent",
        toolkit: Toolkit.make(throwingTool, failingTool),
      })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "needs approval fail closed" }))

      expect(approvals).toBe(2)
      expect(events.filter((event) => event._tag === "ApprovalRequested")).toHaveLength(2)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.fromIterable([
                  toolCallPart("tool-call-throwing", "throwing-approval", { amount: 1 }),
                  toolCallPart("tool-call-failing", "failing-approval", { amount: 1 }),
                ])
              : Stream.make(textDelta("saw denied dynamic approvals"))
          }),
          unusedExecutor,
          Approvals.testLayer({
            check: () => {
              approvals += 1
              return Effect.succeed({ _tag: "Denied" })
            },
          }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("executes needsApproval tools when approvals auto-approve", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "approval-agent",
        toolkit: Toolkit.make(gatedTool),
      })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the gated tool" }))

      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(true)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-gated", "gated", { text: "please" }))
              : Stream.make(textDelta("after approval"))
          }),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("re-feeds a failed tool result when approvals deny", () => {
    let calls = 0
    let secondCallSawDenial = false
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "denied-agent",
        toolkit: Toolkit.make(gatedTool),
      })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the gated tool" }))

      expect(secondCallSawDenial).toBe(true)
      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(true)
      expect(events.some((event) => event._tag === "ToolExecutionStarted")).toBe(false)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            if (calls === 1) {
              return Stream.make(toolCallPart("tool-call-denied", "gated", { text: "please" }))
            }
            secondCallSawDenial = JSON.stringify(options.prompt.content).includes("Tool call denied")
            return Stream.make(textDelta("saw denial"))
          }),
          unusedExecutor,
          Approvals.denyAll,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("suspends with reason approval when approvals return Pending", () =>
    Effect.gen(function* () {
      const agent = Agent.make({
        name: "pending-agent",
        toolkit: Toolkit.make(gatedTool),
      })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use the gated tool" })))

      expect(failure._tag).toBe("@batonfx/core/AgentSuspended")
      if (failure._tag === "@batonfx/core/AgentSuspended") {
        expect(failure.token).toBe("approval-1")
        expect(failure.reason).toBe("approval")
        expect(failure.tool_name).toBe("gated")
      }
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("tool-call-pending", "gated", { text: "please" }))),
          unusedExecutor,
          Approvals.testLayer({ check: () => Effect.succeed({ _tag: "Pending", token: "approval-1" }) }),
          ModelMiddleware.identityLayer,
        ),
      ),
    ),
  )

  it.effect("never consults approvals for tools without needsApproval", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "ungated-agent",
        toolkit: Toolkit.make(echoTool),
      })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" }))

      expect(events.some((event) => event._tag === "ApprovalRequested")).toBe(false)
      expect(events.at(-1)?._tag).toBe("Completed")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            calls += 1
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-ungated", "echo", { text: "please" }))
              : Stream.make(textDelta("done"))
          }),
          echoExecutor,
          Approvals.testLayer({ check: () => Effect.die("approvals must not be consulted") }),
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })
})
