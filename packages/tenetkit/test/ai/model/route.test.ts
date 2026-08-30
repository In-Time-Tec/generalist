import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Schedule, Schema, Scope, Stream } from "effect"
import { AiError, LanguageModel, Response } from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ModelResilience, ToolExecutor } from "tenetkit"
import { make, type Route } from "../../../src/ai/model/route.js"

const usage = Response.Usage.make({
  inputTokens: { uncached: undefined, total: 3, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 2, text: undefined, reasoning: undefined },
})
const finish = Response.makePart("finish", { reason: "stop", usage, response: undefined })
const unavailable = AiError.make({
  module: "RouteTest",
  method: "streamText",
  reason: AiError.RateLimitError.make({}),
})
const unavailableWithUsage = AiError.make({
  module: "RouteTest",
  method: "streamText",
  reason: AiError.InvalidOutputError.make({
    description: "provider unavailable after accepting input",
    usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
  }),
})
const terminal = AiError.make({
  module: "RouteTest",
  method: "streamText",
  reason: AiError.AuthenticationError.make({ kind: "InvalidKey" }),
})

const isUnavailableWithUsage: ModelRegistry.AvailabilityFailureClassifier = (error) => {
  const decoded = Schema.decodeUnknownOption(AiError.AiError)(error)
  if (Option.isNone(decoded)) return false
  return (
    decoded.value.reason._tag === "InvalidOutputError" &&
    decoded.value.reason.description === "provider unavailable after accepting input"
  )
}

const model = (streamText: () => Stream.Stream<Response.StreamPartEncoded, AiError.AiError>) =>
  LanguageModel.make({
    generateText: () => Effect.die("unexpected generateText"),
    streamText,
  })

const registration = (
  provider: string,
  streamText: () => Stream.Stream<Response.StreamPartEncoded, AiError.AiError>,
  calls: Array<string>,
  isAvailabilityFailure: ModelRegistry.AvailabilityFailureClassifier = (error) =>
    AiError.isAiError(error) && error.reason._tag === "RateLimitError",
) =>
  ModelRegistry.registration({
    provider,
    model: "test",
    registrationKey: "account",
    layer: Layer.effect(
      LanguageModel.LanguageModel,
      model(() => {
        calls.push(provider)
        return streamText()
      }),
    ),
    isAvailabilityFailure,
  })

const provideScoped = <A, E, R, A2, E2, R2>(
  layer: Layer.Layer<A2, E2, R2>,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>> =>
  Effect.scoped(Effect.flatMap(Layer.build(layer), (context) => effect.pipe(Effect.provideContext(context))))

const run = (route: Route, resilience: ModelResilience.Service = ModelResilience.none) =>
  Stream.runCollect(Agent.stream(Agent.make({ name: "route", model: route.selection }), { prompt: "go" })).pipe(
    (effect) =>
      provideScoped(
        Layer.mergeAll(
          ModelRegistry.layer([Effect.succeed(route.registration)]),
          ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool") }),
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
          ModelResilience.layerTest(resilience).pipe(Layer.orDie),
        ),
        effect,
      ),
  )

describe("ordered model route", () => {
  it.effect("retries one candidate before advancing with global attempt identity and separate usage", () =>
    Effect.gen(function* () {
      const calls: Array<string> = []
      let primaryCalls = 0
      const primary = yield* registration(
        "primary",
        () => (++primaryCalls <= 2 ? Stream.fail(unavailableWithUsage) : Stream.make(finish)),
        calls,
        isUnavailableWithUsage,
      )
      const fallback = yield* registration(
        "fallback",
        () => Stream.make(Response.makePart("text-delta", { id: "text", delta: "ok" }), finish),
        calls,
      )
      const route = yield* make({ candidates: [primary, fallback] })
      const resilience = yield* ModelResilience.make({
        retrySchedule: Schedule.recurs(1),
        classify: (error) => (isUnavailableWithUsage(error) ? "transient" : "terminal"),
      })
      const events = yield* run(route, resilience)
      const started = events.filter((event) => event._tag === "ModelAttemptStarted")
      const failed = events.filter((event) => event._tag === "ModelAttemptFailed")

      expect(calls).toEqual(["primary", "primary", "fallback"])
      expect(started.map((event) => [event.attempt, event.candidate, event.provider, event.registrationKey])).toEqual([
        [0, 0, "primary", "account"],
        [1, 0, "primary", "account"],
        [2, 1, "fallback", "account"],
      ])
      expect(failed.map((event) => event.disposition)).toEqual(["retry", "fallback"])
      expect(events.filter((event) => event._tag === "ModelFallbackScheduled")).toHaveLength(1)
      const completed = events.find((event) => event._tag === "ModelCallCompleted")
      expect(completed?._tag === "ModelCallCompleted" && completed.usage?.outputTokens.total).toBe(2)
      expect(completed?._tag === "ModelCallCompleted" && completed.failedAttemptUsage).toEqual({
        inputTokens: 14,
        outputTokens: 6,
        totalTokens: 20,
      })
    }),
  )

  it.effect("keeps terminal failures and escaped reasoning, text, and tool calls on the active candidate", () =>
    Effect.gen(function* () {
      for (const escaped of [
        Response.makePart("reasoning-delta", { id: "reasoning", delta: "thinking" }),
        Response.makePart("text-delta", { id: "text", delta: "answer" }),
        Response.makePart("tool-call", { id: "call", name: "unknown", params: {}, providerExecuted: false }),
      ]) {
        const calls: Array<string> = []
        const primary = yield* registration(
          "primary",
          () => Stream.make(escaped).pipe(Stream.concat(Stream.fail(unavailable))),
          calls,
        )
        const fallback = yield* registration("fallback", () => Stream.make(finish), calls)
        const route = yield* make({ candidates: [primary, fallback] })
        yield* run(route).pipe(Effect.exit)
        expect(calls).toEqual(["primary"])
      }

      const calls: Array<string> = []
      const primary = yield* registration("primary", () => Stream.fail(terminal), calls)
      const fallback = yield* registration("fallback", () => Stream.make(finish), calls)
      const route = yield* make({ candidates: [primary, fallback] })
      yield* run(route).pipe(Effect.exit)
      expect(calls).toEqual(["primary"])
    }),
  )

  it.effect("interrupts the active candidate without starting the next candidate", () =>
    Effect.gen(function* () {
      const calls: Array<string> = []
      const entered = yield* Deferred.make<void>()
      const primary = yield* registration(
        "primary",
        () => Stream.fromEffect(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))),
        calls,
      )
      const fallback = yield* registration("fallback", () => Stream.make(finish), calls)
      const route = yield* make({ candidates: [primary, fallback] })
      const fiber = yield* run(route).pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      yield* Fiber.interrupt(fiber)
      expect(calls).toEqual(["primary"])
    }),
  )

  it.effect("changes exact route identity when candidate order changes", () =>
    Effect.gen(function* () {
      const calls: Array<string> = []
      const first = yield* registration("first", () => Stream.make(finish), calls)
      const second = yield* registration("second", () => Stream.make(finish), calls)
      const left = yield* make({ candidates: [first, second] })
      const same = yield* make({ candidates: [first, second] })
      const reversed = yield* make({ candidates: [second, first] })
      expect(left.selection).toEqual(same.selection)
      expect(left.selection).not.toEqual(reversed.selection)
    }),
  )
})
