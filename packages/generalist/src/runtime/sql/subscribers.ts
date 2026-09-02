import { Effect, Metric, Queue, Scope, Stream, SynchronizedRef } from "effect"
import { CursorExpired, RunNotFound, RuntimeUnavailable, SubscriberLagged } from "../errors.js"
import type { Cursor } from "../cursor.js"
import type { RunEvent } from "../run/event.js"
import type { StoreBackend } from "../run/store.js"
import {
  SessionCursorExpired,
  SessionNotFound,
  SessionSubscriberLagged,
  type HostSessionEvent,
} from "../session/host.js"

export type SubscriberError = SubscriberLagged | CursorExpired | RuntimeUnavailable
export type SubscriberQueue = Queue.Queue<RunEvent, SubscriberError>
type TreeSubscriberQueue = Queue.Queue<void, RuntimeUnavailable>
type HostSessionSubscriberQueue = Queue.Queue<HostSessionEvent, SessionSubscriberLagged | RuntimeUnavailable>

interface HubState {
  readonly nextId: number
  readonly byRun: ReadonlyMap<string, ReadonlyMap<number, SubscriberQueue>>
  readonly byTreeRoot: ReadonlyMap<string, ReadonlyMap<number, TreeSubscriberQueue>>
  readonly byHostSession: ReadonlyMap<string, ReadonlyMap<number, HostSessionSubscriberQueue>>
  readonly lastSequenceByRun: ReadonlyMap<string, number>
  readonly lastCursorByHostSession: ReadonlyMap<string, number>
}

export interface EventHub {
  /** @internal Mark a Run whose activation state changed without publishing an event on that Run. */
  readonly touchRun: (runId: string) => Effect.Effect<void>
  readonly publish: (runId: string, event: RunEvent) => Effect.Effect<void>
  readonly publishHostSession: (sessionId: string, entry: HostSessionEvent) => Effect.Effect<void>
  /** @internal Load and publish authoritative events after a lossy notification or polling wakeup. */
  readonly catchUp: <E, R>(input: {
    readonly runId: string
    readonly cursor: Cursor
    readonly loadAfter: Effect.Effect<ReadonlyArray<RunEvent>, E, R>
  }) => Effect.Effect<Cursor, E, R>
  /** @internal Load and publish authoritative Session events after a lossy wakeup. */
  readonly catchUpHostSession: <E, R>(input: {
    readonly sessionId: string
    readonly cursor: Cursor
    readonly loadAfter: Effect.Effect<ReadonlyArray<HostSessionEvent>, E, R>
  }) => Effect.Effect<Cursor, E, R>
  readonly wakeTree: (rootRunId: string) => Effect.Effect<void>
  readonly subscribe: (input: {
    readonly runId: string
    readonly cursor: Cursor
    readonly loadReplay: Effect.Effect<
      { readonly replay: ReadonlyArray<RunEvent>; readonly lastSequence: number },
      RunNotFound | RuntimeUnavailable
    >
    readonly capacity: number
    readonly onSubscribed?: Effect.Effect<void, never, Scope.Scope>
  }) => Stream.Stream<RunEvent, RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable>
  readonly subscribeTree: (input: {
    readonly rootRunId: string
    readonly onSubscribed?: Effect.Effect<void, never, Scope.Scope>
  }) => Stream.Stream<void, RuntimeUnavailable>
  readonly subscribeHostSession: (input: {
    readonly sessionId: string
    readonly cursor: Cursor
    readonly loadReplay: Effect.Effect<
      { readonly replay: ReadonlyArray<HostSessionEvent>; readonly lastCursor: number },
      SessionNotFound | RuntimeUnavailable
    >
    readonly capacity: number
    readonly onSubscribed?: Effect.Effect<void, never, Scope.Scope>
  }) => Stream.Stream<
    HostSessionEvent,
    SessionNotFound | SessionCursorExpired | SessionSubscriberLagged | RuntimeUnavailable
  >
  readonly shutdown: Effect.Effect<void>
}

const localWakeups = Metric.counter("generalist_runtime_sql_local_wakeups", {
  description: "Runtime SQL post-commit local event wakeups",
  incremental: true,
})

const durableReplayEvents = Metric.counter("generalist_runtime_sql_durable_replay_events", {
  description: "Runtime SQL events caught up from durable replay",
  incremental: true,
})

const durableReplayDuration = Metric.timer("generalist_runtime_sql_durable_replay_duration", {
  description: "Runtime SQL durable event replay latency after subscription or wakeup",
})

