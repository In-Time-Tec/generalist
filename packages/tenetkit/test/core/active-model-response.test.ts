import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Schedule, Stream } from "effect"
import { AiError, LanguageModel, Response, Tool } from "effect/unstable/ai"
import { ActiveModelResponse, Agent, ModelResilience } from "../../src/core/index.js"
import { controller } from "../../src/core/model/active-model-response.js"
import { make as makeResponseBuilder } from "../../src/core/model/model-response-builder.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: 1, total: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const noToolAgent = Agent.make({ name: "active-model-response-agent" })

const provideRun = <A, E, R>(
  stream: Stream.Stream<A, E, R | LanguageModel.LanguageModel>,
  handle: ActiveModelResponse.Interface,
  model: Layer.Layer<LanguageModel.LanguageModel>,
  resilience?: Layer.Layer<ModelResilience.ModelResilience, ModelResilience.ModelResilienceMisconfigured>,
) =>
  stream.pipe(
    Stream.provideService(ActiveModelResponse.ActiveModelResponse, handle),
    Stream.provide(resilience === undefined ? model : Layer.merge(model, resilience.pipe(Layer.orDie))),
  )

describe("ActiveModelResponse", () => {
  it.effect("retains normalized visible output across terminal interruption without unfinished tool parameters", () =>
    Effect.gen(function* () {
      const handle = ActiveModelResponse.make()
      const observed = yield* Deferred.make<void>()
      const provider = modelLayer(() =>
        Stream.make(
          Response.makePart("text-delta", { id: "answer", delta: "visible" }),
          Response.makePart("reasoning-delta", { id: "thought", delta: "reasoning" }),
          Response.makePart("tool-params-start", {
            id: "unfinished",
            name: "write",
            providerExecuted: false,
          }),
          Response.makePart("tool-params-delta", { id: "unfinished", delta: '{"path":"cut' }),
        ).pipe(Stream.concat(Stream.never)),
      )
      const run = Agent.stream(noToolAgent, {
        prompt: "interrupt",
        logicalOperationId: "terminal-partial",
      }).pipe(
        Stream.tap((event) =>
          event._tag === "ModelPart" && event.part.type === "tool-params-delta"
            ? Deferred.succeed(observed, undefined)
            : Effect.void,
        ),
      )
      const fiber = yield* provideRun(run, handle, provider).pipe(Stream.runDrain, Effect.forkChild)
      yield* Deferred.await(observed)

      const partial = yield* handle.snapshot
      expect(Option.isSome(partial)).toBe(true)
      if (Option.isSome(partial)) {
        expect(partial.value).toMatchObject({
          operationKey: "terminal-partial:model:0:0:conversation",
          turn: 0,
          modelCallId: "terminal-partial:model-call:0:conversation",
          modelAttemptId: "terminal-partial:model-call:0:conversation:attempt:0",
          attempt: 0,
        })
        expect(partial.value.response.content).toEqual([
          Response.makePart("text", { text: "visible" }),
          Response.makePart("reasoning", { text: "reasoning" }),
        ])
        expect(partial.value.response.content.some((part) => part.type === "tool-call")).toBe(false)
      }

      yield* Fiber.interrupt(fiber)
      expect(Option.isSome(yield* handle.snapshot)).toBe(true)
      expect("accept" in handle).toBe(false)
    }),
  )

  it.effect("discards an internal pre-output retry before publishing the authoritative attempt", () =>
    Effect.gen(function* () {
      const handle = ActiveModelResponse.make()
      const observed = yield* Deferred.make<void>()
      const transient = AiError.make({
        module: "ActiveModelResponseTest",
        method: "streamText",
        reason: AiError.RateLimitError.make({}),
      })
      let attempts = 0
      const provider = modelLayer(() =>
        Stream.suspend(() => {
          attempts += 1
          if (attempts === 1) {
            return Stream.make(
              Response.makePart("response-metadata", {
                id: "discarded-attempt",
                modelId: "test",
                timestamp: undefined,
                request: undefined,
              }) as Response.StreamPartEncoded,
            ).pipe(Stream.concat(Stream.fail(transient)))
          }
          return Stream.make(
            Response.makePart("response-metadata", {
              id: "authoritative-attempt",
              modelId: "test",
              timestamp: undefined,
              request: undefined,
            }) as Response.StreamPartEncoded,
            Response.makePart("text-delta", { id: "answer", delta: "recovered" }),
          ).pipe(Stream.concat(Stream.never))
        }),
      )
      const run = Agent.stream(noToolAgent, {
        prompt: "retry",
        logicalOperationId: "internal-retry",
      }).pipe(
        Stream.tap((event) =>
          event._tag === "ModelPart" && event.part.type === "text-delta"
            ? Deferred.succeed(observed, undefined)
            : Effect.void,
        ),
      )
      const fiber = yield* provideRun(
        run,
        handle,
        provider,
        ModelResilience.layer({ retrySchedule: Schedule.recurs(1) }),
      ).pipe(Stream.runDrain, Effect.forkChild)
      yield* Deferred.await(observed)

      const partial = yield* handle.snapshot
      expect(attempts).toBe(2)
      expect(Option.isSome(partial) && partial.value.attempt).toBe(1)
      expect(
        Option.isSome(partial) &&
          partial.value.response.content.some(
            (part) => part.type === "response-metadata" && part.id === "discarded-attempt",
          ),
      ).toBe(false)
      expect(
        Option.isSome(partial) &&
          partial.value.response.content.some(
            (part) => part.type === "response-metadata" && part.id === "authoritative-attempt",
          ),
      ).toBe(true)

      yield* Fiber.interrupt(fiber)
    }),
  )

  it.effect("clears only after a complete semantic operation commits", () =>
    Effect.gen(function* () {
      const handle = ActiveModelResponse.make()
      const provider = modelLayer(() =>
        Stream.make(Response.makePart("text-delta", { id: "answer", delta: "complete" }), finish),
      )
      const events = yield* provideRun(
        Agent.stream(noToolAgent, { prompt: "complete", logicalOperationId: "complete-response" }),
        handle,
        provider,
      ).pipe(Stream.runCollect)

      expect(Array.from(events).some((event) => event._tag === "ModelResponseCommitted")).toBe(true)
      expect(Option.isNone(yield* handle.snapshot)).toBe(true)
    }),
  )

  it.effect("prevents stale attempts from replacing or clearing a newer response", () =>
    Effect.gen(function* () {
      const handle = ActiveModelResponse.make()
      const control = controller(handle)
      const firstBuilder = makeResponseBuilder<Record<string, Tool.Any>>()
      firstBuilder.accept(Response.makePart("text-delta", { id: "answer", delta: "stale" }))
      const first = control.begin({
        operationKey: "operation",
        turn: 0,
        modelCallId: "call",
        modelAttemptId: "attempt-0",
        attempt: 0,
      })
      control.install(first, firstBuilder)

      const secondBuilder = makeResponseBuilder<Record<string, Tool.Any>>()
      secondBuilder.accept(Response.makePart("text-delta", { id: "answer", delta: "current" }))
      const second = control.begin({
        operationKey: "operation",
        turn: 0,
        modelCallId: "call",
        modelAttemptId: "attempt-1",
        attempt: 1,
      })
      control.install(second, secondBuilder)

      control.install(first, firstBuilder)
      control.discard(first)
      control.clearCommitted(first)

      const current = yield* handle.snapshot
      expect(Option.isSome(current) && current.value.modelAttemptId).toBe("attempt-1")
      expect(
        Option.isSome(current) &&
          current.value.response.content.some((part) => part.type === "text" && part.text === "current"),
      ).toBe(true)

      control.clearCommitted(second)
      expect(Option.isNone(yield* handle.snapshot)).toBe(true)
    }),
  )
})
