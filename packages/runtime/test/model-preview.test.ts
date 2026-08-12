import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Response } from "effect/unstable/ai"
import {
  MaxCadenceMillis,
  MaxPayloadCharacters,
  SubscriberCapacity,
  make,
  type ModelPreviewEvent,
  type ModelPreviewFrame,
} from "../src/model-preview.js"
import type { AgentLoopEvent } from "../src/agent-event.js"

type ModelPart = Extract<AgentLoopEvent, { readonly _tag: "ModelPart" }>

const isFrame = (event: ModelPreviewEvent): event is ModelPreviewFrame => event._tag === "ModelPreview"

const event = (part: ModelPart["part"]): ModelPart => ({
  _tag: "ModelPart",
  turn: 2,
  modelCallId: "call-1",
  modelAttemptId: "attempt-1",
  attempt: 3,
  part,
})

const delta = (channel: "reasoning" | "text", value: string): ModelPart =>
  event(Response.makePart(channel === "text" ? "text-delta" : "reasoning-delta", { id: channel, delta: value }))

const finish = event(
  Response.makePart("finish", {
    reason: "stop",
    usage: Response.Usage.make({
      inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    }),
    response: undefined,
  }),
)

const payloadSize = (frame: ModelPreviewFrame): number =>
  frame.changes.reduce((total, change) => total + change.delta.length, 0)

const reconstruct = (frames: ReadonlyArray<ModelPreviewFrame>) => {
  let reasoning = ""
  let text = ""
  for (const frame of frames) {
    for (const change of frame.changes) {
      if (change.channel === "reasoning") {
        expect(change.offset).toBe(reasoning.length)
        reasoning += change.delta
      } else {
        expect(change.offset).toBe(text.length)
        text += change.delta
      }
    }
  }
  return { reasoning, text }
}

it.effect("reconstructs mixed output beyond 100,000 UTF-16 code units exactly once", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-long", 17)
      const observed = yield* Ref.make<ReadonlyArray<ModelPreviewFrame>>([])
      const complete = yield* Deferred.make<void>()
      const reasoning = `${"reason".repeat(50_000)}😀`
      const text = `${"answer".repeat(60_000)}🧠`
      const expectedFrames =
        Math.ceil(reasoning.length / MaxPayloadCharacters) + Math.ceil(text.length / MaxPayloadCharacters)
      const subscriber = yield* lane.previews("run-long").pipe(
        Stream.filter(isFrame),
        Stream.runForEach((frame) =>
          Ref.updateAndGet(observed, (current) => [...current, frame]).pipe(
            Effect.flatMap((current) =>
              current.length === expectedFrames ? Deferred.succeed(complete, undefined) : Effect.void,
            ),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )

      expect(yield* sink.offer(delta("reasoning", reasoning))).toBe(true)
      yield* Effect.yieldNow
      expect(yield* sink.offer(delta("text", text))).toBe(true)
      yield* Deferred.await(complete)

      const frames = yield* Ref.get(observed)
      expect(frames.map((frame) => frame.sequence)).toEqual(frames.map((_, index) => index))
      expect(frames.every((frame) => payloadSize(frame) <= MaxPayloadCharacters)).toBe(true)
      expect(frames.every((frame) => frame.runId === "run-long" && frame.attemptFence === 17)).toBe(true)
      expect(reconstruct(frames)).toEqual({ reasoning, text })
      yield* Fiber.interrupt(subscriber)
    }),
  ),
)

it.effect("splits oversized deltas without cutting surrogate pairs", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-surrogate", 1)
      const value = `${"a".repeat(MaxPayloadCharacters - 1)}😀${"b".repeat(MaxPayloadCharacters + 5)}🧠`
      const subscriber = yield* lane
        .previews("run-surrogate")
        .pipe(Stream.filter(isFrame), Stream.take(3), Stream.runCollect, Effect.forkChild({ startImmediately: true }))

      expect(yield* sink.offer(delta("text", value))).toBe(true)
      const frames = [...(yield* Fiber.join(subscriber))]
      expect(frames.every((frame) => payloadSize(frame) <= MaxPayloadCharacters)).toBe(true)
      for (const frame of frames) {
        for (const change of frame.changes) {
          const last = change.delta.charCodeAt(change.delta.length - 1)
          const first = change.delta.charCodeAt(0)
          expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
          expect(first >= 0xdc00 && first <= 0xdfff).toBe(false)
        }
      }
      expect(reconstruct(frames).text).toBe(value)
    }),
  ),
)

