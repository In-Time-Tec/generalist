import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Queue } from "effect"
import { makeFrameJournal } from "../src/frame-journal.js"
import type { SessionError, SubscriberLagged } from "../src/session-registry-errors.js"
import type { LooseServerFrameType } from "../src/wire.js"

const status = (turn: number) => ({ _tag: "SessionStatus" as const, status: { _tag: "Running" as const, turn } })

const makeQueue = (capacity: number) => Queue.dropping<LooseServerFrameType, SessionError | SubscriberLagged>(capacity)

describe("frame journal", () => {
  it.effect("owns monotonic sequence, bounded replay, and stale snapshot plans", () =>
    Effect.gen(function* () {
      const journal = yield* makeFrameJournal({ sessionId: "journal", capacity: 2 })
      yield* journal.publish(status(0))
      yield* journal.publish(status(1))
      yield* journal.publish(status(2))

      const replayQueue = yield* makeQueue(8)
      const replay = yield* journal.subscribe(replayQueue, 0)
      const staleQueue = yield* makeQueue(8)
      const stale = yield* journal.subscribe(staleQueue, -1)

      expect(replay.replay.map((frame) => frame.seq)).toEqual([1, 2])
      expect(replay.stale).toBe(false)
      expect(stale.replay).toEqual([])
      expect(stale.stale).toBe(true)
      expect(stale.snapshotSeq).toBe(2)
      expect(yield* journal.lastSeq).toBe(2)
    }),
  )

  it.effect("fails and removes a lagging subscriber without blocking publication", () =>
    Effect.gen(function* () {
      const journal = yield* makeFrameJournal({ sessionId: "lagged", capacity: 8 })
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

  it.effect("does not serialize publication across journals", () =>
    Effect.gen(function* () {
      const blocked = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const journalA = yield* makeFrameJournal({
        sessionId: "a",
        capacity: 8,
        onAllocated: () => Deferred.succeed(blocked, undefined).pipe(Effect.andThen(Deferred.await(release))),
      })
      const journalB = yield* makeFrameJournal({ sessionId: "b", capacity: 8 })

      const publishA = yield* journalA.publish(status(0)).pipe(Effect.forkChild)
      yield* Deferred.await(blocked)
      expect(yield* journalB.publish(status(0))).toMatchObject({ seq: 0 })
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(publishA)
    }),
  )
})
