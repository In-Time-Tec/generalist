import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Function, Schedule, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { AiError, LanguageModel, Model, Prompt, Response, ResponseIdTracker } from "effect/unstable/ai"
import { ModelResilience, ModelStreamTermination, ModelTelemetry, ModelToolCallValidation } from "../src/index"
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

const makeResilience = (input?: Partial<ModelResilience.Interface>): ModelResilience.Interface =>
  Effect.runSync(ModelResilience.make(input))

const languageModel = (overrides: Record<string, unknown>): LanguageModel.Service =>
  ({
    generateText: () => Effect.succeed(new LanguageModel.GenerateTextResponse([])),
    generateObject: () => Effect.succeed(new LanguageModel.GenerateObjectResponse({}, [])),
    streamText: () => Stream.empty,
    ...overrides,
  }) as LanguageModel.Service

const makeCollector = () => {
  const events: Array<ModelTelemetry.EventPayload> = []
  const emit = (event: ModelTelemetry.EventPayload): Effect.Effect<void> =>
    Effect.sync(() => {
      events.push(event)
    })
  return { events, emit }
}

const tags = (events: ReadonlyArray<ModelTelemetry.EventPayload>): ReadonlyArray<string> =>
  events.map((event) => event._tag)

const byTag = <Tag extends ModelTelemetry.EventPayload["_tag"]>(
  events: ReadonlyArray<ModelTelemetry.EventPayload>,
  tag: Tag,
): ReadonlyArray<Extract<ModelTelemetry.EventPayload, { _tag: Tag }>> =>
  events.filter((event): event is Extract<ModelTelemetry.EventPayload, { _tag: Tag }> => event._tag === tag)

