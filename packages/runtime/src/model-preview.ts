import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  Queue,
  Ref,
  Semaphore,
  Stream,
  SynchronizedRef,
  type Scope,
} from "effect"
import type { AgentLoopEvent } from "./agent-event.js"

type ModelPart = Extract<AgentLoopEvent, { readonly _tag: "ModelPart" }>
type Channel = "reasoning" | "text"

/** @experimental One ordered append to a model output channel. Offsets and deltas use UTF-16 code units. */
export interface ModelPreviewChange {
  readonly channel: Channel
  readonly offset: number
  readonly delta: string
}

/** @experimental A bounded append frame for one live provider attempt. */
export interface ModelPreviewFrame {
  readonly _tag: "ModelPreview"
  readonly runId: string
  readonly attemptFence: number
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sequence: number
  readonly changes: readonly [ModelPreviewChange, ...ReadonlyArray<ModelPreviewChange>]
}

/** @experimental Tombstone emitted when a Run's memory-only model preview lane is cleared. */
export interface ModelPreviewCleared {
  readonly _tag: "ModelPreviewCleared"
  readonly runId: string
  readonly attemptFence: number
  readonly generation: number
}

/** @experimental One event from a Run's memory-only model preview lane. */
export type ModelPreviewEvent = ModelPreviewFrame | ModelPreviewCleared

/** @experimental Maximum UTF-16 code units carried by one frame and held by one cadence buffer. */
export const MaxPayloadCharacters = 4_096

/** @experimental Maximum queued preview events retained for one subscriber. */
export const SubscriberCapacity = 64

/** @experimental Maximum milliseconds that partial output waits for adjacent changes before flushing. */
export const MaxCadenceMillis = 50

export interface Sink {
  readonly offer: (part: ModelPart) => Effect.Effect<boolean>
  readonly clear: Effect.Effect<void>
}

interface Identity {
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
}

interface State extends Identity {
  readonly nextSequence: number
  readonly textOffset: number
  readonly reasoningOffset: number
  readonly pending: ReadonlyArray<ModelPreviewChange>
  readonly pendingCharacters: number
  readonly pendingAt: number | undefined
  readonly publishedAt: number
}

interface LaneState {
  readonly generation: number
  readonly retained: ModelPreviewFrame | undefined
  readonly subscribers: ReadonlyMap<number, Queue.Queue<ModelPreviewEvent>>
  readonly nextSubscriberId: number
}

type Publication = readonly [ModelPreviewEvent, ReadonlyArray<Queue.Queue<ModelPreviewEvent>>]

const clearedLane = (generation: number): LaneState => ({
  generation,
  retained: undefined,
  subscribers: new Map(),
  nextSubscriberId: 1,
})

interface Interface {
  readonly open: (runId: string, attemptFence: number) => Effect.Effect<Sink, never, Scope.Scope>
  readonly previews: (runId: string) => Stream.Stream<ModelPreviewEvent>
}

export class ModelPreviewLane extends Context.Service<ModelPreviewLane, Interface>()(
  "@batonfx/runtime/model-preview/ModelPreviewLane",
) {}

const identityOf = (part: ModelPart): Identity => ({
  turn: part.turn,
  modelCallId: part.modelCallId,
  modelAttemptId: part.modelAttemptId,
  attempt: part.attempt,
})

const sameIdentity = (state: State, part: ModelPart): boolean =>
  state.turn === part.turn &&
  state.modelCallId === part.modelCallId &&
  state.modelAttemptId === part.modelAttemptId &&
  state.attempt === part.attempt

const initialState = (part: ModelPart): State => ({
  ...identityOf(part),
  nextSequence: 0,
  textOffset: 0,
  reasoningOffset: 0,
  pending: [],
  pendingCharacters: 0,
  pendingAt: undefined,
  publishedAt: Number.NEGATIVE_INFINITY,
})

const append = (state: State, channel: Channel, delta: string, now: number): State => {
  const offset = channel === "text" ? state.textOffset : state.reasoningOffset
  const previous = state.pending.at(-1)
  const pending =
    previous?.channel === channel && previous.offset + previous.delta.length === offset
      ? [...state.pending.slice(0, -1), { channel, offset: previous.offset, delta: previous.delta + delta }]
      : [...state.pending, { channel, offset, delta }]
  return {
    ...state,
    [channel === "text" ? "textOffset" : "reasoningOffset"]: offset + delta.length,
    pending,
    pendingCharacters: state.pendingCharacters + delta.length,
    pendingAt: state.pendingAt ?? now,
  }
}

const flush = (state: State, now: number): readonly [ModelPreviewFrame | undefined, State] => {
  const [first, ...rest] = state.pending
  if (first === undefined) return [undefined, state]
  const frame: ModelPreviewFrame = {
    _tag: "ModelPreview",
    runId: "",
    attemptFence: 0,
    turn: state.turn,
    modelCallId: state.modelCallId,
    modelAttemptId: state.modelAttemptId,
    attempt: state.attempt,
    sequence: state.nextSequence,
    changes: [first, ...rest],
  }
  return [
    frame,
    {
      ...state,
      nextSequence: state.nextSequence + 1,
      pending: [],
      pendingCharacters: 0,
      pendingAt: undefined,
      publishedAt: now,
    },
  ]
}

