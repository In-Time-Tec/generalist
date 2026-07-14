import { Effect, Option, Queue, Ref, Semaphore } from "effect"
import { SessionError, SubscriberLagged } from "./session-registry-errors.js"
import type { LooseServerFrameType } from "./wire.js"

export type FrameWithoutSeq = LooseServerFrameType extends infer Frame
  ? Frame extends unknown
    ? Omit<Frame, "seq">
    : never
  : never

export type SubscriberQueue = Queue.Queue<LooseServerFrameType, SessionError | SubscriberLagged>

export interface ReplayPlan {
  readonly subscriberId: number
  readonly replay: ReadonlyArray<LooseServerFrameType>
  readonly stale: boolean
  readonly snapshotSeq: number
}

interface State {
  readonly lastSeq: number
  readonly ring: ReadonlyArray<LooseServerFrameType>
  readonly subscribers: ReadonlyMap<number, SubscriberQueue>
  readonly nextSubscriberId: number
  readonly closed: boolean
}

export interface FrameJournal {
  readonly publish: (input: FrameWithoutSeq) => Effect.Effect<LooseServerFrameType, SessionError>
  readonly subscribe: (queue: SubscriberQueue, afterSeq?: number) => Effect.Effect<ReplayPlan, SessionError>
  readonly removeSubscriber: (subscriberId: number) => Effect.Effect<void>
  readonly lastSeq: Effect.Effect<number>
  readonly shutdown: Effect.Effect<void>
  readonly evict: Effect.Effect<void>
}

interface Options {
  readonly sessionId: string
  readonly capacity: number
  readonly onAllocated?: (frame: LooseServerFrameType) => Effect.Effect<void>
  readonly onDelivered?: (frame: LooseServerFrameType) => Effect.Effect<void>
}

const trimRing = (ring: ReadonlyArray<LooseServerFrameType>, capacity: number): ReadonlyArray<LooseServerFrameType> =>
  ring.length <= capacity ? ring : ring.slice(ring.length - capacity)

const sessionError = (sessionId: string): SessionError =>
  SessionError.make({ message: `Session ${sessionId} is not open` })

export const makeFrameJournal = (options: Options): Effect.Effect<FrameJournal> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<State>({
      lastSeq: -1,
      ring: [],
      subscribers: new Map(),
      nextSubscriberId: 0,
      closed: false,
    })
    const lock = yield* Semaphore.make(1)
    const locked = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
      lock.withPermit(Effect.uninterruptible(effect))

    const closeWith = (error: Option.Option<SessionError>): Effect.Effect<void> =>
      locked(
        Effect.gen(function* () {
          const current = yield* Ref.get(state)
          if (current.closed) return
          yield* Effect.forEach(
            current.subscribers.values(),
            (queue) => (Option.isSome(error) ? Queue.fail(queue, error.value) : Queue.shutdown(queue)),
            { discard: true },
          )
          yield* Ref.set(state, {
            ...current,
            subscribers: new Map<number, SubscriberQueue>(),
            closed: true,
          })
        }),
      )

    return {
      publish: (input) =>
        locked(
          Effect.gen(function* () {
            const current = yield* Ref.get(state)
            if (current.closed) return yield* sessionError(options.sessionId)
            const frame = { ...input, seq: current.lastSeq + 1 } as LooseServerFrameType
            if (options.onAllocated !== undefined) yield* options.onAllocated(frame)
            const subscribers = new Map(current.subscribers)
            for (const [subscriberId, queue] of current.subscribers) {
              const offered = yield* Queue.offer(queue, frame)
              if (!offered) {
                yield* Queue.fail(
                  queue,
                  SubscriberLagged.make({ sessionId: options.sessionId, lastDeliveredSeq: frame.seq - 1 }),
                )
                subscribers.delete(subscriberId)
              }
            }
            if (options.onDelivered !== undefined) yield* options.onDelivered(frame)
            yield* Ref.set(state, {
              ...current,
              lastSeq: frame.seq,
              ring: trimRing([...current.ring, frame], options.capacity),
              subscribers,
            })
            return frame
          }),
        ),
      subscribe: (queue, afterSeq) =>
        locked(
          Ref.modify(state, (current): readonly [Option.Option<ReplayPlan>, State] => {
            if (current.closed) return [Option.none(), current]
            const subscriberId = current.nextSubscriberId
            const floor = current.ring[0]?.seq ?? current.lastSeq + 1
            const cursor = afterSeq ?? floor - 1
            const stale = afterSeq !== undefined && afterSeq < floor - 1
            const replay = stale ? [] : current.ring.filter((frame) => frame.seq > cursor)
            const subscribers = new Map(current.subscribers)
            subscribers.set(subscriberId, queue)
            return [
              Option.some({ subscriberId, replay, stale, snapshotSeq: current.lastSeq }),
              { ...current, subscribers, nextSubscriberId: subscriberId + 1 },
            ]
          }).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(sessionError(options.sessionId)),
                onSome: Effect.succeed,
              }),
            ),
          ),
        ),
      removeSubscriber: (subscriberId) =>
        locked(
          Ref.update(state, (current) => {
            const subscribers = new Map(current.subscribers)
            subscribers.delete(subscriberId)
            return { ...current, subscribers }
          }),
        ),
      lastSeq: lock.withPermit(Ref.get(state).pipe(Effect.map((current) => current.lastSeq))),
      shutdown: closeWith(Option.none()),
      evict: closeWith(Option.some(SessionError.make({ message: `Session ${options.sessionId} was evicted` }))),
    }
  })
