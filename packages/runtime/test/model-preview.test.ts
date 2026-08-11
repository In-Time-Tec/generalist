import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Response } from "effect/unstable/ai"
import {
  MaxCadenceMillis,
  MaxCharacters,
  make,
  type ModelPreview,
  type PreviewCleared,
  type PreviewFrame,
} from "../src/model-preview.js"
import type { AgentLoopEvent } from "../src/agent-event.js"

type ModelPart = Extract<AgentLoopEvent, { readonly _tag: "ModelPart" }>

const isPreview = (frame: PreviewFrame): frame is ModelPreview => !("_tag" in frame)

const event = (part: ModelPart["part"]): ModelPart => ({
  _tag: "ModelPart",
  turn: 2,
  modelCallId: "call-1",
  modelAttemptId: "attempt-1",
  attempt: 3,
  part,
})

const eventWith =
  (identity: Partial<Pick<ModelPart, "turn" | "modelCallId" | "modelAttemptId" | "attempt">>) =>
  (part: ModelPart["part"]): ModelPart => ({
    ...event(part),
    ...identity,
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
      const observed = yield* Ref.make<ReadonlyArray<PreviewFrame>>([])
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const subscriber = yield* lane.previews("run-1").pipe(
        Stream.runForEach((frame) =>
          Ref.updateAndGet(observed, (current) => [...current, frame]).pipe(
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
      const snapshots = (yield* Ref.get(observed)).filter(isPreview)
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

it.effect("keeps interleaved runs on one runtime from evicting each other", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const first = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const runOne = yield* Ref.make<ReadonlyArray<PreviewFrame>>([])
      const runTwo = yield* Ref.make<ReadonlyArray<PreviewFrame>>([])
      const slow = yield* lane.previews("run-1").pipe(
        Stream.runForEach((frame) =>
          Ref.updateAndGet(runOne, (current) => [...current, frame]).pipe(
            Effect.tap((current) => (current.length === 1 ? Deferred.succeed(first, undefined) : Effect.void)),
            Effect.andThen(Deferred.await(release)),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )
      const fast = yield* lane.previews("run-2").pipe(
        Stream.runForEach((frame) => Ref.update(runTwo, (current) => [...current, frame])),
        Effect.forkChild({ startImmediately: true }),
      )
      const one = yield* lane.open("run-1", 1)
      const two = yield* lane.open("run-2", 2)

      expect(yield* one.offer(event(Response.makePart("text-delta", { id: "text", delta: "a" })))).toBe(true)
      yield* Deferred.await(first)
      expect(yield* two.offer(event(Response.makePart("text-delta", { id: "text", delta: "a" })))).toBe(true)
      yield* Effect.yieldNow

      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* one.offer(event(Response.makePart("text-delta", { id: "text", delta: "b" })))).toBe(true)
      yield* Effect.yieldNow
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* two.offer(event(Response.makePart("text-delta", { id: "text", delta: "b" })))).toBe(true)
      yield* Effect.yieldNow

      yield* Deferred.succeed(release, undefined)
      yield* Effect.yieldNow
      const oneFrames = (yield* Ref.get(runOne)).filter(isPreview)
      const twoFrames = (yield* Ref.get(runTwo)).filter(isPreview)
      expect(oneFrames.map((frame) => frame.revision)).toEqual([1, 2])
      expect(oneFrames.every((frame) => frame.runId === "run-1" && frame.attemptFence === 1)).toBe(true)
      expect(twoFrames.map((frame) => frame.revision)).toEqual([1, 2])
      expect(twoFrames.every((frame) => frame.runId === "run-2" && frame.attemptFence === 2)).toBe(true)
      yield* Fiber.interrupt(slow)
      yield* Fiber.interrupt(fast)
    }),
  ),
)

it.effect("replays the retained cumulative snapshot to a late subscriber immediately", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-1", 7)
      const publishedSecond = yield* Deferred.make<void>()
      yield* lane.previews("run-1").pipe(
        Stream.runForEach((frame) =>
          isPreview(frame) && frame.revision === 2 ? Deferred.succeed(publishedSecond, undefined) : Effect.void,
        ),
        Effect.forkChild({ startImmediately: true }),
      )

      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "a" })))).toBe(true)
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "b" })))).toBe(true)
      yield* Deferred.await(publishedSecond)

      const late = yield* lane
        .previews("run-1")
        .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
      const [replayed] = yield* Fiber.join(late)
      expect(replayed).toMatchObject({ runId: "run-1", attemptFence: 7, revision: 2, text: "ab" })

      const following = yield* lane
        .previews("run-1")
        .pipe(Stream.take(2), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "c" })))).toBe(true)
      const frames = yield* Fiber.join(following)
      expect(frames.map((frame) => (isPreview(frame) ? frame.revision : frame._tag))).toEqual([2, 3])
      expect(frames.map((frame) => (isPreview(frame) ? frame.text : frame._tag))).toEqual(["ab", "abc"])
    }),
  ),
)