const safePrefixLength = (value: string, start: number, maximum: number): number => {
  const remaining = value.length - start
  if (remaining <= maximum) return remaining
  const end = start + maximum
  const before = value.charCodeAt(end - 1)
  const after = value.charCodeAt(end)
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff ? maximum - 1 : maximum
}

const update = <E, R>(
  previous: State | undefined,
  part: ModelPart,
  now: number,
  emit: (frame: ModelPreviewFrame) => Effect.Effect<void, E, R>,
): Effect.Effect<State | undefined, E, R> =>
  Effect.gen(function* () {
    let state = previous
    if (state !== undefined && !sameIdentity(state, part)) {
      const [frame] = flush(state, now)
      if (frame !== undefined) yield* emit(frame)
      state = undefined
    }
    state ??= initialState(part)

    const [channel, delta] =
      part.part.type === "text-delta"
        ? (["text", part.part.delta] as const)
        : part.part.type === "reasoning-delta"
          ? (["reasoning", part.part.delta] as const)
          : ([undefined, undefined] as const)
    if (channel !== undefined && delta !== undefined && delta.length > 0) {
      let cursor = 0
      while (cursor < delta.length) {
        const available = MaxPayloadCharacters - state.pendingCharacters
        const length = safePrefixLength(delta, cursor, available)
        if (length === 0) {
          const [frame, next] = flush(state, now)
          if (frame !== undefined) yield* emit(frame).pipe(Effect.andThen(Effect.yieldNow))
          state = next
          continue
        }
        state = append(state, channel, delta.slice(cursor, cursor + length), now)
        cursor += length
        if (state.pendingCharacters === MaxPayloadCharacters) {
          const [frame, next] = flush(state, now)
          if (frame !== undefined) yield* emit(frame).pipe(Effect.andThen(Effect.yieldNow))
          state = next
        }
      }
      const oversized = delta.length > MaxPayloadCharacters
      if (oversized || state.publishedAt === Number.NEGATIVE_INFINITY || now - state.publishedAt >= MaxCadenceMillis) {
        const [frame, next] = flush(state, now)
        if (frame !== undefined) yield* emit(frame)
        state = next
      }
    }

    const terminal = part.part.type === "finish" || part.part.type === "error"
    if (terminal) {
      const [frame] = flush(state, now)
      if (frame !== undefined) yield* emit(frame)
      return undefined
    }
    return state
  })

