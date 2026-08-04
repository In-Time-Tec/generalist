import { Effect, Queue, Stream, SynchronizedRef } from "effect"
import { CursorExpired, RunNotFound, RuntimeUnavailable, SubscriberLagged } from "../errors.js"
import type { Cursor } from "../cursor.js"
import type { RunEvent } from "../run-event.js"

export type SubscriberError = SubscriberLagged | CursorExpired | RuntimeUnavailable
export type SubscriberQueue = Queue.Queue<RunEvent, SubscriberError>

interface HubState {
  readonly nextId: number
  readonly byRun: ReadonlyMap<string, ReadonlyMap<number, SubscriberQueue>>
}

export interface EventHub {
  readonly publish: (runId: string, event: RunEvent) => Effect.Effect<void>
  readonly subscribe: (input: {
    readonly runId: string
    readonly cursor: Cursor
    readonly loadReplay: Effect.Effect<
      { readonly replay: ReadonlyArray<RunEvent>; readonly lastSequence: number },
      RunNotFound | RuntimeUnavailable
    >
    readonly capacity: number
    readonly onSubscribed?: Effect.Effect<void>
  }) => Stream.Stream<RunEvent, RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable>
  readonly shutdown: Effect.Effect<void>
}

export const makeEventHub = (): Effect.Effect<EventHub> =>
  Effect.gen(function* () {
    const stateRef = yield* SynchronizedRef.make<HubState>({ nextId: 1, byRun: new Map() })

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
      ).pipe(Effect.asVoid)

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
            return [id, { nextId: id + 1, byRun }] as const
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

    const shutdown = SynchronizedRef.get(stateRef).pipe(
      Effect.flatMap((state) =>
        Effect.forEach(
          state.byRun.values(),
          (subscribers) =>
            Effect.forEach(
              subscribers.values(),
              (queue) => Queue.fail(queue, RuntimeUnavailable.make({ message: "runtime store released" })),
              { discard: true },
            ),
          { discard: true },
        ),
      ),
      Effect.asVoid,
    )

    return { publish, subscribe, shutdown }
  })
