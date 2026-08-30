import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Schedule, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AiError, LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  Agent,
  AgentEvent,
  ModelMiddleware,
  ModelRegistry,
  ModelResilience,
  ModelToolCallValidation,
} from "../../../../src/core/index"
import { withProviderFinish } from "../../provider-finish"

const rateLimit = AiError.make({
  module: "NoReplayTestLanguageModel",
  method: "streamText",
  reason: AiError.RateLimitError.make({}),
})

const scriptedModel = (
  streams: Array<Stream.Stream<Response.StreamPartEncoded, AiError.AiError>>,
  withCompiler = false,
) => {
  let attempts = 0
  const layer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () =>
        Stream.suspend(() => {
          const script = streams[Math.min(attempts, streams.length - 1)]!
          attempts += 1
          return script
        }),
    }).pipe(
      Effect.map((model) =>
        withCompiler
          ? ModelRegistry.withToolJsonSchemaCompiler(model, (tool) => Effect.succeed(Tool.getJsonSchema(tool)))
          : model,
      ),
    ),
  )
  return { layer, attempts: () => attempts }
}

const textThenFail: Stream.Stream<Response.StreamPartEncoded, AiError.AiError> = Stream.make(
  Response.makePart("text-delta", { id: "text", delta: "partial " }),
).pipe(Stream.concat(Stream.fail(rateLimit)))

const reasoningThenFail: Stream.Stream<Response.StreamPartEncoded, AiError.AiError> = Stream.make(
  Response.makePart("reasoning-delta", { id: "reasoning", delta: "thinking" }),
).pipe(Stream.concat(Stream.fail(rateLimit)))

const toolParamsThenFail: Stream.Stream<Response.StreamPartEncoded, AiError.AiError> = Stream.make(
  Response.makePart("tool-params-start", {
    id: "call-1",
    name: "write",
    providerExecuted: false,
  }),
  Response.makePart("tool-params-delta", { id: "call-1", delta: '{"path"' }),
).pipe(Stream.concat(Stream.fail(rateLimit)))

const inBandTextThenFail = Stream.make(
  Response.makePart("text-delta", { id: "text", delta: "partial " }),
  Response.makePart("error", { error: rateLimit }),
)

const malformedOutput = AiError.make({
  module: "NoReplayTestLanguageModel",
  method: "streamText",
  reason: AiError.InvalidOutputError.make({ description: "response metadata was malformed" }),
})