export const make: Effect.Effect<Interface, never, Scope.Scope> = Effect.gen(function* () {
  const lanes = yield* SynchronizedRef.make<ReadonlyMap<string, LaneState>>(new Map())
  const publish = (runId: string, generation: number, frame: ModelPreviewFrame): Effect.Effect<void> =>
    SynchronizedRef.modify(lanes, (current): readonly [ReadonlyArray<Publication>, ReadonlyMap<string, LaneState>] => {
      const lane = current.get(runId)
      if (lane === undefined || lane.generation !== generation) return [[], current] as const
      const published = { ...frame, runId }
      const next = new Map(current).set(runId, { ...lane, retained: published })
      return [[[published, [...lane.subscribers.values()]]], next]
    }).pipe(
      Effect.flatMap((publications) =>
        Effect.forEach(publications, ([event, subscribers]) =>
          Effect.forEach(subscribers, (queue) => Queue.offer(queue, event), {
            discard: true,
          }),
        ),
      ),
      Effect.asVoid,
    )
  const clearLane = (runId: string, attemptFence: number, expectedGeneration: number): Effect.Effect<void> =>
    SynchronizedRef.modify(lanes, (current): readonly [ReadonlyArray<Publication>, ReadonlyMap<string, LaneState>] => {
      const lane = current.get(runId)
      if (lane === undefined || lane.generation !== expectedGeneration) return [[], current] as const
      const generation = lane.generation + 1
      const cleared: ModelPreviewCleared = { _tag: "ModelPreviewCleared", runId, attemptFence, generation }
      const next = new Map(current).set(runId, { ...lane, generation, retained: undefined })
      return [[[cleared, [...lane.subscribers.values()]]], next]
    }).pipe(
      Effect.flatMap((publications) =>
        Effect.forEach(publications, ([event, subscribers]) =>
          Effect.forEach(subscribers, (queue) => Queue.offer(queue, event), {
            discard: true,
          }),
        ),
      ),
      Effect.asVoid,
    )
  const open = (runId: string, attemptFence: number): Effect.Effect<Sink, never, Scope.Scope> =>
    Effect.gen(function* () {
      const generation = yield* SynchronizedRef.modify(lanes, (current) => {
        const lane = current.get(runId) ?? clearedLane(0)
        const nextGeneration = lane.generation + 1
        return [
          nextGeneration,
          new Map(current).set(runId, { ...lane, generation: nextGeneration, retained: undefined }),
        ] as const
      })
      const scope = yield* Effect.scope
      const serializer = yield* Semaphore.make(1)
      const state = yield* Ref.make<State | undefined>(undefined)
      const closed = yield* Ref.make(false)
      const cleaned = yield* Ref.make(false)
      const timerScheduled = yield* Ref.make(false)
      const emit = (frame: ModelPreviewFrame) => publish(runId, generation, { ...frame, attemptFence })
      const flushAfterCadence = (delay: number): Effect.Effect<void> =>
        Effect.sleep(delay).pipe(
          Effect.andThen(
            serializer.withPermits(1)(
              Effect.gen(function* () {
                if (yield* Ref.get(closed)) {
                  yield* Ref.set(timerScheduled, false)
                  return undefined
                }
                const now = yield* Clock.currentTimeMillis
                const current = yield* Ref.get(state)
                if (current === undefined || current.pendingAt === undefined) {
                  yield* Ref.set(timerScheduled, false)
                  return undefined
                }
                const remaining = current.pendingAt + MaxCadenceMillis - now
                if (remaining > 0) return remaining
                const [frame, next] = flush(current, now)
                yield* Ref.set(state, next)
                yield* Ref.set(timerScheduled, false)
                if (frame !== undefined) yield* emit(frame)
                return undefined
              }),
            ),
          ),
          Effect.flatMap((remaining) => (remaining === undefined ? Effect.void : flushAfterCadence(remaining))),
        )
      const cleanup = Effect.uninterruptible(
        serializer.withPermits(1)(
          Effect.gen(function* () {
            if (yield* Ref.get(cleaned)) return
            yield* Ref.set(closed, true)
            yield* Ref.set(state, undefined)
            yield* clearLane(runId, attemptFence, generation)
            yield* Ref.set(cleaned, true)
          }),
        ),
      )
      yield* Effect.addFinalizer(() => cleanup)
      return {
        offer: (part) =>
          serializer.withPermits(1)(
            Effect.gen(function* () {
              if (yield* Ref.get(closed)) return false
              const now = yield* Clock.currentTimeMillis
              let emitted = false
              let next = yield* update(yield* Ref.get(state), part, now, (frame) => {
                emitted = true
                return emit(frame)
              })
              if (next !== undefined && next.pendingCharacters > 0 && !(yield* Ref.get(timerScheduled))) {
                yield* Effect.uninterruptible(
                  Ref.set(state, next).pipe(
                    Effect.andThen(Ref.set(timerScheduled, true)),
                    Effect.andThen(Effect.forkIn(flushAfterCadence(MaxCadenceMillis), scope)),
                  ),
                )
              } else {
                yield* Ref.set(state, next)
              }
              return emitted
            }),
          ),
        clear: cleanup,
      }
    })
  const previews = (runId: string): Stream.Stream<ModelPreviewEvent> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const queue = yield* Queue.dropping<ModelPreviewEvent>(SubscriberCapacity)
        const [retained, subscriberId] = yield* SynchronizedRef.modify(lanes, (current) => {
          const lane = current.get(runId) ?? clearedLane(0)
          const id = lane.nextSubscriberId
          const subscribers = new Map(lane.subscribers).set(id, queue)
          const next = new Map(current).set(runId, { ...lane, subscribers, nextSubscriberId: id + 1 })
          return [[lane.retained, id], next] as const
        })
        yield* Effect.addFinalizer(() =>
          SynchronizedRef.update(lanes, (current) => {
            const lane = current.get(runId)
            if (lane === undefined) return current
            const subscribers = new Map(lane.subscribers)
            subscribers.delete(subscriberId)
            return new Map(current).set(runId, { ...lane, subscribers })
          }).pipe(Effect.andThen(Queue.shutdown(queue))),
        )
        return Stream.concat(retained === undefined ? Stream.empty : Stream.make(retained), Stream.fromQueue(queue))
      }),
    )
  return ModelPreviewLane.of({ open, previews })
})

export const layer: Layer.Layer<ModelPreviewLane> = Layer.effect(ModelPreviewLane, make)

export const open =
  (lane: Option.Option<Interface>) =>
  (runId: string, attemptFence: number): Effect.Effect<Sink, never, Scope.Scope> =>
    Option.match(lane, {
      onNone: () => Effect.succeed({ offer: () => Effect.succeed(false), clear: Effect.void }),
      onSome: (service) => service.open(runId, attemptFence),
    })

export const previews =
  (lane: Option.Option<Interface>) =>
  (runId: string): Stream.Stream<ModelPreviewEvent> =>
    Option.match(lane, { onNone: () => Stream.empty, onSome: (service) => service.previews(runId) })