it.effect("cannot publish a stale preview after clear (take-then-publish race)", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-1", 3)
      const first = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const observed = yield* Ref.make<ReadonlyArray<PreviewFrame>>([])
      const subscriber = yield* lane.previews("run-1").pipe(
        Stream.runForEach((frame) =>
          Ref.updateAndGet(observed, (current) => [...current, frame]).pipe(
            Effect.tap((current) => (current.length === 1 ? Deferred.succeed(first, undefined) : Effect.void)),
            Effect.andThen(Deferred.await(release)),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )

      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "a" })))).toBe(true)
      yield* Deferred.await(first)
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "stale" })))).toBe(true)
      yield* sink.clear
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      yield* Deferred.succeed(release, undefined)
      yield* Effect.yieldNow

      const frames = yield* Ref.get(observed)
      expect(frames.filter(isPreview).map((frame) => frame.text)).toEqual(["a"])
      expect(frames.filter((frame): frame is PreviewCleared => "_tag" in frame)).toHaveLength(1)
      expect(frames.at(-1)).toMatchObject({ _tag: "Cleared", runId: "run-1", attemptFence: 3, generation: 1 })
      yield* Fiber.interrupt(subscriber)
    }),
  ),
)

it.effect("emits a clear tombstone, drops the retained snapshot, and reactivates on the next offer", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-1", 5)
      const frames = yield* Ref.make<ReadonlyArray<PreviewFrame>>([])
      const first = yield* Deferred.make<void>()
      const cleared = yield* Deferred.make<void>()
      const reactivated = yield* Deferred.make<void>()
      const follower = yield* lane.previews("run-1").pipe(
        Stream.runForEach((frame) =>
          Ref.updateAndGet(frames, (current) => [...current, frame]).pipe(
            Effect.andThen(
              Effect.gen(function* () {
                const current = yield* Ref.get(frames)
                if (current.length === 1) yield* Deferred.succeed(first, undefined)
                if (current.length === 2) yield* Deferred.succeed(cleared, undefined)
                if (current.length === 3) yield* Deferred.succeed(reactivated, undefined)
              }),
            ),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )
      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "a" })))).toBe(true)
      yield* Deferred.await(first)
      yield* sink.clear
      yield* Deferred.await(cleared)

      const late = yield* lane
        .previews("run-1")
        .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(event(Response.makePart("text-delta", { id: "text", delta: "b" })))).toBe(true)

      const [replayed] = yield* Fiber.join(late)
      expect(replayed).toMatchObject({ runId: "run-1", attemptFence: 5, revision: 1, text: "b" })
      yield* Deferred.await(reactivated)
      const collected = yield* Ref.get(frames)
      expect(collected.map((frame) => (isPreview(frame) ? `preview:${frame.revision}` : frame._tag))).toEqual([
        "preview:1",
        "Cleared",
        "preview:1",
      ])
      yield* Fiber.interrupt(follower)
    }),
  ),
)

it.effect("keeps per-run revisions monotonic within each provider identity", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-1", 9)
      const subscriber = yield* lane
        .previews("run-1")
        .pipe(Stream.take(4), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
      const delta = (text: string) => Response.makePart("text-delta", { id: "text", delta: text })

      expect(yield* sink.offer(event(delta("a")))).toBe(true)
      yield* Effect.yieldNow
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(event(delta("b")))).toBe(true)
      yield* Effect.yieldNow
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(eventWith({ turn: 3, modelCallId: "call-2" })(delta("c")))).toBe(true)
      yield* Effect.yieldNow
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(eventWith({ turn: 3, modelCallId: "call-2" })(delta("d")))).toBe(true)

      const snapshots = (yield* Fiber.join(subscriber)).filter(isPreview)
      expect(snapshots.map((frame) => frame.revision)).toEqual([1, 2, 1, 2])
      expect(snapshots.map((frame) => frame.text)).toEqual(["a", "ab", "c", "cd"])
      expect(snapshots.slice(0, 2).every((frame) => frame.turn === 2 && frame.modelCallId === "call-1")).toBe(true)
      expect(snapshots.slice(2).every((frame) => frame.turn === 3 && frame.modelCallId === "call-2")).toBe(true)
      expect(snapshots.every((frame) => frame.runId === "run-1" && frame.attemptFence === 9)).toBe(true)
    }),
  ),
)
