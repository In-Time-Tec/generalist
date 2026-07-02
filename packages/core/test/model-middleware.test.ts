import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, AgentEvent, Approvals, ModelMiddleware, ToolExecutor } from "../src/index"

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

const textDelta = (delta: string) => Ai.Response.makePart("text-delta", { id: "text", delta })

/** Appends a system-style marker carrying its turn to the prompt. */
const appendMarker = (text: string): ModelMiddleware.Middleware => ({
  transformPrompt: (prompt, context) =>
    Effect.succeed(
      Ai.Prompt.fromMessages([
        ...prompt.content,
        Ai.Prompt.makeMessage("system", { content: `${text} turn:${context.turn}` }),
      ]),
    ),
})

const uppercaseDeltas: ModelMiddleware.Middleware = {
  transformPart: (part) =>
    Effect.succeed(
      part.type === "text-delta"
        ? Option.some(Ai.Response.makePart("text-delta", { id: part.id, delta: part.delta.toUpperCase() }))
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
  transformPrompt: () => Effect.fail(new AgentEvent.AgentError({ message: "prompt middleware boom", turn: 0 })),
}

describe("ModelMiddleware", () => {
  it.effect("identity default: empty chain behaves like the pre-middleware loop", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "identity-agent" })

      const result = yield* Agent.generate(agent, { prompt: "hello" })

      expect(result.text).toBe("plain output")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("plain output"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    ),
  )

  it.effect("prompt transform: marker reaches the model with the correct turn per turn", () => {
    const prompts: Array<string> = []
    let calls = 0
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "prompt-agent", toolkit: Ai.Toolkit.make(echoTool) })

      yield* Agent.generate(agent, { prompt: "use the echo tool" })

      // Two turns ran: turn 0 (tool-call) and turn 1 (final text).
      expect(prompts).toHaveLength(2)
      expect(prompts[0]).toContain("scan turn:0")
      expect(prompts[1]).toContain("scan turn:1")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            calls += 1
            prompts.push(JSON.stringify(options.prompt.content))
            return calls === 1
              ? Stream.make(toolCallPart("tool-call-1", "echo", { text: "from model" }))
              : Stream.make(textDelta("done"))
          }),
          echoExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([appendMarker("scan")]),
        ),
      ),
    )
  })

  it.effect("part transform: uppercasing deltas flows to Completed.text and ModelPart events", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "uppercase-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "hello" }))

      const completed = events.at(-1)
      expect(completed?._tag === "Completed" && completed.text).toBe("HELLO WORLD")
      const modelPart = events.find((event) => event._tag === "ModelPart")
      expect(modelPart?._tag === "ModelPart" && modelPart.part.type === "text-delta" && modelPart.part.delta).toBe(
        "HELLO WORLD",
      )
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("hello world"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([uppercaseDeltas]),
        ),
      ),
    ),
  )

  it.effect("part drop: dropped text-deltas yield empty text and no delta events", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "drop-agent" })

      const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "hello" }))

      const completed = events.at(-1)
      expect(completed?._tag === "Completed" && completed.text).toBe("")
      const hasDelta = events.some((event) => event._tag === "ModelPart" && event.part.type === "text-delta")
      expect(hasDelta).toBe(false)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(textDelta("hidden"))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([dropDeltas]),
        ),
      ),
    ),
  )

  it.effect("ordering: two prompt middlewares apply in array order", () => {
    let seen = ""
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "ordering-agent" })

      yield* Agent.generate(agent, { prompt: "hello" })

      const aIndex = seen.indexOf("first")
      const bIndex = seen.indexOf("second")
      expect(aIndex).toBeGreaterThanOrEqual(0)
      expect(bIndex).toBeGreaterThan(aIndex)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer((options) => {
            seen = JSON.stringify(options.prompt.content)
            return Stream.make(textDelta("ok"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([appendMarker("first"), appendMarker("second")]),
        ),
      ),
    )
  })

  it.effect("tool-call drop guard: dropping a tool-call part fails the run", () =>
    Effect.gen(function* () {
      const agent = Agent.make({ name: "guard-agent", toolkit: Ai.Toolkit.make(echoTool) })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "use the echo tool" })))

      expect(failure._tag).toBe("@batonfx/core/AgentError")
      expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toContain("dropped a tool-call")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => Stream.make(toolCallPart("tool-call-guard", "echo", { text: "hi" }))),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([dropToolCalls]),
        ),
      ),
    ),
  )

  it.effect("middleware failure: transformPrompt failure fails the run before the model is called", () => {
    let modelCalled = false
    return Effect.gen(function* () {
      const agent = Agent.make({ name: "failing-agent" })

      const failure = yield* Effect.flip(Stream.runCollect(Agent.stream(agent, { prompt: "hello" })))

      expect(modelCalled).toBe(false)
      expect(failure._tag).toBe("@batonfx/core/AgentError")
      expect(failure._tag === "@batonfx/core/AgentError" && failure.message).toBe("prompt middleware boom")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          modelLayer(() => {
            modelCalled = true
            return Stream.make(textDelta("should not run"))
          }),
          unusedExecutor,
          Approvals.autoApprove,
          ModelMiddleware.layer([failingPrompt]),
        ),
      ),
    )
  })
})
