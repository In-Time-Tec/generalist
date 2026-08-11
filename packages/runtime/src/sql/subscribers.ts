import { Effect, Queue, Scope, Stream, SynchronizedRef } from "effect"
import { CursorExpired, RunNotFound, RuntimeUnavailable, SubscriberLagged } from "../errors.js"
import type { Cursor } from "../cursor.js"
import type { RunEvent } from "../run-event.js"

export type SubscriberError = SubscriberLagged | CursorExpired | RuntimeUnavailable
export type SubscriberQueue = Queue.Queue<RunEvent, SubscriberError>
type TreeSubscriberQueue = Queue.Queue<void, RuntimeUnavailable>

interface HubState {
  readonly nextId: number
  readonly byRun: ReadonlyMap<string, ReadonlyMap<number, SubscriberQueue>>
  readonly byTreeRoot: ReadonlyMap<string, ReadonlyMap<number, TreeSubscriberQueue>>
}

export interface EventHub {
  readonly publish: (runId: string, event: RunEvent) => Effect.Effect<void>
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
  readonly shutdown: Effect.Effect<void>
}

export const makeEventHub: Effect.Effect<EventHub> = Effect.gen(function* () {
  const stateRef = yield* SynchronizedRef.make<HubState>({
    nextId: 1,
    byRun: new Map(),
    byTreeRoot: new Map(),
  })

  const wakeTree = (rootRunId: string) =>
    SynchronizedRef.modifyEffect(stateRef, (state) =>
      Effect.forEach(state.byTreeRoot.get(rootRunId)?.values() ?? [], (queue) => Queue.offer(queue, undefined), {
        discard: true,
      }).pipe(Effect.as([undefined, state] as const)),
    ).pipe(Effect.asVoid)

  const publish = (runId: string, event: RunEvent) =>
    SynchronizedRef.modifyEffect(stateRef, (state) =>
      Effect.gen(function* () {
        const subscribers = state.byRun.get(runId)
        if (subscribers === undefined) return [undefined, state] as const
        const nextSubs = new Map(subscribers)
        for (const [id, queue] of subscribers) {
          const offered = yield* Queue.offer(queue, event)
          if (!offered) {
            yield* Queue.fail(queue, SubscriberLagged.make({ runId, lastDeliveredSequence: event.sequence - 1 }))
            nextSubs.delete(id)
          }
        }
        const byRun = new Map(state.byRun)
        if (nextSubs.size === 0) byRun.delete(runId)
        else byRun.set(runId, nextSubs)
        return [undefined, { ...state, byRun }] as const
      }),
    ).pipe(Effect.andThen(wakeTree(event.rootRunId)), Effect.asVoid)

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
        if (input.onSubscribed !== undefined) yield* Effect.forkScoped(input.onSubscribed)
        const { replay, lastSequence } = yield* input.loadReplay
        if (input.cursor < -1 || input.cursor > lastSequence) {
          return yield* CursorExpired.make({
            runId: input.runId,
            cursor: input.cursor,
            earliestSequence: replay[0]?.sequence ?? 0,
          })
        }
        const replayCutoff = replay.at(-1)?.sequence ?? input.cursor
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
        ],
        { discard: true },
      ),
    ),
    Effect.asVoid,
  )

  return { publish, wakeTree, subscribe, subscribeTree, shutdown }
})
