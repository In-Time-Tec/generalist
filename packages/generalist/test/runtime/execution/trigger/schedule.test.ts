import { objectRuntimeLayer } from "../object.js"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Queue, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LanguageModel, Response, Toolkit } from "effect/unstable/ai"
import { Agent } from "generalist"
import { ExecutableResolver, LocalScheduler, Runtime } from "generalist/runtime"
import { allowAllAuthorization } from "../../../authorization.js"
import { provideScoped } from "../scoped-provide.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const agent = Agent.make({ name: "schedule-test", toolkit: Toolkit.empty })
const fixture = Effect.gen(function* () {
  const calls = yield* Queue.unbounded<void>()
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText: () =>
        Stream.concat(
          Stream.fromEffect(Queue.offer(calls, undefined)).pipe(Stream.drain),
          Stream.fromIterable<Response.StreamPartEncoded>([
            Response.makePart("text-delta", { id: "done", delta: "scheduled" }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          ]),
        ),
    }),
  )
  return {
    called: Queue.take(calls),
    layer: Layer.mergeAll(
      objectRuntimeLayer({ addresses: [], schedulerMode: "poll", scheduler: { pollInterval: "100 millis" } }).pipe(
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      ),
      model,
      allowAllAuthorization,
    ),
  }
})

it.effect("fires fixed UTC recurrences from the Runtime-scoped scheduler under TestClock", () =>
  Effect.gen(function* () {
    const state = yield* fixture
    return yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        const scheduler = yield* LocalScheduler.LocalScheduler
        yield* runtime.register(agent)
        const receipt = yield* runtime.schedule(agent, "run", {
          rrule: "FREQ=SECONDLY",
          sessionId: "schedule-session",
        })
        expect(receipt.scheduleId).toMatch(/^schedule_/)
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(0)

        yield* TestClock.adjust("1100 millis")
        yield* state.called
        yield* scheduler.idle
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(1)
        yield* TestClock.adjust("1 second")
        yield* state.called
        yield* scheduler.idle
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(2)
      }),
    )
  }),
)

it.effect("registers a stable schedule idempotently", () =>
  Effect.gen(function* () {
    const state = yield* fixture
    return yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        yield* runtime.register(agent)
        const options = {
          rrule: "FREQ=SECONDLY",
          sessionId: "stable-schedule-session",
          scheduleId: "schedule_stable_test",
        } as const
        const first = yield* runtime.schedule(agent, "run", options)
        const second = yield* runtime.schedule(agent, "run", options)

        expect(second).toEqual(first)
        yield* TestClock.adjust("1100 millis")
        yield* state.called
        expect(yield* runtime.list({ limit: 10 })).toHaveLength(1)
      }),
    )
  }),
)

it.effect("rejects recurrence rules outside the documented interval subset", () =>
  Effect.gen(function* () {
    const state = yield* fixture
    return yield* provideScoped(
      state.layer,
      Effect.gen(function* () {
        const runtime = yield* Runtime.Runtime
        yield* runtime.register(agent)
        const failure = yield* runtime
          .schedule(agent, "run", { rrule: "FREQ=WEEKLY;BYDAY=MO", sessionId: "invalid-schedule" })
          .pipe(Effect.flip)
        expect(failure._tag).toBe("generalist/runtime/ScheduleInvalid")
      }),
    )
  }),
)
