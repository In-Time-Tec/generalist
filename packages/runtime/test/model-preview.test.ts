import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Response } from "effect/unstable/ai"
import { MaxCadenceMillis, MaxCharacters, make } from "../src/model-preview.js"
import type { AgentLoopEvent } from "../src/agent-event.js"

type ModelPart = Extract<AgentLoopEvent, { readonly _tag: "ModelPart" }>

const event = (part: ModelPart["part"]): ModelPart => ({
  _tag: "ModelPart",
  turn: 2,
  modelCallId: "call-1",
  modelAttemptId: "attempt-1",
  attempt: 3,
  part,
})

const finish = Response.makePart("finish", {
  reason: "stop",
  usage: Response.Usage.make({
    inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }),
  response: undefined,
})

it.effect("bounds cumulative previews and silently conflates a slow subscriber", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-1", 17)
      const observed = yield* Ref.make<ReadonlyArray<import("../src/model-preview.js").ModelPreview>>([])
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const subscriber = yield* lane.previews("run-1").pipe(
        Stream.runForEach((preview) =>
          Ref.updateAndGet(observed, (current) => [...current, preview]).pipe(
            Effect.tap((current) =>
              current.length === 1 ? Deferred.succeed(first, undefined) : Deferred.succeed(second, undefined),
            ),
            Effect.andThen(Deferred.await(release)),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )

      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "" })))).toBe(false)
      expect(yield* sink.offer(event(Response.makePart("reasoning-delta", { id: "reasoning", delta: "why" })))).toBe(
        true,
      )
      yield* Deferred.await(first)

      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "a" })))).toBe(true)
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "b" })))).toBe(true)
      expect(
        yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "x".repeat(MaxCharacters * 2) }))),
      ).toBe(false)
      expect(yield* sink.offer(event(finish))).toBe(true)
      yield* Effect.yieldNow

      yield* Deferred.succeed(release, undefined)
      yield* Deferred.await(second)
      const snapshots = yield* Ref.get(observed)
      expect(snapshots).toHaveLength(2)
      expect(snapshots.map((preview) => preview.revision)).toEqual([1, 4])
      expect(snapshots[1]).toMatchObject({
        runId: "run-1",
        attemptFence: 17,
        turn: 2,
        modelCallId: "call-1",
        modelAttemptId: "attempt-1",
        attempt: 3,
        truncated: true,
      })
      expect(snapshots[1]!.text.length + snapshots[1]!.reasoning.length).toBe(MaxCharacters)
      yield* Fiber.interrupt(subscriber)
    }),
  ),
)

it.effect("closes the fixed offer slot with its execution scope", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* Effect.scoped(lane.open("run-closed", 1))
      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "late" })))).toBe(false)
    }),
  ),
)
