import "./suites/sqlite-subscriber-high-water-suite.js"
import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Exit, Fiber, Metric, Stream, Tracer } from "effect"
import type { RunEvent } from "../../../src/runtime/run/event.js"
import type { EventsError } from "../../../src/runtime/service.js"
import type { SessionEventsError } from "../../../src/runtime/session/host.js"
import { forBackend, make as makeEventHub } from "../../../src/runtime/sql/subscribers.js"
import { assistantAddress, assistantRef } from "../execution/fixtures.js"

const event = (sequence: number): RunEvent => ({
  specVersion: "1",
  eventId: `run:hub:${sequence}`,
  runId: "run:hub",
  sequence,
  executableRef: assistantRef.ref,
  depth: 0,
  rootRunId: "run:hub",
  occurredAt: "2026-08-03T00:00:00.000Z",
  _tag: "RunAccepted",
  messageId: `message:${sequence}`,
  address: assistantAddress,
})

for (const kind of ["run", "host-session"] as const) {
  it.effect(`${kind}: overflow reports the delivered frontier, not the newer publication hint`, () =>
    Effect.gen(function* () {
      const hub = yield* makeEventHub
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const loaded = Deferred.succeed(ready, undefined).pipe(Effect.andThen(Deferred.await(release)))
      const rows = Array.from({ length: 21 }, (_, index) => event(index))
      const seen: Array<number> = []
      const stream: Stream.Stream<number, EventsError | SessionEventsError> =
        kind === "run"
          ? hub
              .subscribe({
                runId: "run:hub",
                cursor: -1,
                capacity: 1,
                loadReplay: loaded.pipe(Effect.as({ lastSequence: 0 })),
                loadAfter: (cursor) => Effect.succeed(rows.filter((row) => row.sequence > cursor)),
              })
              .pipe(Stream.map((row) => row.sequence))
          : hub
              .subscribeHostSession({
                sessionId: "session:hub",
                cursor: -1,
                capacity: 1,
                loadReplay: loaded.pipe(Effect.as({ lastCursor: 0, replayCursor: 0 })),
                loadAfter: (cursor) =>
                  Effect.succeed(
                    rows.filter((row) => row.sequence > cursor).map((row) => ({ cursor: row.sequence, event: row })),
                  ),
              })
              .pipe(Stream.map((row) => row.cursor))
      const fiber = yield* stream.pipe(
        Stream.runForEach((cursor) =>
          Effect.sync(() => {
            seen.push(cursor)
          }),
        ),
        Effect.flip,
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Deferred.await(ready)
      for (const sequence of [10, 20]) {
        if (kind === "run") yield* hub.publish("run:hub", event(sequence))
        else yield* hub.publishHostSession("session:hub", { cursor: sequence, event: event(sequence) })
      }
      yield* Deferred.succeed(release, undefined)
      const error = yield* Fiber.join(fiber)
      if (error._tag === "generalist/runtime/SubscriberLagged") expect(error.lastDeliveredSequence).toBe(seen.at(-1))
      else if (error._tag === "generalist/host/SessionSubscriberLagged")
        expect(error.lastDeliveredCursor).toBe(seen.at(-1))
      else expect.fail(`unexpected ${error._tag}`)
      expect(seen.at(-1)).toBeLessThan(20)
    }),
  )

  it.effect(`${kind}: repairs overtaken pages independently for subscribers with different highwaters`, () =>
    Effect.gen(function* () {
      const hub = yield* forBackend("mysql")
      const rows = Array.from({ length: 303 }, (_, index) => event(index))
      const requests: Array<number> = []
      const subscribe = (
        cursor: number,
        highwater: number,
        ready: Deferred.Deferred<void>,
      ): Stream.Stream<number, EventsError | SessionEventsError> => {
        const loadAfter = (after: number) =>
          Effect.sync(() => {
            const page = rows.filter((row) => row.sequence > after).slice(0, 128)
            requests.push(page.length)
            return page
          })
        return kind === "run"
          ? hub
              .subscribe({
                runId: "run:hub",
                cursor,
                capacity: 512,
                loadReplay: Deferred.succeed(ready, undefined).pipe(Effect.as({ lastSequence: highwater })),
                loadAfter,
              })
              .pipe(Stream.map((row) => row.sequence))
          : hub
              .subscribeHostSession({
                sessionId: "session:hub",
                cursor,
                capacity: 512,
                loadReplay: Deferred.succeed(ready, undefined).pipe(
                  Effect.as({ lastCursor: highwater, replayCursor: highwater }),
                ),
                loadAfter: (after) =>
                  loadAfter(after).pipe(
                    Effect.map((page) => page.map((row) => ({ cursor: row.sequence, event: row }))),
                  ),
              })
              .pipe(Stream.map((row) => row.cursor))
      }
      const publish = (sequence: number) =>
        kind === "run"
          ? hub.publish("run:hub", event(sequence))
          : hub.publishHostSession("session:hub", { cursor: sequence, event: event(sequence) })
      const catchUp = (after: number, through: number) => {
        const page = rows.filter((row) => row.sequence > after && row.sequence <= through)
        return kind === "run"
          ? hub.catchUp({ runId: "run:hub", cursor: after, loadAfter: Effect.succeed(page) })
          : hub.catchUpHostSession({
              sessionId: "session:hub",
              cursor: after,
              loadAfter: Effect.succeed(page.map((row) => ({ cursor: row.sequence, event: row }))),
            })
      }
      const firstReady = yield* Deferred.make<void>()
      const first = yield* subscribe(-1, 0, firstReady).pipe(
        Stream.takeUntil((cursor) => cursor === 302),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Deferred.await(firstReady)
      yield* catchUp(0, 128)
      const secondReady = yield* Deferred.make<void>()
      const second = yield* subscribe(200, 256, secondReady).pipe(
        Stream.takeUntil((cursor) => cursor === 302),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Deferred.await(secondReady)
      yield* publish(301)
      yield* catchUp(128, 256)
      yield* catchUp(256, 301)
      yield* publish(302)
      expect([...(yield* Fiber.join(first))]).toEqual(Array.from({ length: 303 }, (_, index) => index))
      expect([...(yield* Fiber.join(second))]).toEqual(Array.from({ length: 102 }, (_, index) => index + 201))
      expect(Math.max(...requests)).toBe(128)
    }),
  )

  for (const blocked of [false, true]) {
    it.effect(`${kind}: ${blocked ? "interrupts blocked" : "fails nonadvancing"} authoritative gap repair`, () =>
      Effect.gen(function* () {
        const hub = yield* makeEventHub
        const ready = yield* Deferred.make<void>()
        const repairing = yield* Deferred.make<void>()
        const released = yield* Deferred.make<void>()
        const loadAfter = Deferred.succeed(repairing, undefined).pipe(
          Effect.andThen(blocked ? Effect.never : Effect.succeed([])),
          Effect.ensuring(Deferred.succeed(released, undefined)),
        )
        const stream: Stream.Stream<number, EventsError | SessionEventsError> =
          kind === "run"
            ? hub
                .subscribe({
                  runId: "run:hub",
                  cursor: 0,
                  capacity: 2,
                  loadReplay: Deferred.succeed(ready, undefined).pipe(Effect.as({ lastSequence: 0 })),
                  loadAfter: () => loadAfter,
                })
                .pipe(Stream.map((row) => row.sequence))
            : hub
                .subscribeHostSession({
                  sessionId: "session:hub",
                  cursor: 0,
                  capacity: 2,
                  loadReplay: Deferred.succeed(ready, undefined).pipe(Effect.as({ lastCursor: 0, replayCursor: 0 })),
                  loadAfter: () => loadAfter,
                })
                .pipe(Stream.map((row) => row.cursor))
        const fiber = yield* stream.pipe(Stream.runCollect, Effect.exit, Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(ready)
        yield* kind === "run"
          ? hub.publish("run:hub", event(301))
          : hub.publishHostSession("session:hub", { cursor: 301, event: event(301) })
        yield* Deferred.await(repairing)
        if (blocked) yield* Fiber.interrupt(fiber)
        else expect(Exit.isFailure(yield* Fiber.join(fiber))).toBe(true)
        yield* Deferred.await(released)
      }),
    )
  }
}

it.effect("repairs host cursor gaps without demanding deleted rewind positions", () =>
  Effect.gen(function* () {
    const hub = yield* makeEventHub
    const ready = yield* Deferred.make<void>()
    const rows = [1, 4, 301, 302].map((cursor) => ({ cursor, event: event(cursor) }))
    const fiber = yield* hub
      .subscribeHostSession({
        sessionId: "session:hub",
        cursor: 0,
        capacity: 2,
        loadReplay: Deferred.succeed(ready, undefined).pipe(Effect.as({ lastCursor: 0, replayCursor: 0 })),
        loadAfter: (after) => Effect.succeed(rows.filter((row) => row.cursor > after).slice(0, 2)),
      })
      .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(ready)
    yield* hub.publishHostSession("session:hub", rows[2]!)
    expect((yield* Fiber.join(fiber)).map((row) => row.cursor)).toEqual([1, 4, 301])
  }),
)

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
        return { lastSequence: 1 }
      }),
      loadAfter: (cursor) => Effect.succeed([event(0), event(1)].filter((item) => item.sequence > cursor)),
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

it.effect("delivers a replay larger than the bounded queue without lag or duplication", () =>
  Effect.gen(function* () {
    const hub = yield* makeEventHub
    const loading = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    let largestPage = 0
    const stream = hub.subscribe({
      runId: "run:hub",
      cursor: -1,
      capacity: 2,
      loadReplay: Effect.gen(function* () {
        yield* Deferred.succeed(loading, undefined)
        yield* Deferred.await(release)
        return { lastSequence: 99 }
      }),
      loadAfter: (cursor) => {
        const page = Array.from({ length: Math.min(10, 99 - cursor) }, (_, index) => event(cursor + index + 1))
        largestPage = Math.max(largestPage, page.length)
        return Effect.succeed(page)
      },
    })
    const fiber = yield* stream.pipe(Stream.take(102), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(loading)
    yield* hub.publish("run:hub", event(50))
    yield* hub.publish("run:hub", event(99))
    yield* Deferred.succeed(release, undefined)
    yield* Effect.yieldNow
    yield* hub.publish("run:hub", event(100))
    yield* hub.publish("run:hub", event(101))
    const events = yield* Fiber.join(fiber)

    expect([...events].map((item) => item.sequence)).toEqual([
      ...Array.from({ length: 100 }, (_, index) => index),
      100,
      101,
    ])
    expect(largestPage).toBe(10)
  }),
)

it.effect("distinguishes local wakeups from initial and notification-driven durable replay", () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return Effect.gen(function* () {
    const hub = yield* forBackend("postgres")
    const loaded = yield* Deferred.make<void>()
    const stream = hub.subscribe({
      runId: "run:hub",
      cursor: -1,
      capacity: 8,
      loadReplay: Deferred.succeed(loaded, undefined).pipe(Effect.as({ lastSequence: 0 })),
      loadAfter: (cursor) => Effect.succeed(cursor < 0 ? [event(0)] : []),
    })
    const fiber = yield* stream.pipe(Stream.take(3), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(loaded)
    expect(yield* hub.catchUp({ runId: "run:hub", cursor: 0, loadAfter: Effect.succeed([event(1)]) })).toBe(1)
    yield* hub.publish("run:hub", event(2))
    expect([...(yield* Fiber.join(fiber))].map((item) => item.sequence)).toEqual([0, 1, 2])

    const snapshots = yield* Metric.snapshot
    const local = snapshots.find(
      (snapshot) =>
        snapshot.id === "generalist_runtime_sql_local_wakeups" && snapshot.attributes?.backend === "postgres",
    )
    expect(local?.type).toBe("Counter")
    if (local?.type === "Counter") expect(local.state.count).toBe(1)
    const replay = snapshots.find(
      (snapshot) =>
        snapshot.id === "generalist_runtime_sql_durable_replay_events" && snapshot.attributes?.backend === "postgres",
    )
    expect(replay?.type).toBe("Counter")
    if (replay?.type === "Counter") expect(replay.state.count).toBe(2)
    const duration = snapshots.find(
      (snapshot) =>
        snapshot.id === "generalist_runtime_sql_durable_replay_duration" && snapshot.attributes?.backend === "postgres",
    )
    expect(duration?.type).toBe("Histogram")
    if (duration?.type === "Histogram") expect(duration.state.count).toBe(2)
    expect(spans.filter((span) => span.name === "Generalist.Runtime.sqlReplay")).toHaveLength(2)
  }).pipe(Effect.provideService(Tracer.Tracer, tracer), Effect.provideService(Metric.MetricRegistry, new Map()))
})