const lookup = Tool.make("lookup", {
  parameters: Schema.Struct({ value: Schema.String }),
  success: Schema.String,
})
const toolkit = Toolkit.make(lookup)
const toolLayer = toolkit.toLayer({ lookup: () => Effect.succeed("ok") })
const reportedUsage = (inputTokens: number, outputTokens: number): Response.Usage =>
  Response.Usage.make({
    inputTokens: { uncached: inputTokens, total: inputTokens, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
  })

const invalidUsage = reportedUsage(7, 3)
const successfulUsage = reportedUsage(11, 5)
const invalidToolParts = Stream.make(
  {
    type: "response-metadata",
    id: "discarded",
    modelId: "test",
  },
  { type: "tool-params-start", id: "call-1", name: "lookup", providerExecuted: false },
  { type: "tool-params-delta", id: "call-1", delta: '{"value":1}' },
  { type: "tool-params-end", id: "call-1" },
  {
    type: "tool-call",
    id: "call-1",
    name: "lookup",
    params: { value: 1 },
  },
  Response.makePart("finish", { reason: "tool-calls", usage: invalidUsage, response: undefined }),
)

const healthy = Stream.make(
  Response.makePart("text-delta", { id: "text", delta: "recovered" }),
  Response.makePart("finish", { reason: "stop", usage: successfulUsage, response: undefined }),
)

const resilience = ModelResilience.layer({ retrySchedule: Schedule.recurs(3) })

const agent = Agent.make({ name: "no-replay-agent", toolkit })
const noToolAgent = Agent.make({ name: "no-tool-agent" })

const runAgent = (
  model: Layer.Layer<LanguageModel.LanguageModel>,
  policy: Layer.Layer<ModelResilience.Policy, ModelResilience.Misconfigured> = resilience,
  middleware: Layer.Layer<ModelMiddleware.ModelMiddleware> = ModelMiddleware.layerIdentity,
) =>
  Stream.runCollect(
    Agent.stream(agent, { prompt: "no replay" }).pipe(
      Stream.provide(Layer.mergeAll(model, policy.pipe(Layer.orDie), middleware, toolLayer)),
    ),
  )

const expectTerminalWithoutReplay = (first: Stream.Stream<Response.StreamPartEncoded, AiError.AiError>) =>
  Effect.gen(function* () {
    const model = scriptedModel([first, healthy])
    const fiber = yield* Effect.flip(runAgent(model.layer)).pipe(Effect.forkChild)
    yield* Effect.yieldNow
    yield* TestClock.adjust("10 seconds")
    const failure = yield* Fiber.join(fiber)

    expect(model.attempts()).toBe(1)
    expect(String(failure)).toContain("Rate limit exceeded")
  })

describe("agent model stream replay safety", () => {
  it.effect("corrects pre-output invalid tool output through the public Agent path", () =>
    Effect.gen(function* () {
      const model = scriptedModel([invalidToolParts, healthy], true)
      const events = yield* runAgent(
        model.layer,
        ModelResilience.layer({
          retrySchedule: Schedule.recurs(0),
          invalidToolCallCorrectionLimit: 1,
        }),
      )
      const completed = events.at(-1)

      expect(model.attempts()).toBe(2)
      expect(completed?._tag === "Completed" && completed.text).toBe("recovered")
      const modelParts = Array.from(events).filter((event) => event._tag === "ModelPart")
      expect(modelParts.every((event) => event.part.type !== "tool-params-start")).toBe(true)
      const failedAttempt = Array.from(events).find((event) => event._tag === "ModelAttemptFailed")
      const completedCall = Array.from(events).find((event) => event._tag === "ModelCallCompleted")
      const completedAttempts = Array.from(events).filter((event) => event._tag === "ModelAttemptCompleted")
      expect(failedAttempt?._tag === "ModelAttemptFailed" && failedAttempt.providerUsage).toEqual({
        inputTokens: 7,
        outputTokens: 3,
      })
      expect(completedCall?._tag === "ModelCallCompleted" && completedCall.failedAttemptUsage).toEqual({
        inputTokens: 7,
        outputTokens: 3,
      })
      expect(completedCall?._tag === "ModelCallCompleted" && completedCall.usage).toEqual(successfulUsage)
      expect(completedAttempts.map((event) => event.usage)).toEqual([successfulUsage])
    }),
  )

  it.effect("fails typed before invoking a direct model whose correction compiler is missing", () =>
    Effect.gen(function* () {
      const model = scriptedModel([healthy])
      const failure = yield* runAgent(model.layer, ModelResilience.layer({ invalidToolCallCorrectionLimit: 1 })).pipe(
        Effect.flip,
      )

      expect(Schema.is(ModelToolCallValidation.ToolJsonSchemaCompilerMissing)(failure)).toBe(true)
      expect(model.attempts()).toBe(0)
    }),
  )

  it.effect("never corrects generic malformed output when no toolkit is present", () =>
    Effect.gen(function* () {
      const model = scriptedModel([Stream.fail(malformedOutput), healthy], true)
      const failure = yield* Agent.stream(noToolAgent, { prompt: "malformed" }).pipe(
        Stream.provide(
          Layer.mergeAll(
            model.layer,
            ModelResilience.layer({
              retrySchedule: Schedule.recurs(0),
              invalidToolCallCorrectionLimit: 2,
            }).pipe(Layer.orDie),
          ),
        ),
        Stream.runDrain,
        Effect.flip,
      )

      expect(model.attempts()).toBe(1)
      expect(String(failure)).toContain("Invalid output")
    }),
  )

  it.effect("does not correct invalid parameters after a valid tool call escaped", () =>
    Effect.gen(function* () {
      const model = scriptedModel(
        [
          Stream.make(
            {
              type: "tool-call",
              id: "valid-call",
              name: "lookup",
              params: { value: "valid" },
            },
            {
              type: "tool-call",
              id: "invalid-call",
              name: "lookup",
              params: { value: 1 },
            },
          ),
          healthy,
        ],
        true,
      )
      const failure = yield* runAgent(model.layer, ModelResilience.layer({ invalidToolCallCorrectionLimit: 2 })).pipe(
        Effect.flip,
      )

      expect(Schema.is(AgentEvent.AgentError)(failure)).toBe(true)
      expect(
        Schema.is(ModelToolCallValidation.InvalidToolCallParameters)(
          Schema.is(AgentEvent.AgentError)(failure) ? failure.cause : undefined,
        ),
      ).toBe(true)
      expect(model.attempts()).toBe(1)
    }),
  )

  it.effect("fails middleware-introduced invalid tool parameters without provider replay", () =>
    Effect.gen(function* () {
      const model = scriptedModel(
        [
          withProviderFinish(
            Stream.make({
              type: "tool-call",
              id: "call-1",
              name: "lookup",
              params: { value: "valid" },
            }),
          ),
          healthy,
        ],
        true,
      )
      const failure = yield* runAgent(
        model.layer,
        ModelResilience.layer({ invalidToolCallCorrectionLimit: 2 }),
        ModelMiddleware.layer([
          {
            transformPart: (part) =>
              Effect.succeed(Option.some(part.type === "tool-call" ? { ...part, params: { value: 1 } } : part)),
          },
        ]),
      ).pipe(Effect.flip)

      expect(Schema.is(AgentEvent.MiddlewareViolation)(failure)).toBe(true)
      expect(model.attempts()).toBe(1)
    }),
  )

  it.effect("revalidates a tool call that middleware mutates in place", () =>
    Effect.gen(function* () {
      const model = scriptedModel(
        [
          withProviderFinish(
            Stream.make({
              type: "tool-call",
              id: "call-1",
              name: "lookup",
              params: { value: "valid" },
            }),
          ),
        ],
        true,
      )
      const failure = yield* runAgent(
        model.layer,
        ModelResilience.layer({ invalidToolCallCorrectionLimit: 2 }),
        ModelMiddleware.layer([
          {
            transformPart: (part) => {
              if (part.type === "tool-call") Object.assign(part, { params: { value: 1 } })
              return Effect.succeed(Option.some(part))
            },
          },
        ]),
      ).pipe(Effect.flip)

      expect(Schema.is(AgentEvent.MiddlewareViolation)(failure)).toBe(true)
      expect(model.attempts()).toBe(1)
    }),
  )

  it.effect("retries an explicit idle timeout before output through the public Agent path", () =>
    Effect.gen(function* () {
      const model = scriptedModel([Stream.never, healthy])
      const fiber = yield* runAgent(
        model.layer,
        ModelResilience.layer({
          retrySchedule: Schedule.recurs(1),
          streamIdleTimeout: "10 millis",
        }),
      ).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* TestClock.adjust("10 millis")
      const events = yield* Fiber.join(fiber)

      expect(model.attempts()).toBe(2)
      expect(events.at(-1)?._tag).toBe("Completed")
    }),
  )

  it.effect("fails an explicit idle timeout after output without replay", () =>
    Effect.gen(function* () {
      const model = scriptedModel([
        Stream.make(Response.makePart("text-delta", { id: "text", delta: "partial" })).pipe(
          Stream.concat(Stream.never),
        ),
        healthy,
      ])
      const fiber = yield* Effect.flip(
        runAgent(
          model.layer,
          ModelResilience.layer({
            retrySchedule: Schedule.recurs(1),
            streamIdleTimeout: "10 millis",
          }),
        ),
      ).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* TestClock.adjust("10 millis")
      const failure = yield* Fiber.join(fiber)

      expect(model.attempts()).toBe(1)
      expect(String(failure)).toContain("ModelStreamTimeout")
    }),
  )

  it.effect("never restarts after text escaped", () => expectTerminalWithoutReplay(textThenFail))

  it.effect("never restarts after reasoning escaped", () => expectTerminalWithoutReplay(reasoningThenFail))

  it.effect("never restarts after tool parameters escaped", () => expectTerminalWithoutReplay(toolParamsThenFail))

  it.effect("never restarts an in-band failure after text escaped", () =>
    expectTerminalWithoutReplay(inBandTextThenFail),
  )
})
