import { Effect, Option, Queue, Ref, SynchronizedRef } from "effect"
import { Prompt } from "effect/unstable/ai"
import { SessionError, SubscriberLagged } from "./session-registry-errors.js"
import type { LooseServerFrameType } from "./wire.js"

export type FrameWithoutSeq = LooseServerFrameType extends infer Frame
  ? Frame extends unknown
    ? Omit<Frame, "seq">
    : never
  : never

export type SubscriberQueue = Queue.Queue<LooseServerFrameType, SessionError | SubscriberLagged>

export interface ReplayPoint {
  readonly throughSeq: number
  readonly transcript: Prompt.Prompt
}

export interface ReplayPlan {
  readonly subscriberId: number
  readonly replay: ReadonlyArray<LooseServerFrameType>
  readonly snapshot: Option.Option<ReplayPoint>
}

interface State {
  readonly lastSeq: number
  readonly replayPoint: ReplayPoint
  readonly originMinusOneAvailable: boolean
  readonly ring: ReadonlyArray<LooseServerFrameType>
  readonly subscribers: ReadonlyMap<number, SubscriberQueue>
  readonly nextSubscriberId: number
  readonly closed: boolean
}

export interface FrameJournal {
  readonly publish: (
    input: FrameWithoutSeq,
    transcript?: Prompt.Prompt,
  ) => Effect.Effect<LooseServerFrameType, SessionError>
  readonly subscribe: (queue: SubscriberQueue, afterSeq?: number) => Effect.Effect<ReplayPlan, SessionError>
  readonly removeSubscriber: (subscriberId: number) => Effect.Effect<void>
  readonly lastSeq: Effect.Effect<number>
  readonly shutdown: Effect.Effect<void>
  readonly evict: Effect.Effect<void>
}

interface Options {
  readonly sessionId: string
  readonly capacity: number
  readonly initialTranscript: Prompt.Prompt
  readonly onAllocated?: (frame: LooseServerFrameType) => Effect.Effect<void>
  readonly onDelivered?: (frame: LooseServerFrameType) => Effect.Effect<void>
}

const trimRing = (ring: ReadonlyArray<LooseServerFrameType>, capacity: number): ReadonlyArray<LooseServerFrameType> =>
  ring.length <= capacity ? ring : ring.slice(ring.length - capacity)

const sessionError = (sessionId: string): SessionError =>
  SessionError.make({ message: `Session ${sessionId} is not open` })

export const makeFrameJournal = (options: Options): Effect.Effect<FrameJournal> =>
  Effect.gen(function* () {
    const state = yield* SynchronizedRef.make<State>({
      lastSeq: -1,
      replayPoint: { throughSeq: -1, transcript: options.initialTranscript },
      originMinusOneAvailable: options.initialTranscript.content.length === 0,
      ring: [],
      subscribers: new Map(),
      nextSubscriberId: 0,
      closed: false,
    })

    const modifyEffect = <A, E, R>(
      transition: (current: State) => Effect.Effect<readonly [A, State], E, R>,
    ): Effect.Effect<A, E, R> =>
      SynchronizedRef.modifyEffect(state, (current) =>
        Effect.uninterruptible(transition(current).pipe(Effect.tap(([, next]) => Ref.set(state.backing, next)))),
      )

    const closeWith = (error: Option.Option<SessionError>): Effect.Effect<void> =>
      modifyEffect((current) =>
        Effect.gen(function* () {
          if (current.closed) return [undefined, current] as const
          yield* Effect.forEach(
            current.subscribers.values(),
            (queue) => (Option.isSome(error) ? Queue.fail(queue, error.value) : Queue.shutdown(queue)),
            { discard: true },
          )
          return [
            undefined,
            {
              ...current,
              subscribers: new Map<number, SubscriberQueue>(),
              closed: true,
            },
          ] as const
        }),
      )

    return {
      publish: (input, transcript) =>
        modifyEffect((current) =>
          Effect.gen(function* () {
            if (current.closed) return yield* sessionError(options.sessionId)
            const frame: LooseServerFrameType = { ...input, seq: current.lastSeq + 1 }
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
            return [
              frame,
              {
                ...current,
                lastSeq: frame.seq,
                replayPoint: {
                  throughSeq: frame.seq,
                  transcript: transcript ?? current.replayPoint.transcript,
                },
                ring: trimRing([...current.ring, frame], options.capacity),
                subscribers,
              },
            ] as const
          }),
        ),
      subscribe: (queue, afterSeq) =>
        SynchronizedRef.modify(state, (current): readonly [Option.Option<ReplayPlan>, State] => {
          if (current.closed) return [Option.none(), current]
          const subscriberId = current.nextSubscriberId
          const floor = current.ring[0]?.seq ?? current.lastSeq + 1
          const cursor = afterSeq ?? -1
          const unavailable =
            cursor > current.lastSeq || cursor < floor - 1 || (cursor === -1 && !current.originMinusOneAvailable)
          const snapshot = unavailable ? Option.some(current.replayPoint) : Option.none<ReplayPoint>()
          const boundary = Option.isSome(snapshot) ? snapshot.value.throughSeq : cursor
          const replay = current.ring.filter((frame) => frame.seq > boundary)
          const subscribers = new Map(current.subscribers)
          subscribers.set(subscriberId, queue)
          return [
            Option.some({ subscriberId, replay, snapshot }),
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
      removeSubscriber: (subscriberId) =>
        SynchronizedRef.update(state, (current) => {
          const subscribers = new Map(current.subscribers)
          subscribers.delete(subscriberId)
          return { ...current, subscribers }
        }),
      lastSeq: SynchronizedRef.modify(state, (current) => [current.lastSeq, current] as const),
      shutdown: closeWith(Option.none()),
      evict: closeWith(Option.some(SessionError.make({ message: `Session ${options.sessionId} was evicted` }))),
    }
  })
