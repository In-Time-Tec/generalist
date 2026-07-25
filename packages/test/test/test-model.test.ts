import { expect, layer } from "@effect/vitest"
import { Cause, Context, Effect, Exit, Fiber, Layer, Schedule, Schema, Stream } from "effect"
import {
  Agent,
  AiError,
  Compaction,
  LanguageModel,
  ModelRegistry,
  ModelResilience,
  Prompt,
  Response,
  Session,
  Steering,
  Tool,
  Toolkit,
} from "@batonfx/core"
import { TestModel } from "@batonfx/test"

const echoTool = Tool.make("echo", {
  description: "Echo test input",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})

const echoToolkit = Toolkit.make(echoTool)

class Fixture extends Context.Service<Fixture, TestModel.Fixture>()("@batonfx/test/test/test-model.test/Fixture") {}

const fixtureLayer = (
  script: ReadonlyArray<TestModel.Step>,
  options?: TestModel.MakeOptions,
): Layer.Layer<Fixture | LanguageModel.LanguageModel | ModelRegistry.ModelRegistry> =>
  Layer.unwrap(
    TestModel.make(script, options).pipe(
      Effect.map((fixture) => Layer.mergeAll(Layer.succeed(Fixture, fixture), fixture.layer, fixture.registryLayer)),
    ),
  )

const jsonString = (value: unknown) => Schema.encodeEffect(Schema.UnknownFromJsonString)(value)

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const entry = (id: string, message: Prompt.Message): Session.MessageEntry => ({
  _tag: "Message",
  id,
  parentId: id === "0" ? null : String(Number(id) - 1),
  message,
})

const planExecuted: Array<string> = []

layer(
  fixtureLayer([TestModel.toolCall("echo", { text: "from model" }, { id: "echo-1" }), TestModel.text("done")]).pipe(
    Layer.merge(
      echoToolkit.toLayer({
        echo: ({ text }) => Effect.sync(() => planExecuted.push(text)).pipe(Effect.as(text)),
      }),
    ),
  ),
)("TestModel: PLAN tool-call script", (it) => {
  it.effect("runs the script and captures normalized prompts", () =>
    Effect.gen(function* () {
      const fixture = yield* Fixture
      const agent = Agent.make({ name: "scripted-agent", toolkit: echoToolkit })

      const result = yield* Agent.generate(agent, { prompt: "start" })
      const requests = yield* fixture.requests

      expect(result.text).toBe("done")
      expect(planExecuted).toEqual(["from model"])
      expect(requests.map((request) => request.operation)).toEqual(["streamText", "streamText"])
      expect(yield* jsonString(requests[1]?.prompt)).toContain("from model")
      expect(requests[0]?.tools.map((tool) => tool.name)).toContain("echo")
    }),
  )
})

