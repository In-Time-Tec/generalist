import { expect, layer } from "@effect/vitest"
import { Json } from "./json"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Guardrail, ModelMiddleware, ToolExecutor } from "../src/index"
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

const echoTool = Tool.make("echo", {
  description: "Echo input for guardrail tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
})

const echoExecutor = ToolExecutor.layerTest({
  execute: (request) =>
    Effect.succeed({
      _tag: "Success",
      result: { echoed: request.call.params },
      encodedResult: { echoed: request.call.params },
    }),
})

const unusedExecutor = ToolExecutor.layerTest({
  execute: () => Effect.die("unexpected tool execution"),
})

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

const toolCallPart = (id: string, name: string, params: unknown) =>
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

layer(unusedToolHandlerLayer)("Guardrail", (it) => {
  ItLayer.make(it, "validateInput allows Option.none and receives context", () => {
    let modelCalled = false
    let seenContext: ModelMiddleware.TurnContext | undefined
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalled = true
          return Stream.make(textDelta("ok"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([
          Guardrail.validateInput((_prompt, context) => {
            seenContext = context
            return Effect.succeed(Option.none())
          }),
        ]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "guardrail-allow-agent" })

        const result = yield* Agent.generate(agent, { prompt: "allowed" })

        expect(result.text).toBe("ok")
        expect(modelCalled).toBe(true)
        expect(seenContext).toEqual({ agentName: "guardrail-allow-agent", turn: 0 })
      }),
    ] as const
  })

  ItLayer.make(it, "validateInput blocks before model invocation with the supplied reason", () => {
    let modelCalled = false
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalled = true
          return Stream.make(textDelta("should not run"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([Guardrail.validateInput(() => Effect.succeed(Option.some("blocked by policy")))]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "guardrail-block-agent" })

        const failure = yield* Effect.flip(Agent.generate(agent, { prompt: "blocked" }))

        expect(modelCalled).toBe(false)
        expect(failure._tag).toBe("@batonfx/core/AgentError")
        if (failure._tag === "@batonfx/core/AgentError") {
          expect(failure.turn).toBe(0)
          expect(failure.message).toContain("blocked by policy")
        }
      }),
    ] as const
  })

  ItLayer.make(it, "redactInput rewrites prompt text sent to the model", () => {
    let seenPrompt = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          seenPrompt = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("ok"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([Guardrail.redactInput({ pattern: /\d{3}-\d{2}-\d{4}/g })]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "redact-input-agent" })

        yield* Agent.generate(agent, { prompt: "secret 123-45-6789" })

        expect(seenPrompt).not.toContain("123-45-6789")
        expect(seenPrompt).toContain("[redacted]")
      }),
    ] as const
  })

  it.effect("redactInput rewrites text-bearing prompt fields without corrupting tool payloads", () => {
    const middleware = Guardrail.redactInput({ pattern: /secret/g, replacement: "MASK" })
    const file = Prompt.makePart("file", {
      mediaType: "text/plain",
      fileName: "secret-file.txt",
      data: "secret file data",
    })
    const toolCall = Prompt.makePart("tool-call", {
      id: "call-secret",
      name: "echo",
      params: { text: "secret params" },
      providerExecuted: false,
    })
    const toolResult = Prompt.makePart("tool-result", {
      id: "result-secret",
      name: "echo",
      isFailure: false,
      result: { text: "secret result" },
    })
    return Effect.gen(function* () {
      const redacted = yield* middleware.transformPrompt!(
        Prompt.fromMessages([
          Prompt.makeMessage("system", { content: "system secret" }),
          Prompt.makeMessage("user", {
            content: [Prompt.makePart("text", { text: "user secret" }), file],
          }),
          Prompt.makeMessage("assistant", {
            content: [
              Prompt.makePart("text", { text: "assistant secret" }),
              Prompt.makePart("reasoning", { text: "reasoning secret" }),
              toolCall,
            ],
          }),
          Prompt.makeMessage("tool", {
            content: [
              toolResult,
              Prompt.makePart("tool-approval-response", {
                approvalId: "approval-secret",
                approved: false,
                reason: "approval secret",
              }),
            ],
          }),
        ]),
        { agentName: "redact", turn: 0 },
      )

      const [system, user, assistant, tool] = redacted.content
      expect(system?.role === "system" && system.content).toBe("system MASK")
      if (user?.role === "user") {
        const [text, preservedFile] = user.content
        expect(text?.type === "text" && text.text).toBe("user MASK")
        expect(preservedFile).toBe(file)
      }
      if (assistant?.role === "assistant") {
        const [text, reasoning, preservedToolCall] = assistant.content
        expect(text?.type === "text" && text.text).toBe("assistant MASK")
        expect(reasoning?.type === "reasoning" && reasoning.text).toBe("reasoning MASK")
        expect(preservedToolCall).toBe(toolCall)
      }
      if (tool?.role === "tool") {
        const [preservedToolResult, approval] = tool.content
        expect(preservedToolResult).toBe(toolResult)
        expect(approval?.type === "tool-approval-response" && approval.reason).toBe("approval MASK")
      }
    })
  })

  ItLayer.make(
    it,
    "redactOutput rewrites ModelPart deltas and Completed text",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("token secret"))),
          unusedExecutor,
          Approvals.layerAutoApprove,
          ModelMiddleware.layer([Guardrail.redactOutput({ pattern: /secret/g })]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "redact-output-agent" })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "hello" }))

          const modelPart = events.find((event) => event._tag === "ModelPart")
          expect(modelPart?._tag === "ModelPart" && modelPart.part.type === "text-delta" && modelPart.part.delta).toBe(
            "token [redacted]",
          )
          const completed = events.at(-1)
          expect(completed?._tag === "Completed" && completed.text).toBe("token [redacted]")
        }),
      ] as const,
  )

  ItLayer.make(it, "filterOutput drops non-tool parts and receives context", () => {
    const contexts: Array<ModelMiddleware.TurnContext> = []
    return [
      Layer.mergeAll(
        modelLayer(() => Stream.fromIterable([textDelta("keep"), textDelta("drop")])),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([
          Guardrail.filterOutput((part, context) => {
            contexts.push(context)
            return part.type !== "text-delta" || part.delta !== "drop"
          }),
        ]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "filter-agent" })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "hello" }))

        const deltas = events.filter((event) => event._tag === "ModelPart" && event.part.type === "text-delta")
        expect(deltas).toHaveLength(1)
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("keep")
        expect(contexts).toEqual([
          { agentName: "filter-agent", turn: 0 },
          { agentName: "filter-agent", turn: 0 },
        ])
      }),
    ] as const
  })

  ItLayer.make(it, "filterOutput never drops tool-call parts", () => {
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-filter", "echo", { text: "from model" }))
            : Stream.make(textDelta("hidden"))
        }),
        echoExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([Guardrail.filterOutput(() => false)]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "filter-tool-agent", toolkit: Toolkit.make(echoTool) })

        const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "use tool" }))

        expect(events.some((event) => event._tag === "ToolExecutionCompleted")).toBe(true)
        const completed = events.at(-1)
        expect(completed?._tag === "Completed" && completed.text).toBe("")
      }),
    ] as const
  })

  ItLayer.make(it, "guardrails compose in middleware order", () => {
    let modelCalled = false
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalled = true
          return Stream.make(textDelta("ok"))
        }),
        unusedExecutor,
        Approvals.layerAutoApprove,
        ModelMiddleware.layer([
          Guardrail.redactInput({ pattern: /secret/g, replacement: "safe" }),
          Guardrail.validateInput((prompt) =>
            Effect.succeed(
              Json.stringify(prompt.content).includes("secret") ? Option.some("secret left") : Option.none(),
            ),
          ),
        ]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "ordered-guardrails-agent" })

        const result = yield* Agent.generate(agent, { prompt: "secret" })

        expect(result.text).toBe("ok")
        expect(modelCalled).toBe(true)
      }),
    ] as const
  })
})