it.effect("batches ordered channel changes at cadence and flushes them on finish", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-finish", 2)
      const subscriber = yield* lane
        .previews("run-finish")
        .pipe(Stream.filter(isFrame), Stream.take(2), Stream.runCollect, Effect.forkChild({ startImmediately: true }))

      expect(yield* sink.offer(delta("reasoning", "why"))).toBe(true)
      expect(yield* sink.offer(delta("reasoning", " now"))).toBe(false)
      expect(yield* sink.offer(delta("text", "answer"))).toBe(false)
      expect(yield* sink.offer(finish)).toBe(true)

      const frames = [...(yield* Fiber.join(subscriber))]
      expect(frames.map((frame) => frame.sequence)).toEqual([0, 1])
      expect(frames[1]?.changes).toEqual([
        { channel: "reasoning", offset: 3, delta: " now" },
        { channel: "text", offset: 0, delta: "answer" },
      ])
      expect(reconstruct(frames)).toEqual({ reasoning: "why now", text: "answer" })
    }),
  ),
)

it.effect("flushes a cadence buffer without waiting for another provider part", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-cadence", 21)
      const observed = yield* Ref.make<ReadonlyArray<ModelPreviewFrame>>([])
      const second = yield* Deferred.make<void>()
      const subscriber = yield* lane.previews("run-cadence").pipe(
        Stream.filter(isFrame),
        Stream.runForEach((frame) =>
          Ref.updateAndGet(observed, (current) => [...current, frame]).pipe(
            Effect.flatMap((current) => (current.length === 2 ? Deferred.succeed(second, undefined) : Effect.void)),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )

      expect(yield* sink.offer(delta("text", "first"))).toBe(true)
      expect(yield* sink.offer(delta("text", "second"))).toBe(false)
      yield* TestClock.adjust(`${MaxCadenceMillis - 1} millis`)
      expect((yield* Ref.get(observed)).map((frame) => frame.sequence)).toEqual([0])
      yield* TestClock.adjust("1 milli")
      yield* Deferred.await(second)
      expect(reconstruct(yield* Ref.get(observed)).text).toBe("firstsecond")
      yield* Fiber.interrupt(subscriber)
    }),
  ),
)

it.effect("a prior attempt timer cannot flush a newer attempt before its own deadline", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-attempt-timer", 22)
      const observed = yield* Ref.make<ReadonlyArray<ModelPreviewFrame>>([])
      const fourth = yield* Deferred.make<void>()
      const subscriber = yield* lane.previews("run-attempt-timer").pipe(
        Stream.filter(isFrame),
        Stream.runForEach((frame) =>
          Ref.updateAndGet(observed, (current) => [...current, frame]).pipe(
            Effect.flatMap((current) => (current.length === 4 ? Deferred.succeed(fourth, undefined) : Effect.void)),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )

      expect(yield* sink.offer(delta("text", "old-1"))).toBe(true)
      expect(yield* sink.offer(delta("text", "old-2"))).toBe(false)
      yield* TestClock.adjust("10 millis")
      expect(yield* sink.offer(finish)).toBe(true)
      const next = (value: string): ModelPart => ({
        ...delta("text", value),
        modelAttemptId: "attempt-2",
        attempt: 4,
      })
      expect(yield* sink.offer(next("new-1"))).toBe(true)
      expect(yield* sink.offer(next("new-2"))).toBe(false)

      yield* TestClock.adjust("40 millis")
      expect((yield* Ref.get(observed)).map((frame) => frame.sequence)).toEqual([0, 1, 0])
      yield* TestClock.adjust("10 millis")
      yield* Deferred.await(fourth)
      expect((yield* Ref.get(observed)).map((frame) => frame.sequence)).toEqual([0, 1, 0, 1])
      yield* Fiber.interrupt(subscriber)
    }),
  ),
)

it.effect("flushes pending content on provider error", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-error", 3)
      const subscriber = yield* lane
        .previews("run-error")
        .pipe(Stream.filter(isFrame), Stream.take(2), Stream.runCollect, Effect.forkChild({ startImmediately: true }))

      expect(yield* sink.offer(delta("text", "first"))).toBe(true)
      expect(yield* sink.offer(delta("text", " pending"))).toBe(false)
      expect(yield* sink.offer(event(Response.makePart("error", { error: new Error("provider failed") })))).toBe(true)

      const frames = [...(yield* Fiber.join(subscriber))]
      expect(reconstruct(frames).text).toBe("first pending")
      expect(frames.map((frame) => frame.sequence)).toEqual([0, 1])
    }),
  ),
)

it.effect("flushes a full cadence buffer before the cadence elapses without an empty frame", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-limit", 4)
      const subscriber = yield* lane
        .previews("run-limit")
        .pipe(Stream.filter(isFrame), Stream.take(2), Stream.runCollect, Effect.forkChild({ startImmediately: true }))

      expect(yield* sink.offer(delta("text", "a"))).toBe(true)
      expect(yield* sink.offer(delta("text", "b".repeat(MaxPayloadCharacters)))).toBe(true)
      expect(yield* sink.offer(finish)).toBe(false)

      const frames = [...(yield* Fiber.join(subscriber))]
      expect(frames.map(payloadSize)).toEqual([1, MaxPayloadCharacters])
      expect(frames.every((frame) => frame.changes.every((change) => change.delta.length > 0))).toBe(true)
      expect(reconstruct(frames).text).toBe(`a${"b".repeat(MaxPayloadCharacters)}`)
    }),
  ),
)