layer(
  fixtureLayer([
    TestModel.turn([TestModel.text("streamed")], {
      finishReason: "length",
      usage: Response.Usage.make({
        inputTokens: { uncached: 4, total: 4, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 2, text: 2, reasoning: undefined },
      }),
    }),
    TestModel.turn([TestModel.text("generated")], { finishReason: "stop" }),
  ]),
)("TestModel: grouped turns", (it) => {
  it.effect("compiles explicit finish usage for stream and generate", () =>
    Effect.gen(function* () {
      const streamed = yield* LanguageModel.streamText({ prompt: "one" }).pipe(Stream.runCollect)
      const generated = yield* LanguageModel.generateText({ prompt: "two" })
      const reportedUsage = streamed.find((part) => part.type === "finish")?.usage

      expect(streamed.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end", "finish"])
      expect(streamed.at(-1)?.type).toBe("finish")
      expect(reportedUsage?.inputTokens.total).toBe(4)
      expect(reportedUsage?.outputTokens.total).toBe(2)
      expect(generated.text).toBe("generated")
      expect(generated.finishReason).toBe("stop")
    }),
  )
})

layer(Layer.empty)("TestModel: truncated scripts", (it) => {
  const collect = (step: TestModel.Step) =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([step])
      const services = yield* Layer.build(fixture.layer)
      return yield* LanguageModel.streamText({ prompt: "go" }).pipe(
        Stream.runCollect,
        Effect.provide(services),
        Effect.map((parts) => [...parts]),
      )
    })

  it.effect("never emits a finish part for a truncated step", () =>
    Effect.gen(function* () {
      const midText = yield* collect(
        TestModel.truncated([TestModel.text("half a sentence")], { stopAfter: "text-delta" }),
      )
      const midReasoning = yield* collect(
        TestModel.truncated([TestModel.reasoning("half a thought")], { stopAfter: "reasoning-delta" }),
      )
      const beforeContent = yield* collect(TestModel.truncated([], { stopAfter: "response-metadata" }))

      expect(midText.some((part) => part.type === "finish")).toBe(false)
      expect(midText.map((part) => part.type)).toEqual(["response-metadata", "text-start", "text-delta"])
      expect(midReasoning.some((part) => part.type === "finish")).toBe(false)
      expect(midReasoning.map((part) => part.type)).toEqual(["response-metadata", "reasoning-start", "reasoning-delta"])
      expect(beforeContent.map((part) => part.type)).toEqual(["response-metadata"])
    }),
  )

  it.effect("stops a truncated tool call after unclosed parameter JSON", () =>
    Effect.gen(function* () {
      const parts = yield* collect(
        TestModel.truncated([TestModel.toolCall("write", { path: "plans/019-model-stream.md" }, { id: "write-1" })], {
          stopAfter: "tool-params-delta",
        }),
      )

      expect(parts.map((part) => part.type)).toEqual(["response-metadata", "tool-params-start", "tool-params-delta"])
      expect(parts.some((part) => part.type === "finish")).toBe(false)
      const delta = parts.find((part) => part.type === "tool-params-delta")
      expect(delta?.type === "tool-params-delta" && delta.delta).toBe('{"path":"plans/019-model-stream.md"')
      expect(() => JSON.parse(delta?.type === "tool-params-delta" ? delta.delta : "")).toThrow()
    }),
  )

  it.effect("keeps earlier parts of a truncated turn intact", () =>
    Effect.gen(function* () {
      const parts = yield* collect(
        TestModel.truncated([TestModel.reasoning("planning"), TestModel.text("answer begins")], {
          stopAfter: "text-delta",
        }),
      )

      expect(parts.map((part) => part.type)).toEqual([
        "response-metadata",
        "reasoning-start",
        "reasoning-delta",
        "reasoning-end",
        "text-start",
        "text-delta",
      ])
    }),
  )
})

