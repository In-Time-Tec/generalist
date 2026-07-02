import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  Approvals,
  ModelMiddleware,
  ToolContext,
  ToolExecutor,
  ToolOutput,
  TurnPolicy,
} from "../src/index"

type ModelParams = Parameters<typeof Ai.LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]) =>
  Layer.effect(
    Ai.LanguageModel.LanguageModel,
    Ai.LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const echoTool = Ai.Tool.make("echo", {
  description: "Echo input for tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const gatedTool = Ai.Tool.make("gated", {
  description: "Requires approval",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
  needsApproval: true,
})

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
  Ai.Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const providerToolCallPart = (id: string, name: string, params: unknown) =>
  Ai.Response.makePart("tool-call", { id, name, params, providerExecuted: true })

const textDelta = (delta: string) => Ai.Response.makePart("text-delta", { id: "text", delta })

const usage = (
  inputTokens: Partial<Ai.Response.Usage["inputTokens"]>,
  outputTokens: Partial<Ai.Response.Usage["outputTokens"]>,
) =>
  new Ai.Response.Usage({
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

const finishPart = (reason: Ai.Response.FinishReason, reportedUsage: Ai.Response.Usage) =>
  Ai.Response.makePart("finish", { reason, usage: reportedUsage, response: undefined })

describe("Agent", () => {
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
        toolkit: Ai.Toolkit.make(echoTool),
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
      const agent = Agent.make({ name: "context-agent", toolkit: Ai.Toolkit.make(echoTool) })

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
    const handledTool = Ai.Tool.make("handled-context", {
      description: "Reads Baton ToolContext from a toolkit handler",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Unknown,
      dependencies: [ToolContext.ToolContext],
    })
    const toolkit = Ai.Toolkit.make(handledTool)
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
      const agent = Agent.make({ name: "gated-session-agent", toolkit: Ai.Toolkit.make(gatedTool) })

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

  it.effect("aborts ToolContext signals when a running tool stream is interrupted", () => {
    let calls = 0
    let aborted = false
    return Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const agent = Agent.make({ name: "abort-agent", toolkit: Ai.Toolkit.make(echoTool) })
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
      const agent = Agent.make({ name: "spill-agent", toolkit: Ai.Toolkit.make(echoTool) })

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
      const agent = Agent.make({ name: "multi-usage-agent", toolkit: Ai.Toolkit.make(echoTool) })

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
            Stream.fromIterable([textDelta("partial"), Ai.Response.makePart("error", { error: streamError })]),
          ),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("fails typed when the stream channel fails", () => {
    const streamFailure = Ai.AiError.make({
      module: "TestLanguageModel",
      method: "streamText",
      reason: new Ai.AiError.UnknownError({ description: "stream channel exploded" }),
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

  it.effect("fails typed when the turn policy stops with pending tool results", () => {
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "policy-stop-agent",
        toolkit: Ai.Toolkit.make(echoTool),
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
        toolkit: Ai.Toolkit.make(echoTool),
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
        toolkit: Ai.Toolkit.make(echoTool),
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
        toolkit: Ai.Toolkit.make(echoTool),
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
      const agent = Agent.make({ name: "provider-tool-agent", toolkit: Ai.Toolkit.make(gatedTool) })

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
    const dynamicTool = Ai.Tool.make("dynamic", {
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
      const agent = Agent.make({ name: "dynamic-approval-agent", toolkit: Ai.Toolkit.make(dynamicTool) })

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
    const dynamicTool = Ai.Tool.make("dynamic-gated", {
      description: "Dynamic approval gated test tool",
      parameters: Schema.Struct({ amount: Schema.Number }),
      success: Schema.Unknown,
      needsApproval: (params) => params.amount > 100,
    })
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "dynamic-gated-agent", toolkit: Ai.Toolkit.make(dynamicTool) })

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
      context: Ai.Tool.NeedsApprovalContext,
    ) => boolean
    const throwingTool = Ai.Tool.make("throwing-approval", {
      description: "Throwing approval test tool",
      parameters: Schema.Struct({ amount: Schema.Number }),
      success: Schema.Unknown,
      needsApproval: () => {
        throw new Error("approval predicate exploded")
      },
    })
    const failingTool = Ai.Tool.make("failing-approval", {
      description: "Failing approval test tool",
      parameters: Schema.Struct({ amount: Schema.Number }),
      success: Schema.Unknown,
      needsApproval: failingNeedsApproval,
    })
    return Effect.gen(function* () {
      const agent = Agent.make({
        name: "fail-closed-agent",
        toolkit: Ai.Toolkit.make(throwingTool, failingTool),
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
        toolkit: Ai.Toolkit.make(gatedTool),
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
        toolkit: Ai.Toolkit.make(gatedTool),
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
        toolkit: Ai.Toolkit.make(gatedTool),
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
        toolkit: Ai.Toolkit.make(echoTool),
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
