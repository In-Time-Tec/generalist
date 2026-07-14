import { expect, layer } from "@effect/vitest"
import { Json } from "./json"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, ModelMiddleware, ToolExecutor } from "../src/index"
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
  description: "Echo input for tests",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.Unknown,
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
  Response.makePart("tool-call", { id, name, params, providerExecuted: false })

const textDelta = (delta: string) => Response.makePart("text-delta", { id: "text", delta })

/** Appends a system-style marker carrying its turn to the prompt. */
const appendMarker = (text: string): ModelMiddleware.Middleware => ({
  transformPrompt: (prompt, context) =>
    Effect.succeed(
      Prompt.fromMessages([
        ...prompt.content,
        Prompt.makeMessage("system", { content: `${text} turn:${context.turn}` }),
      ]),
    ),
})

const uppercaseDeltas: ModelMiddleware.Middleware = {
  transformPart: (part) =>
    Effect.succeed(
      part.type === "text-delta"
        ? Option.some(Response.makePart("text-delta", { id: part.id, delta: part.delta.toUpperCase() }))
        : Option.some(part),
    ),
}

const dropDeltas: ModelMiddleware.Middleware = {
  transformPart: (part) => Effect.succeed(part.type === "text-delta" ? Option.none() : Option.some(part)),
}

const dropToolCalls: ModelMiddleware.Middleware = {
  transformPart: (part) => Effect.succeed(part.type === "tool-call" ? Option.none() : Option.some(part)),
}

const failingPrompt: ModelMiddleware.Middleware = {
  transformPrompt: () => Effect.fail(AgentEvent.AgentError.make({ message: "prompt middleware boom", turn: 0 })),
}

layer(unusedToolHandlerLayer)("ModelMiddleware", (it) => {
  ItLayer.make(
    it,
    "identity default: empty chain behaves like the pre-middleware loop",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("plain output"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "identity-agent" })

          const result = yield* Agent.generate(agent, { prompt: "hello" })

          expect(result.text).toBe("plain output")
        }),
      ] as const,
  )

  ItLayer.make(it, "prompt transform: marker reaches the model with the correct turn per turn", () => {
    const prompts: Array<string> = []
    let calls = 0
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          calls += 1
          prompts.push(Json.stringify(options.prompt.content))
          return calls === 1
            ? Stream.make(toolCallPart("tool-call-1", "echo", { text: "from model" }))
            : Stream.make(textDelta("done"))
        }),
        echoExecutor,
        Approvals.autoApprove,
        ModelMiddleware.layer([appendMarker("scan")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "prompt-agent", toolkit: Toolkit.make(echoTool) })

        yield* Agent.generate(agent, { prompt: "use the echo tool" })

        // Two turns ran: turn 0 (tool-call) and turn 1 (final text).
        expect(prompts).toHaveLength(2)
        expect(prompts[0]).toContain("scan turn:0")
        expect(prompts[1]).toContain("scan turn:1")
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "part transform: uppercasing deltas flows to Completed.text and ModelPart events",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("hello world"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([uppercaseDeltas]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "uppercase-agent" })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "hello" }))

          const completed = events.at(-1)
          expect(completed?._tag === "Completed" && completed.text).toBe("HELLO WORLD")
          const modelPart = events.find((event) => event._tag === "ModelPart")
          expect(modelPart?._tag === "ModelPart" && modelPart.part.type === "text-delta" && modelPart.part.delta).toBe(
            "HELLO WORLD",
          )
        }),
      ] as const,
  )

  ItLayer.make(
    it,
    "part drop: dropped text-deltas yield empty text and no delta events",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("hidden"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([dropDeltas]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "drop-agent" })

          const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "hello" }))

          const completed = events.at(-1)
          expect(completed?._tag === "Completed" && completed.text).toBe("")
          const hasDelta = events.some((event) => event._tag === "ModelPart" && event.part.type === "text-delta")
          expect(hasDelta).toBe(false)
        }),
      ] as const,
  )

  ItLayer.make(it, "ordering: two prompt middlewares apply in array order", () => {
    let seen = ""
    return [
      Layer.mergeAll(
        modelLayer((options) => {
          seen = Json.stringify(options.prompt.content)
          return Stream.make(textDelta("ok"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.layer([appendMarker("first"), appendMarker("second")]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "ordering-agent" })

        yield* Agent.generate(agent, { prompt: "hello" })

        const aIndex = seen.indexOf("first")
        const bIndex = seen.indexOf("second")
        expect(aIndex).toBeGreaterThanOrEqual(0)
        expect(bIndex).toBeGreaterThan(aIndex)
      }),
    ] as const
  })

  ItLayer.make(
    it,
    "tool-call drop guard: dropping a tool-call part fails the run",
    () =>
      [
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("tool-call-guard", "echo", { text: "hi" }))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([dropToolCalls]),
        ),
        Effect.gen(function* () {
          const agent = Agent.make({ name: "guard-agent", toolkit: Toolkit.make(echoTool) })

          const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" })))

          expect(failure._tag).toBe("@batonfx/core/MiddlewareViolation")
          if (failure._tag === "@batonfx/core/MiddlewareViolation") {
            expect(failure.turn).toBe(0)
            expect(failure.detail).toContain("tool-call")
          }
        }),
      ] as const,
  )

  ItLayer.make(it, "middleware failure: transformPrompt failure fails the run before the model is called", () => {
    let modelCalled = false
    return [
      Layer.mergeAll(
        modelLayer(() => {
          modelCalled = true
          return Stream.make(textDelta("should not run"))
        }),
        unusedExecutor,
        Approvals.autoApprove,
        ModelMiddleware.layer([failingPrompt]),
      ),
      Effect.gen(function* () {
        const agent = Agent.make({ name: "failing-agent" })

        const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "hello" })))

        expect(modelCalled).toBe(false)
        expect(failure._tag).toBe("@batonfx/core/AgentError")
        expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toBe("prompt middleware boom")
      }),
    ] as const
  })
})