layer(Layer.empty)("Agent runs over a truncated provider stream", (it) => {
  const runTruncated = (step: TestModel.Step) =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([step])
      const services = yield* Layer.build(
        Layer.mergeAll(fixture.layer, echoToolkit.toLayer({ echo: ({ text }) => Effect.succeed(text) })),
      )
      const events: Array<unknown> = []
      const exit = yield* Agent.stream(Agent.make({ name: "truncated-agent", toolkit: echoToolkit }), {
        prompt: "go",
      }).pipe(
        Stream.tap((event) => Effect.sync(() => events.push(event))),
        Stream.runDrain,
        Effect.provide(services),
        Effect.exit,
      )
      return { exit, events }
    })

  it.effect("fails the run when the stream is cut mid-text", () =>
    Effect.gen(function* () {
      const { exit, events } = yield* runTruncated(
        TestModel.truncated([TestModel.text("half an answer")], { stopAfter: "text-delta" }),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(events.some((event) => (event as { _tag: string })._tag === "Completed")).toBe(false)
    }),
  )

  it.effect("fails the run when the stream is cut mid-reasoning", () =>
    Effect.gen(function* () {
      const { exit, events } = yield* runTruncated(
        TestModel.truncated([TestModel.reasoning("still thinking")], { stopAfter: "reasoning-delta" }),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(events.some((event) => (event as { _tag: string })._tag === "Completed")).toBe(false)
    }),
  )

  it.effect("fails the run when a tool call is cut mid-parameters and never runs the tool", () =>
    Effect.gen(function* () {
      const { exit, events } = yield* runTruncated(
        TestModel.truncated([TestModel.toolCall("echo", { text: "never runs" }, { id: "echo-cut" })], {
          stopAfter: "tool-params-delta",
        }),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(events.some((event) => (event as { _tag: string })._tag === "ToolExecutionStarted")).toBe(false)
      expect(events.some((event) => (event as { _tag: string })._tag === "Completed")).toBe(false)
    }),
  )

  it.effect("never reports a completed run with empty output when the stream produced nothing", () =>
    Effect.gen(function* () {
      const { exit, events } = yield* runTruncated(TestModel.truncated([], { stopAfter: "response-metadata" }))

      expect(Exit.isFailure(exit)).toBe(true)
      expect(events.some((event) => (event as { _tag: string })._tag === "Completed")).toBe(false)
    }),
  )
})

layer(Layer.empty)("TestModel: remaining behavior", (it) => {
  it.effect("emits reasoning separately from assistant text and preserves it in the next prompt", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([
        TestModel.turn([
          TestModel.reasoning("I should call echo"),
          TestModel.toolCall("echo", { text: "reasoned" }, { id: "reasoning-call" }),
        ]),
        TestModel.turn([TestModel.reasoning("The tool answered"), TestModel.text("final answer")]),
      ])
      const services = yield* Layer.build(
        Layer.mergeAll(
          fixture.layer,
          fixture.registryLayer,
          echoToolkit.toLayer({ echo: ({ text }) => Effect.succeed(text) }),
        ),
      )
      const events = yield* Agent.stream(Agent.make({ name: "reasoning-agent", toolkit: echoToolkit }), {
        prompt: "think",
      }).pipe(Stream.runCollect, Effect.provide(services))
      const modelParts = events.filter((event) => event._tag === "ModelPart").map((event) => event.part)
      const requests = yield* fixture.requests

      expect(modelParts.map((part) => part.type)).toEqual([
        "reasoning-start",
        "reasoning-delta",
        "reasoning-end",
        "tool-call",
        "finish",
        "reasoning-start",
        "reasoning-delta",
        "reasoning-end",
        "text-start",
        "text-delta",
        "text-end",
        "finish",
      ])
      expect(events.find((event) => event._tag === "Completed")?.text).toBe("final answer")
      const prompt = yield* jsonString(requests[1]?.prompt)
      expect(prompt).toContain('"text":"I should call echo"')
      expect(prompt).toContain('"type":"reasoning"')
    }),
  )

  it.effect("decodes structured objects and rejects operation mismatches", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([TestModel.object({ answer: "yes" }), TestModel.object({ bad: true })])
      const services = yield* Layer.build(fixture.layer)
      const response = yield* LanguageModel.generateObject({
        prompt: "structured",
        objectName: "answer",
        schema: Schema.Struct({ answer: Schema.String }),
      }).pipe(Effect.provide(services))
      const mismatch = yield* Effect.flip(
        LanguageModel.generateText({ prompt: "plain" }).pipe(Effect.provide(services)),
      )

      expect(response.value).toEqual({ answer: "yes" })
      expect(mismatch.reason._tag).toBe("InvalidRequestError")
      expect((yield* fixture.requests).map((request) => request.operation)).toEqual(["generateObject", "generateText"])
    }),
  )

  it.effect("consumes scripted failures, captures exhaustion, and continues with the next slot", () =>
    Effect.gen(function* () {
      const scriptedError = AiError.make({
        module: "test",
        method: "generateText",
        reason: AiError.UnknownError.make({ description: "retry me" }),
      })
      const fixture = yield* TestModel.make([TestModel.failure(scriptedError), TestModel.text("recovered")])
      const services = yield* Layer.build(fixture.layer)

      const first = yield* Effect.flip(LanguageModel.generateText({ prompt: "first" }).pipe(Effect.provide(services)))
      const second = yield* LanguageModel.generateText({ prompt: "second" }).pipe(Effect.provide(services))
      const exhausted = yield* Effect.flip(
        LanguageModel.generateText({ prompt: "third" }).pipe(Effect.provide(services)),
      )

      expect(first).toBe(scriptedError)
      expect(second.text).toBe("recovered")
      expect(exhausted.reason._tag).toBe("InvalidRequestError")
      expect(yield* fixture.remaining).toBe(0)
      expect(yield* fixture.requests).toHaveLength(3)
    }),
  )

  it.effect("feeds retryable failures through ModelResilience into the next script slot", () =>
    Effect.gen(function* () {
      const retryable = AiError.make({
        module: "test",
        method: "generateText",
        reason: AiError.RateLimitError.make({}),
      })
      const fixture = yield* TestModel.make([TestModel.failure(retryable), TestModel.text("retried")])
      const services = yield* Layer.build(fixture.layer)
      const model = yield* LanguageModel.LanguageModel.pipe(Effect.provide(services))
      const resilient = ModelResilience.apply(model, ModelResilience.make({ retrySchedule: Schedule.recurs(1) }))

      const response = yield* resilient.generateText({ prompt: "retry request" })
      const requests = yield* fixture.requests

      expect(response.text).toBe("retried")
      expect(requests).toHaveLength(2)
      expect(requests.map((request) => JSON.stringify(request.prompt))).toSatisfy((prompts: ReadonlyArray<string>) =>
        prompts.every((prompt) => prompt.includes("retry request")),
      )
    }),
  )

  it.effect("claims concurrent requests atomically and wakes request waiters", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([
        TestModel.turn([TestModel.text("one")], { delay: "1 hour" }),
        TestModel.text("two"),
      ])
      const services = yield* Layer.build(fixture.layer)
      const first = yield* LanguageModel.generateText({ prompt: "first" }).pipe(
        Effect.provide(services),
        Effect.forkChild,
      )

      const entered = yield* fixture.awaitRequests(1)
      const second = yield* LanguageModel.generateText({ prompt: "second" }).pipe(Effect.provide(services))
      yield* Fiber.interrupt(first)

      expect(entered.map((request) => request.index)).toEqual([0])
      expect(second.text).toBe("two")
      expect((yield* fixture.requests).map((request) => request.index)).toEqual([0, 1])
    }),
  )

  it.effect("reports invalid request counts as TypeError defects", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([])
      const exit = yield* Effect.exit(fixture.awaitRequests(-1))

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(exit.cause.reasons.find(Cause.isDieReason)?.defect).toBeInstanceOf(TypeError)
      }
    }),
  )

  it.effect("keeps fixture state across model registry resolution and layer rebuilds", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([TestModel.text("one"), TestModel.text("two")], {
        provider: "fixture",
        model: "shared",
        registrationKey: "ci",
        metadata: { suite: "registry" },
      })
      const services = yield* Layer.build(fixture.registryLayer)
      const call = (prompt: string) =>
        ModelRegistry.operate(fixture.selection, LanguageModel.generateText({ prompt })).pipe(Effect.provide(services))

      const first = yield* call("first")
      const second = yield* call("second")

      expect(first.text).toBe("one")
      expect(second.text).toBe("two")
      expect(fixture.registration.metadata).toEqual({ suite: "registry" })
      expect(yield* fixture.requests).toHaveLength(2)
    }),
  )

  it.effect("captures steering drains in the next model prompt", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([
        TestModel.toolCall("echo", { text: "tool input" }),
        TestModel.text("after steering"),
      ])
      const services = yield* Layer.build(
        Layer.mergeAll(
          fixture.layer,
          fixture.registryLayer,
          echoToolkit.toLayer({ echo: ({ text }) => Effect.succeed(text) }),
          Steering.layer(),
        ),
      )
      const events = yield* Effect.gen(function* () {
        const steering = yield* Steering.Steering
        yield* steering.steer({ prompt: "steer one" })
        yield* steering.steer({ prompt: "steer two" })
        return yield* Agent.stream(Agent.make({ name: "steered", toolkit: echoToolkit }), {
          prompt: "start",
        }).pipe(Stream.runCollect)
      }).pipe(Effect.provide(services))
      const requests = yield* fixture.requests

      expect(events).toContainEqual(expect.objectContaining({ _tag: "SteeringDrained", queue: "steering", count: 2 }))
      const prompt = yield* jsonString(requests[1]?.prompt)
      expect(prompt).toContain("steer one")
      expect(prompt).toContain("steer two")
    }),
  )

  it.effect("captures structured compaction requests without tools", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([
        TestModel.object({
          goal: "Ship the test kit",
          facts: ["Requests are captured"],
          decisions: ["Use Effect layers"],
          openQuestions: [],
          toolFindings: [],
        }),
      ])
      const services = yield* Layer.build(fixture.layer)
      const strategy = Compaction.strategy([
        Compaction.structuredSummary({ objectName: "AgentSummary" }),
        Compaction.keepRecent({ tokens: 1 }),
      ])
      const service = Compaction.make(strategy, { contextWindow: 10, reserveTokens: 0 })
      const compacted = yield* service
        .maybeCompact({
          compactionId: "compaction-test-model",
          agentName: "compact",
          sessionId: "session",
          turn: 2,
          history: Prompt.empty,
          prompt: Prompt.make("continue"),
          path: [entry("0", user("old goal")), entry("1", user("recent tail"))],
          usage: { contextTokens: 100, contextWindow: 10, reserveTokens: 0 },
          overflow: false,
        })
        .pipe(Effect.provide(services))
      const request = (yield* fixture.requests)[0]

      expect(compacted._tag).toBe("Some")
      expect(request?.operation).toBe("generateObject")
      expect(request?.tools).toEqual([])
      expect(request?.toolChoice).toBe("none")
      expect(request?.responseFormat.type).toBe("json")
    }),
  )
})
