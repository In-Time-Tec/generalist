import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Option, Queue } from "effect"
import { Prompt } from "effect/unstable/ai"
import { makeFrameJournal } from "../src/frame-journal.js"
import type { FrameWithoutSeq } from "../src/frame-journal.js"
import type { SessionError, SubscriberLagged } from "../src/session-registry-errors.js"
import type { LooseServerFrameType } from "../src/wire.js"

const status = (turn: number) => ({ _tag: "SessionStatus" as const, status: { _tag: "Running" as const, turn } })

const makeQueue = (capacity: number) => Queue.dropping<LooseServerFrameType, SessionError | SubscriberLagged>(capacity)

describe("frame journal", () => {
  it.effect("snapshots the complete transcript for cursorless replay after truncation", () =>
    Effect.gen(function* () {
      const transcript = Prompt.make("complete history")
      const journal = yield* makeFrameJournal({ sessionId: "cursorless", capacity: 1, initialTranscript: transcript })
      yield* journal.publish(status(0))
      yield* journal.publish(status(1))

      const queue = yield* makeQueue(8)
      const capture = yield* journal.subscribe(queue)

      expect(Option.isSome(capture.snapshot)).toBe(true)
      if (Option.isSome(capture.snapshot)) {
        expect(capture.snapshot.value.throughSeq).toBe(1)
        expect(capture.snapshot.value.transcript).toBe(transcript)
      }
      expect(capture.replay).toEqual([])
    }),
  )

  it.effect("captures transcript publication and its frame boundary atomically", () =>
    Effect.gen(function* () {
      const initialTranscript = Prompt.make("initial")
      const newerTranscript = Prompt.make("newer")
      const secondAllocated = yield* Deferred.make<void>()
      const releaseSecond = yield* Deferred.make<void>()
      const journal = yield* makeFrameJournal({
        sessionId: "point-in-time",
        capacity: 1,
        initialTranscript,
        onAllocated: (frame) =>
          frame.seq === 1
            ? Deferred.succeed(secondAllocated, undefined).pipe(Effect.andThen(Deferred.await(releaseSecond)))
            : Effect.void,
      })
      yield* journal.publish(status(0))
      const publisher = yield* journal.publish(status(1), newerTranscript).pipe(Effect.forkChild)
      yield* Deferred.await(secondAllocated)

      const queue = yield* makeQueue(8)
      const subscriber = yield* journal.subscribe(queue, -2).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Deferred.succeed(releaseSecond, undefined)
      yield* Fiber.join(publisher)
      const capture = yield* Fiber.join(subscriber)

      expect(Option.isSome(capture.snapshot)).toBe(true)
      if (Option.isSome(capture.snapshot)) {
        expect(capture.snapshot.value.throughSeq).toBe(1)
        expect(capture.snapshot.value.transcript).toBe(newerTranscript)
      }
      expect(capture.replay).toEqual([])
    }),
  )

  it.effect("delivers only strictly newer frames after a concurrent snapshot boundary", () =>
    Effect.gen(function* () {
      const journal = yield* makeFrameJournal({
        sessionId: "boundary",
        capacity: 1,
        initialTranscript: Prompt.make("history"),
      })
      yield* journal.publish(status(0))
      yield* journal.publish(status(1))
      const queue = yield* makeQueue(8)
      const capture = yield* journal.subscribe(queue, -2)
      yield* journal.publish(status(2))
      const live = yield* Queue.take(queue)

      expect(Option.isSome(capture.snapshot)).toBe(true)
      if (Option.isSome(capture.snapshot)) expect(capture.snapshot.value.throughSeq).toBe(1)
      expect(capture.replay).toEqual([])
      expect(live.seq).toBe(2)
    }),
  )

  it.effect("owns monotonic sequence, bounded replay, and stale snapshot plans", () =>
    Effect.gen(function* () {
      const journal = yield* makeFrameJournal({ sessionId: "journal", capacity: 2, initialTranscript: Prompt.empty })
      yield* journal.publish(status(0))
      yield* journal.publish(status(1))
      yield* journal.publish(status(2))

      const replayQueue = yield* makeQueue(8)
      const replay = yield* journal.subscribe(replayQueue, 0)
      const staleQueue = yield* makeQueue(8)
      const stale = yield* journal.subscribe(staleQueue, -1)

      expect(replay.replay.map((frame) => frame.seq)).toEqual([1, 2])
      expect(Option.isNone(replay.snapshot)).toBe(true)
      expect(stale.replay).toEqual([])
      expect(Option.isSome(stale.snapshot)).toBe(true)
      if (Option.isSome(stale.snapshot)) expect(stale.snapshot.value.throughSeq).toBe(2)
      expect(yield* journal.lastSeq).toBe(2)
    }),
  )

  it.effect("buffers and replays runtime-dynamic activation and tool events", () =>
    Effect.gen(function* () {
      const inputs: ReadonlyArray<FrameWithoutSeq> = [
        {
          _tag: "Event",
          event: {
            _tag: "ToolExecutionStarted",
            turn: 0,
            call: { type: "tool-call", id: "activate-1", name: "activate_skill", params: { name: "review" } },
          },
        },
        {
          _tag: "Event",
          event: {
            _tag: "ToolExecutionCompleted",
            turn: 0,
            call: { type: "tool-call", id: "activate-1", name: "activate_skill", params: { name: "review" } },
            result: {
              type: "tool-result",
              id: "activate-1",
              name: "activate_skill",
              result: { activated: "review" },
              isFailure: false,
            },
          },
        },
        {
          _tag: "Event",
          event: {
            _tag: "ToolExecutionStarted",
            turn: 1,
            call: { type: "tool-call", id: "review-1", name: "review_tool", params: { path: "src" } },
          },
        },
        {
          _tag: "Event",
          event: { _tag: "ToolProgress", turn: 1, toolCallId: "review-1", message: "reviewing" },
        },
        {
          _tag: "Event",
          event: {
            _tag: "ToolExecutionCompleted",
            turn: 1,
            call: { type: "tool-call", id: "review-1", name: "review_tool", params: { path: "src" } },
            result: {
              type: "tool-result",
              id: "review-1",
              name: "review_tool",
              result: { issues: 0 },
              isFailure: false,
            },
          },
        },
      ]
      const journal = yield* makeFrameJournal({ sessionId: "dynamic", capacity: 8, initialTranscript: Prompt.empty })
      yield* journal.publish(status(0))
      for (const input of inputs) yield* journal.publish(input)

      const queue = yield* makeQueue(8)
      const replay = yield* journal.subscribe(queue, 0)

      expect(replay.replay.map((frame) => frame.seq)).toEqual([1, 2, 3, 4, 5])
      expect(replay.replay).toMatchObject([
        { event: { _tag: "ToolExecutionStarted", call: { name: "activate_skill" } } },
        { event: { _tag: "ToolExecutionCompleted", result: { name: "activate_skill" } } },
        { event: { _tag: "ToolExecutionStarted", call: { name: "review_tool" } } },
        { event: { _tag: "ToolProgress", toolCallId: "review-1" } },
        { event: { _tag: "ToolExecutionCompleted", result: { name: "review_tool" } } },
      ])
    }),
  )

  it.effect("fails and removes a lagging subscriber without blocking publication", () =>
    Effect.gen(function* () {
      const journal = yield* makeFrameJournal({ sessionId: "lagged", capacity: 8, initialTranscript: Prompt.empty })
      const queue = yield* makeQueue(1)
      yield* journal.subscribe(queue)

      yield* journal.publish(status(0))
      yield* journal.publish(status(1))
      const first = yield* Queue.take(queue)
      const error = yield* Effect.flip(Queue.take(queue))

      expect(first.seq).toBe(0)
      expect(error._tag).toBe("@batonfx/transport/SubscriberLagged")
      if (error._tag === "@batonfx/transport/SubscriberLagged") expect(error.lastDeliveredSeq).toBe(0)
      expect(yield* journal.publish(status(2))).toMatchObject({ seq: 2 })
    }),
  )

  it.effect("serializes allocation and delivery for concurrent publishers", () =>
    Effect.gen(function* () {
      const firstAllocated = yield* Deferred.make<void>()
      const releaseFirst = yield* Deferred.make<void>()
      const journal = yield* makeFrameJournal({
        sessionId: "ordered",
        capacity: 8,
        initialTranscript: Prompt.empty,
        onAllocated: (frame) =>
          frame.seq === 0
            ? Deferred.succeed(firstAllocated, undefined).pipe(Effect.andThen(Deferred.await(releaseFirst)))
            : Effect.void,
      })
      const queue = yield* makeQueue(8)
      yield* journal.subscribe(queue)

      const first = yield* journal.publish(status(0)).pipe(Effect.forkChild)
      yield* Deferred.await(firstAllocated)
      const second = yield* journal.publish(status(1)).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Deferred.succeed(releaseFirst, undefined)
      yield* Fiber.join(first)
      yield* Fiber.join(second)

      const delivered = yield* Queue.takeAll(queue)
      const replayQueue = yield* makeQueue(8)
      const replay = yield* journal.subscribe(replayQueue, -1)
      expect(delivered.map((frame) => frame.seq)).toEqual([0, 1])
      expect(replay.replay.map((frame) => frame.seq)).toEqual([0, 1])
    }),
  )

  it.effect("commits delivered frames before observing publisher interruption", () =>
    Effect.gen(function* () {
      const delivered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const journal = yield* makeFrameJournal({
        sessionId: "interrupted",
        capacity: 8,
        initialTranscript: Prompt.empty,
        onDelivered: (frame) =>
          frame.seq === 0
            ? Deferred.succeed(delivered, undefined).pipe(Effect.andThen(Deferred.await(release)))
            : Effect.void,
      })
      const queue = yield* makeQueue(8)
      yield* journal.subscribe(queue)

      const publisher = yield* journal.publish(status(0)).pipe(Effect.forkChild)
      yield* Deferred.await(delivered)
      const interrupter = yield* Fiber.interrupt(publisher).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(interrupter)
      yield* journal.publish(status(1))

      const live = yield* Queue.takeAll(queue)
      const replayQueue = yield* makeQueue(8)
      const replay = yield* journal.subscribe(replayQueue, -1)
      expect(live.map((frame) => frame.seq)).toEqual([0, 1])
      expect(replay.replay.map((frame) => frame.seq)).toEqual([0, 1])
    }),
  )

  it.effect("interrupts queued publishers before they enter the journal transition", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const journal = yield* makeFrameJournal({
        sessionId: "queued-interruption",
        capacity: 8,
        initialTranscript: Prompt.empty,
        onAllocated: (frame) =>
          frame.seq === 0
            ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))
            : Effect.void,
      })

      const first = yield* journal.publish(status(0)).pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      const queued = yield* journal.publish(status(1)).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      yield* Fiber.interrupt(queued)
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(first)

      expect(yield* journal.publish(status(2))).toMatchObject({ seq: 1 })
    }),
  )

  it.effect("reads lastSeq after an in-flight publication commits", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const observed = yield* Deferred.make<number>()
      const journal = yield* makeFrameJournal({
        sessionId: "last-seq",
        capacity: 8,
        initialTranscript: Prompt.empty,
        onAllocated: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))),
      })

      const publisher = yield* journal.publish(status(0)).pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      const reader = yield* journal.lastSeq.pipe(
        Effect.tap((seq) => Deferred.succeed(observed, seq)),
        Effect.forkChild,
      )
      yield* Effect.yieldNow
      expect(Option.isNone(yield* Deferred.poll(observed))).toBe(true)
      yield* Deferred.succeed(release, undefined)

      yield* Fiber.join(publisher)
      expect(yield* Fiber.join(reader)).toBe(0)
    }),
  )

  it.effect("does not serialize publication across journals", () =>
    Effect.gen(function* () {
      const blocked = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const journalA = yield* makeFrameJournal({
        sessionId: "a",
        capacity: 8,
        initialTranscript: Prompt.empty,
        onAllocated: () => Deferred.succeed(blocked, undefined).pipe(Effect.andThen(Deferred.await(release))),
      })
      const journalB = yield* makeFrameJournal({ sessionId: "b", capacity: 8, initialTranscript: Prompt.empty })

      const publishA = yield* journalA.publish(status(0)).pipe(Effect.forkChild)
      yield* Deferred.await(blocked)
      expect(yield* journalB.publish(status(0))).toMatchObject({ seq: 0 })
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(publishA)
    }),
  )
})