it.effect("a dropped subscriber does not block offers and the next accepted frame exposes its sequence gap", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-slow", 5)
      const observed = yield* Ref.make<ReadonlyArray<number>>([])
      const first = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const drained = yield* Deferred.make<void>()
      const gap = yield* Deferred.make<void>()
      const subscriber = yield* lane.previews("run-slow").pipe(
        Stream.filter(isFrame),
        Stream.runForEach((frame) =>
          Ref.updateAndGet(observed, (current) => [...current, frame.sequence]).pipe(
            Effect.tap((current) => (current.length === 1 ? Deferred.succeed(first, undefined) : Effect.void)),
            Effect.tap((current) =>
              current.length === SubscriberCapacity + 1 ? Deferred.succeed(drained, undefined) : Effect.void,
            ),
            Effect.tap((current) =>
              current.length === SubscriberCapacity + 2 ? Deferred.succeed(gap, undefined) : Effect.void,
            ),
            Effect.andThen(Deferred.await(release)),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )

      expect(yield* sink.offer(delta("text", "0".repeat(MaxPayloadCharacters)))).toBe(true)
      yield* Deferred.await(first)
      for (let index = 0; index < SubscriberCapacity + 5; index++) {
        expect(yield* sink.offer(delta("text", "x".repeat(MaxPayloadCharacters)))).toBe(true)
      }
      yield* Deferred.succeed(release, undefined)
      yield* Deferred.await(drained)
      expect(yield* sink.offer(delta("text", "z".repeat(MaxPayloadCharacters)))).toBe(true)
      yield* Deferred.await(gap)

      const sequences = yield* Ref.get(observed)
      expect(sequences.slice(0, SubscriberCapacity + 1)).toEqual(
        Array.from({ length: SubscriberCapacity + 1 }, (_, index) => index),
      )
      expect(sequences.at(-1)).toBe(SubscriberCapacity + 6)
      yield* Fiber.interrupt(subscriber)
    }),
  ),
)

it.effect("serializes concurrent offers into exact sequences and offsets", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-concurrent", 8)
      const subscriber = yield* lane
        .previews("run-concurrent")
        .pipe(Stream.filter(isFrame), Stream.take(20), Stream.runCollect, Effect.forkChild({ startImmediately: true }))

      yield* Effect.forEach(
        Array.from({ length: 20 }, (_, index) => index),
        (index) => sink.offer(delta("text", String(index).padStart(MaxPayloadCharacters, "x"))),
        { concurrency: "unbounded", discard: true },
      )

      const frames = [...(yield* Fiber.join(subscriber))]
      expect(frames.map((frame) => frame.sequence)).toEqual(frames.map((_, index) => index))
      expect(reconstruct(frames).text.length).toBe(20 * MaxPayloadCharacters)
      const [latest] = yield* lane.previews("run-concurrent").pipe(Stream.take(1), Stream.runCollect)
      expect(latest).toMatchObject({ _tag: "ModelPreview", sequence: 19 })
    }),
  ),
)

it.effect("a late subscriber sees the latest bounded frame with offsets that expose missing output", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const sink = yield* lane.open("run-late", 6)
      expect(yield* sink.offer(delta("text", "first"))).toBe(true)
      yield* TestClock.adjust(`${MaxCadenceMillis} millis`)
      expect(yield* sink.offer(delta("text", "second"))).toBe(true)

      const [latest] = yield* lane.previews("run-late").pipe(Stream.take(1), Stream.runCollect)
      expect(latest).toMatchObject({
        _tag: "ModelPreview",
        sequence: 1,
        changes: [{ channel: "text", offset: 5, delta: "second" }],
      })
    }),
  ),
)

it.effect("closes offers and emits one clear tombstone with the execution scope", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const lane = yield* make
      const observed = yield* Ref.make<ReadonlyArray<ModelPreviewEvent>>([])
      const cleared = yield* Deferred.make<void>()
      const subscriber = yield* lane.previews("run-clear").pipe(
        Stream.runForEach((item) =>
          Ref.update(observed, (current) => [...current, item]).pipe(
            Effect.andThen(item._tag === "ModelPreviewCleared" ? Deferred.succeed(cleared, undefined) : Effect.void),
          ),
        ),
        Effect.forkChild({ startImmediately: true }),
      )
      const sink = yield* lane.open("run-clear", 7)
      expect(yield* sink.offer(delta("text", "live"))).toBe(true)
      yield* sink.clear
      yield* Deferred.await(cleared)
      expect(yield* sink.offer(delta("text", "late"))).toBe(false)
      expect((yield* Ref.get(observed)).at(-1)).toEqual({
        _tag: "ModelPreviewCleared",
        runId: "run-clear",
        attemptFence: 7,
        generation: 2,
      })
      yield* Fiber.interrupt(subscriber)
    }),
  ),
)