describe("model instrumentation", () => {
  it.effect("disables the SDK response-id fallback so each Baton attempt invokes the provider once", () =>
    Effect.gen(function* () {
      const first = Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "first" })] })
      const assistant = Prompt.makeMessage("assistant", {
        content: [Prompt.makePart("text", { text: "answer" })],
      })
      const next = Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "next" })] })
      const prompt = Prompt.fromMessages([first, assistant, next])
      const incrementalRejected = AiError.make({
        module: "ResponseIdFallbackTest",
        method: "request",
        reason: AiError.InvalidRequestError.make({ description: "incremental request rejected" }),
      })
      const tracker = yield* ResponseIdTracker.make
      tracker.markParts([first], "previous-response")
      let generateRawCalls = 0
      let streamRawCalls = 0
      const model = yield* LanguageModel.make({
        generateText: (options) => {
          generateRawCalls += 1
          return options.previousResponseId === undefined
            ? Effect.succeed([
                Response.makePart("text", { text: "generated" }),
                finishPart,
              ] as Array<Response.PartEncoded>)
            : Effect.fail(incrementalRejected)
        },
        streamText: (options) => {
          streamRawCalls += 1
          return options.previousResponseId === undefined
            ? Stream.make(Response.makePart("text-delta", { id: "text", delta: "streamed" }), finishPart)
            : Stream.fail(incrementalRejected)
        },
      })
      const { emit } = makeCollector()
      const wrapped = instrument(model, { emit, turn: 0 })

      yield* wrapped.generateText({ prompt }).pipe(Effect.provideService(ResponseIdTracker.ResponseIdTracker, tracker))
      yield* wrapped
        .streamText({ prompt })
        .pipe(Stream.provideService(ResponseIdTracker.ResponseIdTracker, tracker), Stream.runDrain)

      expect(generateRawCalls).toBe(1)
      expect(streamRawCalls).toBe(1)
    }),
  )

  it.effect(
    "rejects a structurally supplied invalid resilience policy before instrumentation invokes the provider",
    () =>
      Effect.gen(function* () {
        const { events, emit } = makeCollector()
        let calls = 0
        const wrapped = instrument(
          languageModel({
            streamText: () => {
              calls += 1
              return Stream.make(finishPart)
            },
          }),
          {
            emit,
            turn: 0,
            resilience: { ...ModelResilience.none, invalidToolCallCorrectionLimit: 2.5 },
          },
        )

        const failure = yield* Stream.runDrain(wrapped.streamText({ prompt: "must not run" })).pipe(Effect.flip)

        expect(Schema.is(ModelResilience.ModelResilienceMisconfigured)(failure)).toBe(true)
        expect(calls).toBe(0)
        expect(events).toEqual([])
      }),
  )

  it.effect("awaits the invocation coordinator before constructing a provider stream", () =>
    Effect.gen(function* () {
      const { emit } = makeCollector()
      const entered = yield* Deferred.make<void>()
      const permit = yield* Deferred.make<void>()
      const coordinated: Array<string> = []
      let providerCalls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            providerCalls += 1
            return Stream.make(finishPart)
          },
        }),
        {
          emit,
          turn: 0,
          logicalOperationId: "execution:test:generation:0:turn:0",
          coordinator: {
            beforeAttempt: (input) =>
              Deferred.succeed(entered, undefined).pipe(
                Effect.andThen(Deferred.await(permit)),
                Effect.tap(() => Effect.sync(() => coordinated.push(`started:${input.modelAttemptId}`))),
              ),
            completeAttempt: (input) =>
              Effect.sync(() => {
                coordinated.push(`completed:${input.modelAttemptId}`)
              }),
            failAttempt: (input) =>
              Effect.sync(() => {
                coordinated.push(`failed:${input.modelAttemptId}`)
              }),
          },
        },
      )

      const fiber = yield* Stream.runDrain(wrapped.streamText({ prompt: "hello" })).pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      expect(providerCalls).toBe(0)
      yield* Deferred.succeed(permit, undefined)
      yield* Fiber.join(fiber)

      expect(providerCalls).toBe(1)
      expect(coordinated).toEqual([
        "started:execution:test:generation:0:turn:0:model-call:0:conversation:attempt:0",
        "completed:execution:test:generation:0:turn:0:model-call:0:conversation:attempt:0",
      ])
    }),
  )

  it.effect("settles a coordinated finish consumed at a downstream stream boundary", () =>
    Effect.gen(function* () {
      const { emit } = makeCollector()
      const coordinated: Array<string> = []
      const wrapped = instrument(
        languageModel({ streamText: () => Stream.make(finishPart) }),
        {
          emit,
          turn: 0,
          logicalOperationId: "execution:test:generation:0:turn:finish-boundary",
          coordinator: {
            beforeAttempt: () => Effect.sync(() => coordinated.push("started")),
            completeAttempt: () => Effect.sync(() => coordinated.push("completed")),
            failAttempt: () => Effect.sync(() => coordinated.push("failed")),
          },
        },
      )

      yield* wrapped.streamText({ prompt: "hello" }).pipe(Stream.take(1), Stream.runDrain)

      expect(coordinated).toEqual(["started", "completed"])
    }),
  )

  it.effect("rejects an exhausted model-call ordinal before provider entry", () =>
    Effect.gen(function* () {
      const { emit } = makeCollector()
      let ordinal = Number.MAX_SAFE_INTEGER
      let providerCalls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            providerCalls += 1
            return Stream.make(finishPart)
          },
        }),
        {
          emit,
          turn: 0,
          logicalOperationId: "execution:test:generation:0:turn:ordinal",
          nextCallOrdinal: () => ordinal++,
        },
      )

      yield* wrapped.streamText({ prompt: "first" }).pipe(Stream.runDrain)
      const failure = yield* wrapped.streamText({ prompt: "second" }).pipe(Stream.runDrain, Effect.flip)

      expect(ModelTelemetry.isInvocationCoordinationFailed(failure)).toBe(true)
      expect(providerCalls).toBe(1)
    }),
  )

  it.effect("awaits the invocation coordinator before entering generateText", () =>
    Effect.gen(function* () {
      const { emit } = makeCollector()
      const entered = yield* Deferred.make<void>()
      const permit = yield* Deferred.make<void>()
      let providerCalls = 0
      const wrapped = instrument(
        languageModel({
          generateText: () => {
            providerCalls += 1
            return Effect.succeed(new LanguageModel.GenerateTextResponse([finishPart]))
          },
        }),
        {
          emit,
          turn: 0,
          logicalOperationId: "execution:test:generation:0:turn:1",
          coordinator: {
            beforeAttempt: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(permit))),
            completeAttempt: () => Effect.void,
            failAttempt: () => Effect.void,
          },
        },
      )

      const fiber = yield* wrapped.generateText({ prompt: "hello" }).pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      expect(providerCalls).toBe(0)
      yield* Deferred.succeed(permit, undefined)
      yield* Fiber.join(fiber)
      expect(providerCalls).toBe(1)
    }),
  )

  it.effect("does not retry an invocation coordination failure", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      let providerCalls = 0
      let coordinationCalls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            providerCalls += 1
            return Stream.make(finishPart)
          },
        }),
        {
          emit,
          turn: 0,
          logicalOperationId: "execution:test:generation:0:turn:2",
          coordinator: {
            beforeAttempt: () => {
              coordinationCalls += 1
              return Effect.fail(
                ModelTelemetry.InvocationCoordinationFailed.make({ message: "durable fence rejected" }),
              )
            },
            completeAttempt: () => Effect.void,
            failAttempt: () => Effect.void,
          },
          resilience: makeResilience({
            classify: () => "transient",
            retrySchedule: Schedule.recurs(3),
          }),
        },
      )

      const failure = yield* Stream.runDrain(wrapped.streamText({ prompt: "hello" })).pipe(Effect.flip)

      expect(ModelTelemetry.isInvocationCoordinationFailed(failure)).toBe(true)
      expect(coordinationCalls).toBe(1)
      expect(providerCalls).toBe(0)
      expect(byTag(events, "ModelRetryScheduled")).toHaveLength(0)
    }),
  )

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

  it.effect("corrects invalid tool output inside one logical call with visible attempt telemetry", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const invalidToolCall = ModelToolCallValidation.InvalidToolCallParameters.make({ toolName: "lookup" })
      const prompts: Array<Prompt.Prompt> = []
      let calls = 0
      const wrapped = instrument(
        languageModel({
          streamText: ((options: LanguageModel.GenerateTextOptions<Record<string, never>>) => {
            prompts.push(Prompt.make(options.prompt))
            calls += 1
            return calls === 1
              ? Stream.make(
                  Response.makePart("response-metadata", {
                    id: "discarded-request",
                    modelId: "scripted",
                    timestamp: undefined,
                    request: undefined,
                  }),
                ).pipe(Stream.concat(Stream.fail(invalidToolCall)))
              : Stream.make(Response.makePart("text-delta", { id: "t1", delta: "recovered" }), finishPart)
          }) as LanguageModel.Service["streamText"],
        }),
        {
          emit,
          turn: 2,
          resilience: makeResilience({
            retrySchedule: Schedule.recurs(0),
            invalidToolCallCorrectionLimit: 1,
          }),
        },
      )

      yield* Stream.runDrain(wrapped.streamText({ prompt: "use the tool" }))

      const [callStarted] = byTag(events, "ModelCallStarted")
      const attempts = byTag(events, "ModelAttemptStarted")
      const [retry] = byTag(events, "ModelRetryScheduled")
      expect(calls).toBe(2)
      expect(attempts.map((attempt) => attempt.attempt)).toEqual([0, 1])
      expect(attempts.every((attempt) => attempt.modelCallId === callStarted?.modelCallId)).toBe(true)
      expect(retry?.reason).toBe("invalid-tool-call-correction")
      expect(retry?.attempt).toBe(0)
      const correction = Prompt.make(prompts[1]!).content.at(-1)
      expect(correction?.role).toBe("user")
      expect(
        correction?.role === "user" &&
          correction.content.some((part) => part.type === "text" && part.text.includes('Tool "lookup"')),
      ).toBe(true)
      const [failedAttempt] = byTag(events, "ModelAttemptFailed")
      const [completedCall] = byTag(events, "ModelCallCompleted")
      expect(failedAttempt?.providerUsage).toBeUndefined()
      expect(completedCall?.failedAttemptUsage).toBeUndefined()
      expect(completedCall?.usage).toEqual(usage)
      expect("description" in (failedAttempt?.providerUsage ?? {})).toBe(false)
      expect(byTag(events, "ModelCallFailed")).toHaveLength(0)
      expect(byTag(events, "ModelCallCompleted")).toHaveLength(1)
    }),
  )

  it.effect("reports generic invalid-output usage without scheduling tool correction", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const malformed = AiError.make({
        module: "TestLanguageModel",
        method: "streamText",
        reason: AiError.InvalidOutputError.make({
          description: "malformed response metadata",
          usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
        }),
      })
      let calls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            calls += 1
            return Stream.fail(malformed)
          },
        }),
        {
          emit,
          turn: 0,
          resilience: makeResilience({
            retrySchedule: Schedule.recurs(0),
            invalidToolCallCorrectionLimit: 2,
          }),
        },
      )

      const failure = yield* wrapped.streamText({ prompt: "malformed" }).pipe(Stream.runDrain, Effect.flip)
      expect(failure).toBe(malformed)
      expect(calls).toBe(1)
      expect(byTag(events, "ModelRetryScheduled")).toEqual([])
      expect(byTag(events, "ModelAttemptFailed")[0]?.providerUsage).toEqual({
        inputTokens: 7,
        outputTokens: 3,
        totalTokens: 10,
      })
      expect(byTag(events, "ModelCallFailed")[0]?.failedAttemptUsage).toEqual({
        inputTokens: 7,
        outputTokens: 3,
        totalTokens: 10,
      })
    }),
  )

  it.effect("fails one logical call after its invalid-tool correction limit is exhausted", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const failures = [
        ModelToolCallValidation.InvalidToolCallParameters.make({ toolName: "lookup" }),
        ModelToolCallValidation.InvalidToolCallParameters.make({ toolName: "lookup" }),
        ModelToolCallValidation.InvalidToolCallParameters.make({ toolName: "lookup" }),
      ]
      let calls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () =>
            Stream.suspend(() => {
              const failure = failures[calls]!
              calls += 1
              return Stream.fail(failure)
            }),
        }),
        {
          emit,
          turn: 0,
          resilience: makeResilience({
            retrySchedule: Schedule.recurs(0),
            invalidToolCallCorrectionLimit: 2,
          }),
        },
      )

      const failure = yield* Stream.runDrain(wrapped.streamText({ prompt: "use the tool" })).pipe(Effect.flip)

      expect(failure).toBe(failures[2])
      expect(calls).toBe(3)
      expect(byTag(events, "ModelAttemptStarted")).toHaveLength(3)
      expect(byTag(events, "ModelRetryScheduled").map((event) => event.reason)).toEqual([
        "invalid-tool-call-correction",
        "invalid-tool-call-correction",
      ])
      expect(byTag(events, "ModelAttemptFailed").map((event) => event.providerUsage)).toEqual([
        undefined,
        undefined,
        undefined,
      ])
      const [failedCall] = byTag(events, "ModelCallFailed")
      expect(failedCall?.failedAttemptUsage).toBeUndefined()
      expect(failedCall).not.toHaveProperty("description")
      expect(failedCall).not.toHaveProperty("params")
      expect(byTag(events, "ModelCallFailed")).toHaveLength(1)
      expect(byTag(events, "ModelCallCompleted")).toHaveLength(0)
    }),
  )

  it.effect("never corrects invalid tool output after text escaped", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const invalidToolCall = ModelToolCallValidation.InvalidToolCallParameters.make({ toolName: "lookup" })
      let calls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            calls += 1
            return Stream.make(Response.makePart("text-delta", { id: "t1", delta: "partial" })).pipe(
              Stream.concat(Stream.fail(invalidToolCall)),
            )
          },
        }),
        {
          emit,
          turn: 0,
          resilience: makeResilience({
            retrySchedule: Schedule.recurs(0),
            invalidToolCallCorrectionLimit: 2,
          }),
        },
      )

      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "use the tool" }))

      expect(calls).toBe(1)
      expect(parts.map((part) => part.type)).toEqual(["text-delta", "error"])
      expect(byTag(events, "ModelRetryScheduled")).toHaveLength(0)
      expect(byTag(events, "ModelCallFailed")).toHaveLength(1)
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
          resilience: makeResilience({
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

  it.effect("retries an in-band transient failure with consistent attempt telemetry", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      let calls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            calls += 1
            return calls === 1
              ? Stream.make(
                  Response.makePart("response-metadata", {
                    id: "discarded-request",
                    modelId: "returned-model",
                    timestamp: undefined,
                    request: undefined,
                  }),
                  Response.makePart("error", { error: transientError }),
                )
              : Stream.make(
                  Response.makePart("response-metadata", {
                    id: "recovered-request",
                    modelId: "returned-model",
                    timestamp: undefined,
                    request: undefined,
                  }),
                  Response.makePart("text-delta", { id: "text", delta: "recovered" }),
                  finishPart,
                )
          },
        }),
        {
          emit,
          turn: 2,
          resilience: makeResilience({
            retrySchedule: Schedule.recurs(1),
            classify: (error) => (error === transientError ? "transient" : "terminal"),
          }),
        },
      )

      const parts = yield* Stream.runCollect(wrapped.streamText({ prompt: "retry in-band" }))

      expect(calls).toBe(2)
      expect(parts.map((part) => part.type)).toEqual(["response-metadata", "text-delta", "finish"])
      expect(parts[0]?.type === "response-metadata" && parts[0].id).toBe("recovered-request")
      expect(tags(events)).toEqual([
        "ModelCallStarted",
        "ModelAttemptStarted",
        "ModelAttemptFailed",
        "ModelRetryScheduled",
        "ModelAttemptStarted",
        "ModelAttemptFirstOutput",
        "ModelAttemptCompleted",
        "ModelCallCompleted",
      ])
      const [failed] = byTag(events, "ModelAttemptFailed")
      const [retry] = byTag(events, "ModelRetryScheduled")
      const [completed] = byTag(events, "ModelCallCompleted")
      expect(failed?.category).toBe("rate-limit")
      expect(failed?.classification).toBe("transient")
      expect(retry?.attempt).toBe(0)
      expect(completed?.attempts).toBe(2)
    }),
  )

  it.effect("fails the call on terminal classification without scheduling retries", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(languageModel({ generateText: () => Effect.fail(terminalError) }), {
        emit,
        turn: 0,
        resilience: makeResilience({
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
      expect(callFailed?.classification).toBe("terminal")
      expect(callFailed?.attempts).toBe(1)
    }),
  )

  it.effect("reports the same category and classification on a call as on the attempt that ended it", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          streamText: () =>
            Stream.make(
              Response.makePart("response-metadata", {
                id: "req-1",
                modelId: "returned-model",
                timestamp: undefined,
                request: undefined,
              }),
            ),
        }),
        {
          emit,
          turn: 0,
          resilience: makeResilience({ retrySchedule: Schedule.recurs(1) }),
        },
      )

      const error = yield* Stream.runDrain(wrapped.streamText({ prompt: "cut" })).pipe(Effect.flip)

      expect(Schema.is(ModelStreamTermination.ModelStreamTruncated)(error)).toBe(true)
      const attemptFailures = byTag(events, "ModelAttemptFailed")
      const [callFailed] = byTag(events, "ModelCallFailed")
      expect(attemptFailures).toHaveLength(2)
      expect(attemptFailures.map((event) => event.category)).toEqual(["truncated-stream", "truncated-stream"])
      expect(attemptFailures.map((event) => event.classification)).toEqual(["transient", "transient"])
      expect(callFailed?.category).toBe("truncated-stream")
      expect(callFailed?.classification).toBe("transient")
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
          resilience: makeResilience({
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
      expect(attemptFailed?.classification).toBe("transient")
      expect(callFailed?.category).toBe("rate-limit")
      expect(callFailed?.classification).toBe("terminal")
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
      expect(attemptFailed?.classification).toBe("terminal")
      expect(callFailed?.category).toBe("cancellation")
      expect(callFailed?.classification).toBe("terminal")
    }),
  )

  it.effect("fails an attempt whose stream ends without a provider finish", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          streamText: () => Stream.make(Response.makePart("text-delta", { id: "t1", delta: "no finish" })),
        }),
        { emit, turn: 0 },
      )

      const error = yield* Stream.runDrain(wrapped.streamText({ prompt: "hello" })).pipe(Effect.flip)

      expect(Schema.is(ModelStreamTermination.ModelStreamTruncated)(error)).toBe(true)
      expect(byTag(events, "ModelAttemptCompleted")).toEqual([])
      const [attemptFailed] = byTag(events, "ModelAttemptFailed")
      expect(attemptFailed?.category).toBe("truncated-stream")
      expect(attemptFailed?.classification).toBe("terminal")
      const [callFailed] = byTag(events, "ModelCallFailed")
      expect(callFailed?.category).toBe("truncated-stream")
      expect(callFailed?.classification).toBe("terminal")
      expect(byTag(events, "ModelCallCompleted")).toEqual([])
    }),
  )

  it.effect("retries an explicit pre-output stream timeout inside the same call", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      let calls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            calls += 1
            return calls === 1
              ? Stream.never
              : Stream.make(Response.makePart("text-delta", { id: "t1", delta: "ok" }), finishPart)
          },
        }),
        {
          emit,
          turn: 0,
          resilience: makeResilience({
            retrySchedule: Schedule.recurs(1),
            streamIdleTimeout: "10 millis",
          }),
        },
      )

      const fiber = yield* Stream.runDrain(wrapped.streamText({ prompt: "wait" })).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* TestClock.adjust("10 millis")
      yield* Fiber.join(fiber)

      const attempts = byTag(events, "ModelAttemptStarted")
      const [failed] = byTag(events, "ModelAttemptFailed")
      const [retry] = byTag(events, "ModelRetryScheduled")
      expect(calls).toBe(2)
      expect(attempts).toHaveLength(2)
      expect(new Set(attempts.map((attempt) => attempt.modelCallId)).size).toBe(1)
      expect(failed?.category).toBe("timeout")
      expect(failed?.classification).toBe("transient")
      expect(retry?.reason).toBe("provider-resilience")
      expect(retry?.category).toBe("timeout")
      expect(byTag(events, "ModelCallCompleted")).toHaveLength(1)
    }),
  )

  it.effect("never retries an explicit stream timeout after text escaped", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      let calls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            calls += 1
            return Stream.make(Response.makePart("text-delta", { id: "t1", delta: "partial" })).pipe(
              Stream.concat(Stream.never),
            )
          },
        }),
        {
          emit,
          turn: 0,
          resilience: makeResilience({
            retrySchedule: Schedule.recurs(2),
            streamIdleTimeout: "10 millis",
          }),
        },
      )

      const fiber = yield* Stream.runCollect(wrapped.streamText({ prompt: "wait" })).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* TestClock.adjust("10 millis")
      const parts = yield* Fiber.join(fiber)

      expect(calls).toBe(1)
      expect(parts.map((part) => part.type)).toEqual(["text-delta", "error"])
      expect(byTag(events, "ModelRetryScheduled")).toHaveLength(0)
      expect(byTag(events, "ModelAttemptFailed")[0]?.category).toBe("timeout")
      expect(byTag(events, "ModelCallFailed")[0]?.category).toBe("timeout")
      expect(byTag(events, "ModelCallFailed")[0]?.classification).toBe("terminal")
    }),
  )

  it.effect("keeps a completed attempt's usage when a later attempt in the same call truncates", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      let calls = 0
      const wrapped = instrument(
        languageModel({
          streamText: () => {
            calls += 1
            return calls === 1
              ? Stream.make(finishPart)
              : Stream.make(Response.makePart("text-delta", { id: "t1", delta: "cut" }))
          },
        }),
        { emit, turn: 0 },
      )

      yield* Stream.runDrain(wrapped.streamText({ prompt: "first" }))
      yield* Stream.runDrain(wrapped.streamText({ prompt: "second" })).pipe(Effect.flip)

      const [firstCompleted] = byTag(events, "ModelAttemptCompleted")
      expect(firstCompleted?.usage).toEqual(usage)
      expect(firstCompleted?.finishReason).toBe("stop")
      const [firstCall] = byTag(events, "ModelCallCompleted")
      expect(firstCall?.usage).toEqual(usage)
      expect(byTag(events, "ModelAttemptCompleted")).toHaveLength(1)
      const [attemptFailed] = byTag(events, "ModelAttemptFailed")
      expect(attemptFailed?.category).toBe("truncated-stream")
    }),
  )

  it.effect("reports an open tool call in the truncation failure", () =>
    Effect.gen(function* () {
      const { events, emit } = makeCollector()
      const wrapped = instrument(
        languageModel({
          streamText: () =>
            Stream.fromIterable([
              Response.makePart("response-metadata", {
                id: "req-1",
                modelId: "scripted",
                timestamp: undefined,
                request: undefined,
              }),
              Response.makePart("tool-params-start", { id: "call-1", name: "write", providerExecuted: false }),
              Response.makePart("tool-params-delta", { id: "call-1", delta: '{"path": "plans/019.md"' }),
            ]),
        }),
        { emit, turn: 3 },
      )

      const error = yield* Stream.runDrain(wrapped.streamText({ prompt: "write" })).pipe(Effect.flip)

      expect(Schema.is(ModelStreamTermination.ModelStreamTruncated)(error)).toBe(true)
      const truncated = error as unknown as ModelStreamTermination.ModelStreamTruncated
      expect(truncated.turn).toBe(3)
      expect(truncated.requestId).toBe("req-1")
      expect(truncated.lastPart).toBe("tool-params-delta")
      expect(truncated.emitted).toEqual({
        _tag: "OpenToolCall",
        toolCallId: "call-1",
        toolName: "write",
        characters: '{"path": "plans/019.md"'.length,
      })
      const [attemptFailed] = byTag(events, "ModelAttemptFailed")
      expect(attemptFailed?.category).toBe("truncated-stream")
    }),
  )

  it.effect("classifies a truncation with nothing emitted as transient and anything emitted as terminal", () => {
    const origin = { turn: 0, provider: undefined, model: undefined }
    return Effect.gen(function* () {
      const nothing = yield* Stream.runDrain(
        ModelStreamTermination.requireTerminal(
          Stream.make(
            Response.makePart("response-metadata", {
              id: "req-1",
              modelId: "m",
              timestamp: undefined,
              request: undefined,
            }),
          ),
          { ...origin, toPart: Function.identity },
        ),
      ).pipe(Effect.flip)
      const displayed = yield* Stream.runDrain(
        ModelStreamTermination.requireTerminal(Stream.make(Response.makePart("text-delta", { id: "t", delta: "hi" })), {
          ...origin,
          toPart: Function.identity,
        }),
      ).pipe(Effect.flip)

      expect(nothing.emitted).toEqual({ _tag: "Nothing" })
      expect(ModelResilience.defaultClassify(nothing)).toBe("transient")
      expect(displayed.emitted).toEqual({ _tag: "DisplayOnly", characters: 2 })
      expect(ModelResilience.defaultClassify(displayed)).toBe("terminal")
    })
  })

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
        streamText: () =>
          Stream.fromIterable([Response.makePart("text-delta", { id: "t1", delta: "once" }), finishPart]),
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
        streamText: () =>
          Stream.fromIterable([Response.makePart("text-delta", { id: "t1", delta: "child" }), finishPart]),
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
          resilience: makeResilience({
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
