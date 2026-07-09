import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Schedule, Schema, Stream } from "effect"
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

const user = (text: string): Prompt.Message =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] })

const entry = (id: string, message: Prompt.Message): Session.MessageEntry => ({
  _tag: "Message",
  id,
  parentId: id === "0" ? null : String(Number(id) - 1),
  message,
})

describe("TestModel", () => {
  it.effect("runs the PLAN tool-call script and captures normalized prompts", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([
        TestModel.toolCall("echo", { text: "from model" }, { id: "echo-1" }),
        TestModel.text("done"),
      ])
      const agent = Agent.make("scripted-agent", { toolkit: echoToolkit })
      const executed: Array<string> = []
      const handlers = echoToolkit.toLayer({
        echo: ({ text }) =>
          Effect.sync(() => {
            executed.push(text)
            return text
          }),
      })

      const result = yield* Agent.generate(agent, { prompt: "start" }).pipe(
        Effect.provide(Layer.merge(fixture.layer, handlers)),
      )
      const requests = yield* fixture.requests

      expect(result.text).toBe("done")
      expect(executed).toEqual(["from model"])
      expect(requests.map((request) => request.operation)).toEqual(["streamText", "streamText"])
      expect(JSON.stringify(requests[1]?.prompt)).toContain("from model")
      expect(requests[0]?.tools.map((tool) => tool.name)).toContain("echo")
    }),
  )

  it.effect("compiles grouped turns with explicit finish usage for stream and generate", () =>
    Effect.gen(function* () {
      const usage = new Response.Usage({
        inputTokens: { uncached: 4, total: 4, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 2, text: 2, reasoning: undefined },
      })
      const fixture = yield* TestModel.make([
        TestModel.turn([TestModel.text("streamed")], { finishReason: "length", usage }),
        TestModel.turn([TestModel.text("generated")], { finishReason: "stop" }),
      ])

      const streamed = yield* LanguageModel.streamText({ prompt: "one" }).pipe(
        Stream.runCollect,
        Effect.provide(fixture.layer),
      )
      const generated = yield* LanguageModel.generateText({ prompt: "two" }).pipe(Effect.provide(fixture.layer))
      const reportedUsage = streamed.find((part) => part.type === "finish")?.usage

      expect(streamed.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end", "finish"])
      expect(streamed.at(-1)?.type).toBe("finish")
      expect(reportedUsage?.inputTokens.total).toBe(4)
      expect(reportedUsage?.outputTokens.total).toBe(2)
      expect(generated.text).toBe("generated")
      expect(generated.finishReason).toBe("stop")
    }),
  )

  it.effect("decodes structured objects and rejects operation mismatches", () =>
    Effect.gen(function* () {
      const fixture = yield* TestModel.make([TestModel.object({ answer: "yes" }), TestModel.object({ bad: true })])
      const response = yield* LanguageModel.generateObject({
        prompt: "structured",
        objectName: "answer",
        schema: Schema.Struct({ answer: Schema.String }),
      }).pipe(Effect.provide(fixture.layer))
      const mismatch = yield* Effect.flip(
        LanguageModel.generateText({ prompt: "plain" }).pipe(Effect.provide(fixture.layer)),
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
        reason: new AiError.UnknownError({ description: "retry me" }),
      })
      const fixture = yield* TestModel.make([TestModel.failure(scriptedError), TestModel.text("recovered")])

      const first = yield* Effect.flip(
        LanguageModel.generateText({ prompt: "first" }).pipe(Effect.provide(fixture.layer)),
      )
      const second = yield* LanguageModel.generateText({ prompt: "second" }).pipe(Effect.provide(fixture.layer))
      const exhausted = yield* Effect.flip(
        LanguageModel.generateText({ prompt: "third" }).pipe(Effect.provide(fixture.layer)),
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
        reason: new AiError.RateLimitError({}),
      })
      const fixture = yield* TestModel.make([TestModel.failure(retryable), TestModel.text("retried")])
      const model = yield* LanguageModel.LanguageModel.pipe(Effect.provide(fixture.layer))
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
      const first = yield* LanguageModel.generateText({ prompt: "first" }).pipe(
        Effect.provide(fixture.layer),
        Effect.forkChild,
      )

      const entered = yield* fixture.awaitRequests(1)
      const second = yield* LanguageModel.generateText({ prompt: "second" }).pipe(Effect.provide(fixture.layer))
      yield* Fiber.interrupt(first)

      expect(entered.map((request) => request.index)).toEqual([0])
      expect(second.text).toBe("two")
      expect((yield* fixture.requests).map((request) => request.index)).toEqual([0, 1])
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
      const call = (prompt: string) =>
        ModelRegistry.provide(fixture.selection, LanguageModel.generateText({ prompt })).pipe(
          Effect.provide(fixture.registryLayer),
        )

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
      const events = yield* Effect.gen(function* () {
        const steering = yield* Steering.Steering
        yield* steering.steer({ prompt: "steer one" })
        yield* steering.steer({ prompt: "steer two" })
        return yield* Agent.stream(Agent.make("steered", { toolkit: echoToolkit }), {
          prompt: "start",
        }).pipe(Stream.runCollect)
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            fixture.layer,
            echoToolkit.toLayer({ echo: ({ text }) => Effect.succeed(text) }),
            Steering.layer(),
          ),
        ),
      )
      const requests = yield* fixture.requests

      expect(events).toContainEqual(expect.objectContaining({ _tag: "SteeringDrained", queue: "steering", count: 2 }))
      expect(JSON.stringify(requests[1]?.prompt)).toContain("steer one")
      expect(JSON.stringify(requests[1]?.prompt)).toContain("steer two")
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
      const strategy = Compaction.strategy([
        Compaction.structuredSummary({ objectName: "AgentSummary" }),
        Compaction.keepRecent({ tokens: 1 }),
      ])
      const service = Compaction.make(strategy, { contextWindow: 10, reserveTokens: 0 })
      const compacted = yield* service
        .maybeCompact({
          agentName: "compact",
          sessionId: "session",
          turn: 2,
          history: Prompt.empty,
          prompt: Prompt.make("continue"),
          path: [entry("0", user("old goal")), entry("1", user("recent tail"))],
          usage: { contextTokens: 100, contextWindow: 10, reserveTokens: 0 },
          overflow: false,
        })
        .pipe(Effect.provide(fixture.layer))
      const request = (yield* fixture.requests)[0]

      expect(compacted._tag).toBe("Some")
      expect(request?.operation).toBe("generateObject")
      expect(request?.tools).toEqual([])
      expect(request?.toolChoice).toBe("none")
      expect(request?.responseFormat.type).toBe("json")
    }),
  )
})
