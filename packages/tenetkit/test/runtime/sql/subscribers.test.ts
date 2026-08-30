import "./suites/sqlite-subscriber-high-water-suite.js"
import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Metric, Stream, Tracer } from "effect"
import type { RunEvent } from "../../../src/runtime/run/event.js"
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

it.effect("delivers a replay larger than the bounded queue without lag or duplication", () =>
  Effect.gen(function* () {
    const hub = yield* makeEventHub
    const loading = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const stream = hub.subscribe({
      runId: "run:hub",
      cursor: -1,
      capacity: 2,
      loadReplay: Effect.gen(function* () {
        yield* Deferred.succeed(loading, undefined)
        yield* Deferred.await(release)
        return { replay: Array.from({ length: 100 }, (_, index) => event(index)), lastSequence: 99 }
      }),
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
      loadReplay: Deferred.succeed(loaded, undefined).pipe(Effect.as({ replay: [event(0)], lastSequence: 0 })),
    })
    const fiber = yield* stream.pipe(Stream.take(3), Stream.runCollect, Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(loaded)
    expect(yield* hub.catchUp({ runId: "run:hub", cursor: 0, loadAfter: Effect.succeed([event(1)]) })).toBe(1)
    yield* hub.publish("run:hub", event(2))
    expect([...(yield* Fiber.join(fiber))].map((item) => item.sequence)).toEqual([0, 1, 2])

    const snapshots = yield* Metric.snapshot
    const local = snapshots.find(
      (snapshot) => snapshot.id === "tenetkit_runtime_sql_local_wakeups" && snapshot.attributes?.backend === "postgres",
    )
    expect(local?.type).toBe("Counter")
    if (local?.type === "Counter") expect(local.state.count).toBe(1)
    const replay = snapshots.find(
      (snapshot) =>
        snapshot.id === "tenetkit_runtime_sql_durable_replay_events" && snapshot.attributes?.backend === "postgres",
    )
    expect(replay?.type).toBe("Counter")
    if (replay?.type === "Counter") expect(replay.state.count).toBe(2)
    const duration = snapshots.find(
      (snapshot) =>
        snapshot.id === "tenetkit_runtime_sql_durable_replay_duration" && snapshot.attributes?.backend === "postgres",
    )
    expect(duration?.type).toBe("Histogram")
    if (duration?.type === "Histogram") expect(duration.state.count).toBe(2)
    expect(spans.filter((span) => span.name === "TenetKit.Runtime.sqlReplay")).toHaveLength(2)
  }).pipe(Effect.provideService(Tracer.Tracer, tracer), Effect.provideService(Metric.MetricRegistry, new Map()))
})
