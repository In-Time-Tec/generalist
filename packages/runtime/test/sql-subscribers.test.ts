import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Stream } from "effect"
import type { RunEvent } from "../src/run-event.js"
import { makeEventHub } from "../src/sql/subscribers.js"
import { assistantAddress, assistantRef } from "./helpers.js"

const event = (sequence: number): RunEvent => ({
  specVersion: "1",
  eventId: `run:hub:${sequence}`,
  runId: "run:hub",
  sequence,
  executableRef: assistantRef.ref,
  rootRunId: "run:hub",
  occurredAt: "2026-08-03T00:00:00.000Z",
  _tag: "RunAccepted",
  messageId: `message:${sequence}`,
  address: assistantAddress,
})

it.effect("bridges replay and live events without a gap or overlap", () =>
  Effect.gen(function* () {
    const hub = yield* makeEventHub
    const loading = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const stream = hub.subscribe({
      runId: "run:hub",
      cursor: -1,
      capacity: 8,
      loadReplay: Effect.gen(function* () {
        yield* Deferred.succeed(loading, undefined)
        yield* Deferred.await(release)
        return { replay: [event(0), event(1)], lastSequence: 1 }
      }),
    })
    const fiber = yield* stream.pipe(Stream.take(3), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(loading)
    yield* hub.publish("run:hub", event(1))
    yield* Deferred.succeed(release, undefined)
    yield* Effect.yieldNow
    yield* hub.publish("run:hub", event(2))
    const events = yield* Fiber.join(fiber)

    expect([...events].map((item) => item.sequence)).toEqual([0, 1, 2])
  }),
)
