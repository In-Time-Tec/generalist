import { Effect, Metric, Option, Queue, Scope, Stream, SynchronizedRef } from "effect"
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
  readonly byRun: ReadonlyMap<
    string,
    ReadonlyMap<number, { readonly queue: SubscriberQueue; readonly lastQueued: Cursor }>
  >
  readonly byTreeRoot: ReadonlyMap<string, ReadonlyMap<number, TreeSubscriberQueue>>
  readonly byHostSession: ReadonlyMap<
    string,
    ReadonlyMap<number, { readonly queue: HostSessionSubscriberQueue; readonly lastQueued: Cursor }>
  >
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
    readonly loadReplay: Effect.Effect<{ readonly lastSequence: number }, RunNotFound | RuntimeUnavailable>
    readonly loadAfter: (cursor: Cursor) => Effect.Effect<ReadonlyArray<RunEvent>, RuntimeUnavailable>
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
      { readonly lastCursor: number; readonly replayCursor: number },
      SessionNotFound | RuntimeUnavailable
    >
    readonly loadAfter: (
      cursor: Cursor,
    ) => Effect.Effect<ReadonlyArray<HostSessionEvent>, SessionNotFound | RuntimeUnavailable>
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
          const subscribers = state.byRun.get(runId)
          if (subscribers === undefined) return [true, state] as const
          const nextSubs = new Map(subscribers)
          let published = false
          for (const [id, { queue, lastQueued }] of subscribers) {
            if (event.sequence <= lastQueued) continue
            published = true
            const offered = yield* Queue.offer(queue, event)
            if (offered) {
              nextSubs.set(id, { queue, lastQueued: event.sequence })
            } else {
              yield* Metric.update(overflows, 1)
              yield* Queue.fail(queue, SubscriberLagged.make({ runId, lastDeliveredSequence: event.sequence - 1 }))
              nextSubs.delete(id)
            }
          }
          const byRun = new Map(state.byRun)
          if (nextSubs.size === 0) byRun.delete(runId)
          else byRun.set(runId, nextSubs)
          return [published, { ...state, byRun }] as const
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
          const subscribers = state.byHostSession.get(sessionId)
          if (subscribers === undefined) return [undefined, state] as const
          const nextSubscribers = new Map(subscribers)
          for (const [id, { queue, lastQueued }] of subscribers) {
            if (entry.cursor <= lastQueued) continue
            const offered = yield* Queue.offer(queue, entry)
            if (offered) {
              nextSubscribers.set(id, { queue, lastQueued: entry.cursor })
              continue
            }
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
          return [undefined, { ...state, byHostSession }] as const
        }),
      )

    const publishReplay = (runId: string, event: RunEvent) =>
      publishEvent(runId, event).pipe(Effect.tap((published) => (published ? wakeTree(event.rootRunId) : Effect.void)))

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
            current.set(id, { queue: liveQueue, lastQueued: input.cursor })
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
          const { lastSequence } = yield* input.loadReplay
          if (input.cursor < -1 || input.cursor > lastSequence) {
            return yield* CursorExpired.make({
              runId: input.runId,
              cursor: input.cursor,
              earliestSequence: 0,
            })
          }
          const replayThrough = (after: Cursor, through: Cursor) =>
            Stream.paginate(after, (cursor) =>
              cursor >= through
                ? Effect.succeed([[], Option.none<number>()] as const)
                : Effect.timed(input.loadAfter(cursor)).pipe(
                    Effect.flatMap(([duration, loaded]) => {
                      const events = loaded.filter((event) => event.sequence > cursor && event.sequence <= through)
                      const next = events.at(-1)?.sequence
                      if (next === undefined || next <= cursor) {
                        return Effect.fail(
                          RuntimeUnavailable.make({
                            message: `persisted Run ${input.runId} event replay did not advance after ${cursor}`,
                          }),
                        )
                      }
                      return recordReplay({
                        runId: input.runId,
                        cursor,
                        lastSequence: next,
                        count: events.length,
                        duration,
                      }).pipe(Effect.as([events, next < through ? Option.some(next) : Option.none<number>()] as const))
                    }),
                  ),
            )
          if (input.onSubscribed !== undefined) yield* Effect.forkScoped(input.onSubscribed)
          let delivered = lastSequence
          return replayThrough(input.cursor, lastSequence).pipe(
            Stream.concat(
              Stream.fromQueue(liveQueue).pipe(
                Stream.flatMap((event) =>
                  event.sequence <= delivered
                    ? Stream.empty
                    : (event.sequence === delivered + 1
                        ? Stream.succeed(event)
                        : replayThrough(delivered, event.sequence)
                      ).pipe(
                        Stream.tap((item) =>
                          Effect.sync(() => {
                            delivered = item.sequence
                          }),
                        ),
                      ),
                ),
              ),
            ),
            Stream.mapError((error) =>
              error._tag === "generalist/runtime/SubscriberLagged"
                ? SubscriberLagged.make({ runId: input.runId, lastDeliveredSequence: delivered })
                : error,
            ),
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
            current.set(id, { queue: liveQueue, lastQueued: input.cursor })
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
          const { lastCursor, replayCursor } = yield* input.loadReplay
          if (input.cursor < -1 || input.cursor > lastCursor) {
            return yield* SessionCursorExpired.make({
              sessionId: input.sessionId,
              cursor: input.cursor,
              earliestCursor: -1,
              latestCursor: lastCursor,
              hint: "Restart replay from the earliest available Session cursor.",
            })
          }
          const replayThrough = (after: Cursor, through: Cursor) =>
            Stream.paginate(after, (cursor) =>
              cursor >= through
                ? Effect.succeed([[], Option.none<number>()] as const)
                : input.loadAfter(cursor).pipe(
                    Effect.flatMap((loaded) => {
                      const entries = loaded.filter((entry) => entry.cursor > cursor && entry.cursor <= through)
                      const next = entries.at(-1)?.cursor
                      if (next === undefined || next <= cursor) {
                        return Effect.fail(
                          RuntimeUnavailable.make({
                            message: `persisted host Session ${input.sessionId} replay did not advance after ${cursor}`,
                          }),
                        )
                      }
                      return Effect.succeed([
                        entries,
                        next < through ? Option.some(next) : Option.none<number>(),
                      ] as const)
                    }),
                  ),
            )
          if (input.onSubscribed !== undefined) yield* Effect.forkScoped(input.onSubscribed)
          let delivered = lastCursor
          return replayThrough(input.cursor, replayCursor).pipe(
            Stream.concat(
              Stream.fromQueue(liveQueue).pipe(
                Stream.flatMap((entry) =>
                  entry.cursor <= delivered
                    ? Stream.empty
                    : (entry.cursor === delivered + 1
                        ? Stream.succeed(entry)
                        : replayThrough(delivered, entry.cursor)
                      ).pipe(
                        Stream.tap((item) =>
                          Effect.sync(() => {
                            delivered = item.cursor
                          }),
                        ),
                      ),
                ),
              ),
            ),
            Stream.mapError((error) =>
              error._tag === "generalist/host/SessionSubscriberLagged"
                ? SessionSubscriberLagged.make({ ...error, lastDeliveredCursor: delivered })
                : error,
            ),
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
                Effect.forEach(subscribers.values(), ({ queue }) => Queue.fail(queue, unavailable), { discard: true }),
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
                Effect.forEach(subscribers.values(), ({ queue }) => Queue.fail(queue, unavailable), { discard: true }),
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
