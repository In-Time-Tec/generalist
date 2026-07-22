import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Schedule, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AiError, LanguageModel, Model, Response } from "effect/unstable/ai"
import { ModelResilience, ModelTelemetry } from "../src/index"
import { instrument, makeIdentityCell } from "../src/model-instrumentation"

const transientError = AiError.make({
  module: "TestLanguageModel",
  method: "generateText",
  reason: AiError.RateLimitError.make({}),
})

const terminalError = AiError.make({
  module: "TestLanguageModel",
  method: "generateText",
  reason: AiError.AuthenticationError.make({ kind: "InvalidKey" }),
})

const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: 50, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 25, text: undefined, reasoning: undefined },
})

const finishPart = Response.makePart("finish", { reason: "stop", usage, response: undefined })

const languageModel = (overrides: Partial<LanguageModel.Service>): LanguageModel.Service =>
  ({
    generateText: () => Effect.succeed(new LanguageModel.GenerateTextResponse([])),
    generateObject: () => Effect.succeed(new LanguageModel.GenerateObjectResponse({}, [])),
    streamText: () => Stream.empty,
    ...overrides,
  }) as LanguageModel.Service

const makeCollector = () => {
  const events: Array<ModelTelemetry.Event> = []
  const emit = (event: ModelTelemetry.Event): Effect.Effect<void> =>
    Effect.sync(() => {
      events.push(event)
    })
  return { events, emit }
}

const tags = (events: ReadonlyArray<ModelTelemetry.Event>): ReadonlyArray<string> => events.map((event) => event._tag)

const byTag = <Tag extends ModelTelemetry.Event["_tag"]>(
  events: ReadonlyArray<ModelTelemetry.Event>,
  tag: Tag,
): ReadonlyArray<Extract<ModelTelemetry.Event, { _tag: Tag }>> =>
  events.filter((event): event is Extract<ModelTelemetry.Event, { _tag: Tag }> => event._tag === tag)