const subscriberSequenceLag = Metric.histogram("generalist_runtime_sql_subscriber_sequence_lag", {
  description: "Runtime SQL subscriber cursor lag measured in event sequence positions",
  boundaries: Metric.exponentialBoundaries({ start: 1, factor: 2, count: 20 }),
})

const subscriberOverflows = Metric.counter("generalist_runtime_sql_subscriber_overflows", {
  description: "Runtime SQL subscribers dropped after exceeding their bounded queue",
  incremental: true,
})

export const forBackend = (backend: Exclude<StoreBackend, "memory">): Effect.Effect<EventHub> =>
  Effect.gen(function* () {
    const wakeups = Metric.withAttributes(localWakeups, { backend })
    const replayEvents = Metric.withAttributes(durableReplayEvents, { backend })
    const replayDuration = Metric.withAttributes(durableReplayDuration, { backend })
    const sequenceLag = Metric.withAttributes(subscriberSequenceLag, { backend })
    const overflows = Metric.withAttributes(subscriberOverflows, { backend })
    const stateRef = yield* SynchronizedRef.make<HubState>({
      nextId: 1,
      byRun: new Map(),
      byTreeRoot: new Map(),
      byHostSession: new Map(),
      lastSequenceByRun: new Map(),
      lastCursorByHostSession: new Map(),
    })

    const wakeTree = (rootRunId: string) =>
      SynchronizedRef.modifyEffect(stateRef, (state) =>
        Effect.forEach(state.byTreeRoot.get(rootRunId)?.values() ?? [], (queue) => Queue.offer(queue, undefined), {
          discard: true,
        }).pipe(Effect.as([undefined, state] as const)),
      ).pipe(Effect.asVoid)

    const publishEvent = (runId: string, event: RunEvent) =>
      SynchronizedRef.modifyEffect(stateRef, (state) =>
        Effect.gen(function* () {
          const lastSequence = state.lastSequenceByRun.get(runId)
          if (lastSequence !== undefined && event.sequence <= lastSequence) return [false, state] as const
          const nextState = { ...state, lastSequenceByRun: new Map(state.lastSequenceByRun).set(runId, event.sequence) }
          const subscribers = state.byRun.get(runId)
          if (subscribers === undefined) return [true, nextState] as const
          const nextSubs = new Map(subscribers)
          for (const [id, queue] of subscribers) {
            const offered = yield* Queue.offer(queue, event)
            if (!offered) {
              yield* Metric.update(overflows, 1)
              yield* Queue.fail(queue, SubscriberLagged.make({ runId, lastDeliveredSequence: event.sequence - 1 }))
              nextSubs.delete(id)
            }
          }
          const byRun = new Map(state.byRun)
          if (nextSubs.size === 0) byRun.delete(runId)
          else byRun.set(runId, nextSubs)
          return [true, { ...nextState, byRun }] as const
        }),
      )

    const publish = (runId: string, event: RunEvent) =>
      publishEvent(runId, event).pipe(
        Effect.flatMap((published) =>
          published ? Metric.update(wakeups, 1).pipe(Effect.andThen(wakeTree(event.rootRunId))) : Effect.void,
        ),
        Effect.asVoid,
      )

    const publishHostSession = (sessionId: string, entry: HostSessionEvent) =>
      SynchronizedRef.modifyEffect(stateRef, (state) =>
        Effect.gen(function* () {
          const lastCursor = state.lastCursorByHostSession.get(sessionId)
          if (lastCursor !== undefined && entry.cursor <= lastCursor) return [undefined, state] as const
          const nextState = {
            ...state,
            lastCursorByHostSession: new Map(state.lastCursorByHostSession).set(sessionId, entry.cursor),
          }
          const subscribers = state.byHostSession.get(sessionId)
          if (subscribers === undefined) return [undefined, nextState] as const
          const nextSubscribers = new Map(subscribers)
          for (const [id, queue] of subscribers) {
            const offered = yield* Queue.offer(queue, entry)
            if (offered) continue
            yield* Queue.fail(
              queue,
              SessionSubscriberLagged.make({
                sessionId,
                lastDeliveredCursor: entry.cursor - 1,
                hint: "Resume the Session event stream from the last delivered cursor.",
              }),
            )
            nextSubscribers.delete(id)
          }
          const byHostSession = new Map(state.byHostSession)
          if (nextSubscribers.size === 0) byHostSession.delete(sessionId)
          else byHostSession.set(sessionId, nextSubscribers)
          return [undefined, { ...nextState, byHostSession }] as const
        }),
      )

    const publishReplay = (runId: string, event: RunEvent) =>
      publishEvent(runId, event).pipe(
        Effect.flatMap((published) =>
          published ? wakeTree(event.rootRunId).pipe(Effect.as(true)) : Effect.succeed(false),
        ),
      )

    const recordReplay = (input: {
      readonly runId: string
      readonly cursor: Cursor
      readonly lastSequence: number
      readonly count: number
      readonly duration: import("effect").Duration.Duration
    }) => {
      const lag = Math.max(0, input.lastSequence - input.cursor)
      return Metric.update(replayEvents, input.count).pipe(
        Effect.andThen(Metric.update(replayDuration, input.duration)),
        Effect.andThen(Metric.update(sequenceLag, lag)),
        Effect.andThen(
          Effect.annotateCurrentSpan({
            "generalist.runtime.run_id": input.runId,
            "generalist.runtime.sql.backend": backend,
            "generalist.runtime.sql.replay.event_count": input.count,
            "generalist.runtime.sql.replay.sequence_lag": lag,
          }),
        ),
        Effect.withSpan("Generalist.Runtime.sqlReplay"),
      )
    }

    const catchUp: EventHub["catchUp"] = (input) =>
      Effect.timed(
        input.loadAfter.pipe(
          Effect.flatMap((events) =>
            Effect.forEach(events, (event) => publishReplay(input.runId, event)).pipe(
              Effect.map((published) => ({
                events,
                published: published.filter(Boolean).length,
              })),
            ),
          ),
        ),
      ).pipe(
        Effect.flatMap(([duration, { events, published }]) => {
          const lastSequence = events.at(-1)?.sequence ?? input.cursor
          if (published === 0) return Effect.succeed(lastSequence)
          return recordReplay({
            runId: input.runId,
            cursor: input.cursor,
            lastSequence,
            count: published,
            duration,
          }).pipe(Effect.as(lastSequence))
        }),
      )

    const catchUpHostSession: EventHub["catchUpHostSession"] = (input) =>
      input.loadAfter.pipe(
        Effect.flatMap((entries) =>
          Effect.forEach(entries, (entry) => publishHostSession(input.sessionId, entry)).pipe(
            Effect.as(entries.at(-1)?.cursor ?? input.cursor),
          ),
        ),
      )

    const subscribe: EventHub["subscribe"] = (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const liveQueue: SubscriberQueue = yield* Queue.dropping<RunEvent, SubscriberError>(input.capacity)
          const subscriberId = yield* SynchronizedRef.modify(stateRef, (state) => {
            const id = state.nextId
            const current = new Map(state.byRun.get(input.runId) ?? [])
            current.set(id, liveQueue)
            const byRun = new Map(state.byRun)
            byRun.set(input.runId, current)
            return [id, { ...state, nextId: id + 1, byRun }] as const
          })
          yield* Effect.addFinalizer(() =>
            SynchronizedRef.update(stateRef, (state) => {
              const current = state.byRun.get(input.runId)
              if (current === undefined) return state
              const next = new Map(current)
              next.delete(subscriberId)
              const byRun = new Map(state.byRun)
              if (next.size === 0) byRun.delete(input.runId)
              else byRun.set(input.runId, next)
              return { ...state, byRun }
            }).pipe(Effect.andThen(Queue.shutdown(liveQueue)), Effect.asVoid),
          )
          const [duration, { replay, lastSequence }] = yield* Effect.timed(input.loadReplay)
          if (input.cursor < -1 || input.cursor > lastSequence) {
            return yield* CursorExpired.make({
              runId: input.runId,
              cursor: input.cursor,
              earliestSequence: replay[0]?.sequence ?? 0,
            })
          }
          const replayCutoff = replay.at(-1)?.sequence ?? input.cursor
          yield* recordReplay({
            runId: input.runId,
            cursor: input.cursor,
            lastSequence,
            count: replay.length,
            duration,
          })
          if (input.onSubscribed !== undefined) yield* Effect.forkScoped(input.onSubscribed)
          return Stream.concat(
            Stream.fromIterable(replay),
            Stream.fromQueue(liveQueue).pipe(Stream.filter((event) => event.sequence > replayCutoff)),
          )
        }),
      )

    const subscribeTree: EventHub["subscribeTree"] = (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const liveQueue = yield* Queue.sliding<void, RuntimeUnavailable>(1)
          const subscriberId = yield* SynchronizedRef.modify(stateRef, (state) => {
            const id = state.nextId
            const current = new Map(state.byTreeRoot.get(input.rootRunId) ?? [])
            current.set(id, liveQueue)
            const byTreeRoot = new Map(state.byTreeRoot)
            byTreeRoot.set(input.rootRunId, current)
            return [id, { ...state, nextId: id + 1, byTreeRoot }] as const
          })
          yield* Effect.addFinalizer(() =>
            SynchronizedRef.update(stateRef, (state) => {
              const current = state.byTreeRoot.get(input.rootRunId)
              if (current === undefined) return state
              const next = new Map(current)
              next.delete(subscriberId)
              const byTreeRoot = new Map(state.byTreeRoot)
              if (next.size === 0) byTreeRoot.delete(input.rootRunId)
              else byTreeRoot.set(input.rootRunId, next)
              return { ...state, byTreeRoot }
            }).pipe(Effect.andThen(Queue.shutdown(liveQueue)), Effect.asVoid),
          )
          if (input.onSubscribed !== undefined) yield* Effect.forkScoped(input.onSubscribed)
          return Stream.concat(Stream.succeed(undefined), Stream.fromQueue(liveQueue))
        }),
      )

    const subscribeHostSession: EventHub["subscribeHostSession"] = (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const liveQueue: HostSessionSubscriberQueue = yield* Queue.dropping<
            HostSessionEvent,
            SessionSubscriberLagged | RuntimeUnavailable
          >(input.capacity)
          const subscriberId = yield* SynchronizedRef.modify(stateRef, (state) => {
            const id = state.nextId
            const current = new Map(state.byHostSession.get(input.sessionId) ?? [])
            current.set(id, liveQueue)
            const byHostSession = new Map(state.byHostSession)
            byHostSession.set(input.sessionId, current)
            return [id, { ...state, nextId: id + 1, byHostSession }] as const
          })
          yield* Effect.addFinalizer(() =>
            SynchronizedRef.update(stateRef, (state) => {
              const current = state.byHostSession.get(input.sessionId)
              if (current === undefined) return state
              const next = new Map(current)
              next.delete(subscriberId)
              const byHostSession = new Map(state.byHostSession)
              if (next.size === 0) byHostSession.delete(input.sessionId)
              else byHostSession.set(input.sessionId, next)
              return { ...state, byHostSession }
            }).pipe(Effect.andThen(Queue.shutdown(liveQueue)), Effect.asVoid),
          )
          const { replay, lastCursor } = yield* input.loadReplay
          if (input.cursor < -1 || input.cursor > lastCursor) {
            return yield* SessionCursorExpired.make({
              sessionId: input.sessionId,
              cursor: input.cursor,
              earliestCursor: -1,
              latestCursor: lastCursor,
              hint: "Restart replay from the earliest available Session cursor.",
            })
          }
          const replayCutoff = replay.at(-1)?.cursor ?? input.cursor
          if (input.onSubscribed !== undefined) yield* Effect.forkScoped(input.onSubscribed)
          return Stream.concat(
            Stream.fromIterable(replay),
            Stream.fromQueue(liveQueue).pipe(Stream.filter((entry) => entry.cursor > replayCutoff)),
          )
        }),
      )

    const unavailable = RuntimeUnavailable.make({ message: "runtime store released" })
    const shutdown = SynchronizedRef.get(stateRef).pipe(
      Effect.flatMap((state) =>
        Effect.all(
          [
            Effect.forEach(
              state.byRun.values(),
              (subscribers) =>
                Effect.forEach(subscribers.values(), (queue) => Queue.fail(queue, unavailable), { discard: true }),
              { discard: true },
            ),
            Effect.forEach(
              state.byTreeRoot.values(),
              (subscribers) =>
                Effect.forEach(subscribers.values(), (queue) => Queue.fail(queue, unavailable), { discard: true }),
              { discard: true },
            ),
            Effect.forEach(
              state.byHostSession.values(),
              (subscribers) =>
                Effect.forEach(subscribers.values(), (queue) => Queue.fail(queue, unavailable), { discard: true }),
              { discard: true },
            ),
          ],
          { discard: true },
        ),
      ),
      Effect.asVoid,
    )

    return {
      touchRun: () => Effect.void,
      publish,
      publishHostSession,
      catchUp,
      catchUpHostSession,
      wakeTree,
      subscribe,
      subscribeTree,
      subscribeHostSession,
      shutdown,
    }
  })

export const make: Effect.Effect<EventHub> = forBackend("sqlite")