describe("model instrumentation", () => {
  it.effect("joins one stream call across started, parts, first outputs, and completion", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const identity = makeIdentityCell()
      const wrapped = instrument(
        languageModel({
          streamText: (() =>
            Stream.make(
              Response.makePart("response-metadata", {
                id: "req-1",
                modelId: "returned-model",
                timestamp: undefined,
                request: undefined,
              }),
              Response.makePart("reasoning-delta", { id: "r1", delta: "thinking" }),
              Response.makePart("text-delta", { id: "t1", delta: "Hello " }),
              Response.makePart("text-delta", { id: "t1", delta: "world" }),
              Response.makePart("tool-call", { id: "call-1", name: "echo", params: {}, providerExecuted: false }),
              finishPart,
            )) as LanguageModel.Service["streamText"],
        }),
        { emit, turn: 3, identity },
      )

      yield* Stream.runDrain(wrapped.streamText({ prompt: "hello" }))

      expect(tags(events)).toEqual([
        "ModelCallStarted",
        "ModelAttemptStarted",
        "ModelAttemptFirstOutput",
        "ModelAttemptFirstOutput",
        "ModelAttemptFirstOutput",
        "ModelAttemptCompleted",
        "ModelCallCompleted",
      ])
      const [started] = byTag(events, "ModelCallStarted")
      const [attemptStarted] = byTag(events, "ModelAttemptStarted")
      const firstOutputs = byTag(events, "ModelAttemptFirstOutput")
      const [attemptCompleted] = byTag(events, "ModelAttemptCompleted")
      const [completed] = byTag(events, "ModelCallCompleted")

      expect(started?.purpose).toBe("conversation")
      expect(events.every((event) => event.turn === 3)).toBe(true)
      expect(events.every((event) => "modelCallId" in event && event.modelCallId === started?.modelCallId)).toBe(true)
      expect(attemptStarted?.attempt).toBe(0)
      expect(firstOutputs.map((event) => event.kind)).toEqual(["reasoning", "text", "tool-call"])
      expect(firstOutputs.every((event) => event.modelAttemptId === attemptStarted?.modelAttemptId)).toBe(true)
      expect(attemptCompleted?.usage).toEqual(usage)
      expect(attemptCompleted?.finishReason).toBe("stop")
      expect(attemptCompleted?.requestId).toBe("req-1")
      expect(attemptCompleted?.responseModel).toBe("returned-model")
      expect(completed?.attempts).toBe(1)
      expect(completed?.usage).toEqual(usage)
      expect(completed?.finishReason).toBe("stop")
      expect(identity.current).toEqual({
        modelCallId: started?.modelCallId,
        modelAttemptId: attemptStarted?.modelAttemptId,
        attempt: 0,
      })
    }),
  )

  it.effect("samples timestamps at real operation boundaries, not sequence offsets", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          streamText: () =>
            Stream.concat(
              Stream.concat(
                Stream.fromEffect(
                  Effect.delay(Effect.succeed(Response.makePart("text-delta", { id: "t1", delta: "hi" })), "5 millis"),
                ),
                Stream.fromEffect(Effect.delay(Effect.succeed(finishPart), "10 millis")),
              ),
              Stream.drain(Stream.fromEffect(Effect.sleep("7 millis"))),
            ),
        }),
        { emit, turn: 0 },
      )

      const fiber = yield* Stream.runDrain(wrapped.streamText({ prompt: "hello" })).pipe(Effect.forkChild)
      yield* TestClock.adjust("22 millis")
      yield* Fiber.join(fiber)

      const [started] = byTag(events, "ModelCallStarted")
      const [attemptStarted] = byTag(events, "ModelAttemptStarted")
      const [firstOutput] = byTag(events, "ModelAttemptFirstOutput")
      const [attemptCompleted] = byTag(events, "ModelAttemptCompleted")
      const [completed] = byTag(events, "ModelCallCompleted")

      expect(started?.startedAt).toBe(0)
      expect(attemptStarted?.startedAt).toBe(0)
      expect(firstOutput?.at).toBe(5)
      expect(attemptCompleted?.usageAt).toBe(15)
      expect(attemptCompleted?.completedAt).toBe(22)
      expect(completed?.completedAt).toBe(22)
    }),
  )

  it.effect("emits the typed retry lifecycle across provider attempts with real backoff boundaries", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      let calls = 0
      const wrapped = instrument(
        languageModel({
          generateText: () => {
            calls += 1
            return calls < 3
              ? Effect.fail(transientError)
              : Effect.succeed(new LanguageModel.GenerateTextResponse([finishPart]))
          },
        }),
        {
          emit,
          turn: 1,
          resilience: ModelResilience.make({
            retrySchedule: Schedule.exponential("100 millis"),
            classify: (error) => (error === transientError ? "transient" : "terminal"),
          }),
        },
      )

      const fiber = yield* wrapped.generateText({ prompt: "retry" }).pipe(Effect.forkChild)
      yield* TestClock.adjust("300 millis")
      yield* Fiber.join(fiber)

      expect(tags(events)).toEqual([
        "ModelCallStarted",
        "ModelAttemptStarted",
        "ModelAttemptFailed",
        "ModelRetryScheduled",
        "ModelAttemptStarted",
        "ModelAttemptFailed",
        "ModelRetryScheduled",
        "ModelAttemptStarted",
        "ModelAttemptCompleted",
        "ModelCallCompleted",
      ])
      const [started] = byTag(events, "ModelCallStarted")
      const attempts = byTag(events, "ModelAttemptStarted")
      const failures = byTag(events, "ModelAttemptFailed")
      const retries = byTag(events, "ModelRetryScheduled")
      const [completed] = byTag(events, "ModelCallCompleted")

      expect(attempts.map((event) => event.attempt)).toEqual([0, 1, 2])
      expect(new Set(attempts.map((event) => event.modelAttemptId)).size).toBe(3)
      expect(events.every((event) => "modelCallId" in event && event.modelCallId === started?.modelCallId)).toBe(true)
      expect(failures.map((event) => event.category)).toEqual(["rate-limit", "rate-limit"])
      expect(failures.map((event) => event.classification)).toEqual(["transient", "transient"])
      expect(retries.map((event) => event.attempt)).toEqual([0, 1])
      expect(retries.map((event) => event.reason)).toEqual(["provider-resilience", "provider-resilience"])
      expect(retries.map((event) => event.delayMillis)).toEqual([100, 200])
      expect(attempts.map((event) => event.startedAt)).toEqual([0, 100, 300])
      expect(completed?.attempts).toBe(3)
    }),
  )

  it.effect("fails the call on terminal classification without scheduling retries", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(languageModel({ generateText: () => Effect.fail(terminalError) }), {
        emit,
        turn: 0,
        resilience: ModelResilience.make({
          retrySchedule: Schedule.exponential("100 millis"),
          classify: (error) => (error === transientError ? "transient" : "terminal"),
        }),
      })

      const failure = yield* Effect.flip(wrapped.generateText({ prompt: "fail" }))

      expect(failure).toBe(terminalError)
      expect(tags(events)).toEqual(["ModelCallStarted", "ModelAttemptStarted", "ModelAttemptFailed", "ModelCallFailed"])
      const [attemptFailed] = byTag(events, "ModelAttemptFailed")
      const [callFailed] = byTag(events, "ModelCallFailed")
      expect(attemptFailed?.category).toBe("authentication")
      expect(attemptFailed?.classification).toBe("terminal")
      expect(callFailed?.category).toBe("authentication")
      expect(callFailed?.attempts).toBe(1)
    }),
  )

  it.effect("records a mid-stream failure surfaced as an error part as attempt and call failure", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          streamText: () =>
            Stream.concat(
              Stream.make(Response.makePart("text-delta", { id: "t1", delta: "partial" })),
              Stream.fail(transientError),
            ),
        }),
        {
          emit,
          turn: 0,
          resilience: ModelResilience.make({
            retrySchedule: Schedule.exponential("100 millis"),
            classify: (error) => (error === transientError ? "transient" : "terminal"),
          }),
        },
      )

      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "hello" }))

      expect(parts.map((part) => part.type)).toEqual(["text-delta", "error"])
      expect(tags(events)).toEqual([
        "ModelCallStarted",
        "ModelAttemptStarted",
        "ModelAttemptFirstOutput",
        "ModelAttemptFailed",
        "ModelCallFailed",
      ])
      const [attemptFailed] = byTag(events, "ModelAttemptFailed")
      const [callFailed] = byTag(events, "ModelCallFailed")
      expect(attemptFailed?.category).toBe("rate-limit")
      expect(callFailed?.category).toBe("rate-limit")
      expect(byTag(events, "ModelRetryScheduled")).toHaveLength(0)
    }),
  )

  it.effect("classifies interruption as cancellation without false completion and preserves interruption", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          streamText: () =>
            Stream.concat(
              Stream.make(Response.makePart("text-delta", { id: "t1", delta: "partial" })),
              Stream.fromEffect(Effect.never),
            ),
        }),
        { emit, turn: 0 },
      )

      const fiber = yield* Stream.runDrain(wrapped.streamText({ prompt: "hello" })).pipe(Effect.forkChild)
      yield* TestClock.adjust("1 millis")
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)

      expect(Exit.hasInterrupts(exit)).toBe(true)
      expect(tags(events)).toEqual([
        "ModelCallStarted",
        "ModelAttemptStarted",
        "ModelAttemptFirstOutput",
        "ModelAttemptFailed",
        "ModelCallFailed",
      ])
      const [attemptFailed] = byTag(events, "ModelAttemptFailed")
      const [callFailed] = byTag(events, "ModelCallFailed")
      expect(attemptFailed?.category).toBe("cancellation")
      expect(callFailed?.category).toBe("cancellation")
    }),
  )

  it.effect("keeps usage unknown when the provider reports none", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          streamText: () => Stream.make(Response.makePart("text-delta", { id: "t1", delta: "no finish" })),
        }),
        { emit, turn: 0 },
      )

      yield* Stream.runDrain(wrapped.streamText({ prompt: "hello" }))

      const [attemptCompleted] = byTag(events, "ModelAttemptCompleted")
      const [completed] = byTag(events, "ModelCallCompleted")
      expect(attemptCompleted !== undefined && "usage" in attemptCompleted).toBe(false)
      expect(attemptCompleted !== undefined && "finishReason" in attemptCompleted).toBe(false)
      expect(attemptCompleted !== undefined && "requestId" in attemptCompleted).toBe(false)
      expect(completed !== undefined && "usage" in completed).toBe(false)
    }),
  )

  it.effect("stamps purpose, compaction id, provider, and model from the calling context", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          generateText: () => Effect.succeed(new LanguageModel.GenerateTextResponse([finishPart])),
        }),
        { emit, turn: 2 },
      )

      yield* wrapped
        .generateText({ prompt: "summarize" })
        .pipe(
          Effect.provideService(ModelTelemetry.CurrentPurpose, "compaction-summary"),
          Effect.provideService(ModelTelemetry.CurrentCompactionId, "compaction-1"),
          Effect.provideService(Model.ProviderName, "test-provider"),
          Effect.provideService(Model.ModelName, "test-model"),
        )

      const [started] = byTag(events, "ModelCallStarted")
      expect(started?.purpose).toBe("compaction-summary")
      expect(started?.compactionId).toBe("compaction-1")
      expect(started?.provider).toBe("test-provider")
      expect(started?.model).toBe("test-model")
    }),
  )

  it.effect("emits telemetry for generateObject calls", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          generateObject: () =>
            Effect.succeed(
              new LanguageModel.GenerateObjectResponse({ value: "ok" }, [
                Response.makePart("text", { text: '{"value":"ok"}' }),
                finishPart,
              ]),
            ),
        }),
        { emit, turn: 0 },
      )

      yield* (wrapped.generateObject as unknown as (options: unknown) => Effect.Effect<unknown>)({ prompt: "object" })

      expect(tags(events)).toEqual([
        "ModelCallStarted",
        "ModelAttemptStarted",
        "ModelAttemptFirstOutput",
        "ModelAttemptCompleted",
        "ModelCallCompleted",
      ])
      const [firstOutput] = byTag(events, "ModelAttemptFirstOutput")
      expect(firstOutput?.kind).toBe("text")
      const [attemptCompleted] = byTag(events, "ModelAttemptCompleted")
      expect(attemptCompleted?.usage).toEqual(usage)
      expect(attemptCompleted?.usageAt).toBeDefined()
    }),
  )

  it.effect("instrumenting an already instrumented model is idempotent", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const model = languageModel({
        streamText: () => Stream.make(Response.makePart("text-delta", { id: "t1", delta: "once" })),
      })
      const once = instrument(model, { emit, turn: 0 })
      const twice = instrument(once, { emit, turn: 0 })

      expect(twice).toBe(once)
      yield* Stream.runDrain(twice.streamText({ prompt: "hello" }))

      expect(byTag(events, "ModelCallStarted")).toHaveLength(1)
      expect(byTag(events, "ModelAttemptStarted")).toHaveLength(1)
    }),
  )

  it.effect("a nested run re-instruments the base model so one call never emits into two runs", () =>
    Effect.gen(function* () {
      const outer = makeCollector()
      const inner = makeCollector()
      const model = languageModel({
        streamText: () => Stream.make(Response.makePart("text-delta", { id: "t1", delta: "child" })),
      })
      const outerInstrumented = instrument(model, { emit: outer.emit, turn: 0 })
      const innerInstrumented = instrument(outerInstrumented, { emit: inner.emit, turn: 0 })

      yield* Stream.runDrain(innerInstrumented.streamText({ prompt: "nested" }))

      expect(outer.events).toHaveLength(0)
      expect(tags(inner.events)).toEqual([
        "ModelCallStarted",
        "ModelAttemptStarted",
        "ModelAttemptFirstOutput",
        "ModelAttemptCompleted",
        "ModelCallCompleted",
      ])
    }),
  )

  it.effect("classifies each distinct failure once across retry decision and telemetry", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const classified: Array<unknown> = []
      let calls = 0
      const wrapped = instrument(
        languageModel({
          generateText: () => {
            calls += 1
            return calls < 2
              ? Effect.fail(transientError)
              : Effect.succeed(new LanguageModel.GenerateTextResponse([finishPart]))
          },
        }),
        {
          emit,
          turn: 0,
          resilience: ModelResilience.make({
            retrySchedule: Schedule.exponential("100 millis"),
            classify: (error) => {
              classified.push(error)
              return error === transientError ? "transient" : "terminal"
            },
          }),
        },
      )

      const fiber = yield* wrapped.generateText({ prompt: "retry" }).pipe(Effect.forkChild)
      yield* TestClock.adjust("100 millis")
      yield* Fiber.join(fiber)

      expect(classified).toEqual([transientError])
      expect(byTag(events, "ModelRetryScheduled")).toHaveLength(1)
    }),
  )
})
