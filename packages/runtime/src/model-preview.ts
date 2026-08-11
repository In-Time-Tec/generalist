import { Clock, Context, Effect, Layer, Option, Queue, Ref, Stream, SynchronizedRef, type Scope } from "effect"
import type { AgentLoopEvent } from "./agent-event.js"

type ModelPart = Extract<AgentLoopEvent, { readonly _tag: "ModelPart" }>

/** @experimental Disposable cumulative model output for one live provider attempt. */
export interface ModelPreview {
  readonly runId: string
  readonly attemptFence: number
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly revision: number
  readonly text: string
  readonly reasoning: string
  readonly truncated: boolean
}

/** @experimental Tombstone frame emitted when a Run's live preview lane is cleared. */
export interface PreviewCleared {
  readonly _tag: "Cleared"
  readonly runId: string
  readonly attemptFence: number
  readonly generation: number
}

/** @experimental One live preview frame: a cumulative snapshot or a clear tombstone. */
export type PreviewFrame = ModelPreview | PreviewCleared

/** @experimental Maximum combined text and reasoning characters retained by a preview attempt. */
export const MaxCharacters = 4_096

/** @experimental Minimum milliseconds between cumulative preview snapshots, except for a terminal flush. */
export const MaxCadenceMillis = 50

export interface Sink {
  readonly offer: (part: ModelPart) => Effect.Effect<boolean>
  readonly clear: Effect.Effect<void>
}

type Snapshot = Omit<ModelPreview, "runId" | "attemptFence">

interface State {
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly revision: number
  readonly text: string
  readonly reasoning: string
  readonly characters: number
  readonly truncated: boolean
  readonly dirty: boolean
  readonly publishedAt: number
}

interface LaneState {
  readonly generation: number
  readonly retained: ModelPreview | undefined
  readonly subscribers: ReadonlyMap<number, Queue.Queue<PreviewFrame>>
  readonly nextSubscriberId: number
}

const clearedLane = (generation: number): LaneState => ({
  generation,
  retained: undefined,
  subscribers: new Map(),
  nextSubscriberId: 1,
})

interface Interface {
  readonly open: (runId: string, attemptFence: number) => Effect.Effect<Sink, never, Scope.Scope>
  readonly previews: (runId: string) => Stream.Stream<PreviewFrame>
}

export class ModelPreviewLane extends Context.Service<ModelPreviewLane, Interface>()(
  "@batonfx/runtime/model-preview/ModelPreviewLane",
) {}

const sameIdentity = (state: State, part: ModelPart): boolean =>
  state.turn === part.turn &&
  state.modelCallId === part.modelCallId &&
  state.modelAttemptId === part.modelAttemptId &&
  state.attempt === part.attempt

const initialState = (part: ModelPart): State => ({
  turn: part.turn,
  modelCallId: part.modelCallId,
  modelAttemptId: part.modelAttemptId,
  attempt: part.attempt,
  revision: 0,
  text: "",
  reasoning: "",
  characters: 0,
  truncated: false,
  dirty: false,
  publishedAt: Number.NEGATIVE_INFINITY,
})

const append = (state: State, field: "text" | "reasoning", delta: string): State => {
  const remaining = Math.max(0, MaxCharacters - state.characters)
  const accepted = delta.slice(0, remaining)
  return {
    ...state,
    [field]: state[field] + accepted,
    characters: state.characters + accepted.length,
    truncated: state.truncated || accepted.length < delta.length,
    dirty: true,
  }
}

const update = (state: State, part: ModelPart, now: number): readonly [Snapshot | undefined, State | undefined] => {
  const current = sameIdentity(state, part) ? state : initialState(part)
  const delta = part.part.type === "text-delta" || part.part.type === "reasoning-delta" ? part.part.delta : undefined
  const changed =
    delta === undefined || delta.length === 0
      ? current
      : append(current, part.part.type === "text-delta" ? "text" : "reasoning", delta)
  const terminal = part.part.type === "finish" || part.part.type === "error"
  if (!changed.dirty || (!terminal && now - changed.publishedAt < MaxCadenceMillis)) {
    return [undefined, terminal ? undefined : changed]
  }
  const next = { ...changed, revision: changed.revision + 1, dirty: false, publishedAt: now }
  return [
    {
      turn: next.turn,
      modelCallId: next.modelCallId,
      modelAttemptId: next.modelAttemptId,
      attempt: next.attempt,
      revision: next.revision,
      text: next.text,
      reasoning: next.reasoning,
      truncated: next.truncated,
    },
    terminal ? undefined : next,
  ]
}

export const make: Effect.Effect<Interface, never, Scope.Scope> = Effect.gen(function* () {
  const lanes = yield* SynchronizedRef.make<ReadonlyMap<string, LaneState>>(new Map())
  const publish = (runId: string, generation: number, preview: ModelPreview): Effect.Effect<void> =>
    SynchronizedRef.modifyEffect(lanes, (current) => {
      const lane = current.get(runId)
      if (lane === undefined || lane.generation !== generation) return Effect.succeed([undefined, current] as const)
      const next = new Map(current)
      next.set(runId, { ...lane, retained: preview })
      return Effect.forEach(lane.subscribers.values(), (queue) => Queue.offer(queue, preview), {
        discard: true,
      }).pipe(Effect.as([undefined, next] as const))
    })
  const clear = (runId: string, attemptFence: number): Effect.Effect<void> =>
    SynchronizedRef.modifyEffect(lanes, (current) => {
      const lane = current.get(runId)
      if (lane === undefined) return Effect.succeed([undefined, current] as const)
      const generation = lane.generation + 1
      const tombstone: PreviewFrame = { _tag: "Cleared", runId, attemptFence, generation }
      const next = new Map(current)
      next.set(runId, { ...lane, generation, retained: undefined })
      return Effect.forEach(lane.subscribers.values(), (queue) => Queue.offer(queue, tombstone), {
        discard: true,
      }).pipe(Effect.as([undefined, next] as const))
    })
  const open = (runId: string, attemptFence: number): Effect.Effect<Sink, never, Scope.Scope> =>
    Effect.gen(function* () {
      yield* SynchronizedRef.update(lanes, (current) =>
        current.has(runId) ? current : new Map(current).set(runId, clearedLane(0)),
      )
      const slot = yield* Queue.sliding<readonly [number, ModelPreview]>(1)
      const state = yield* Ref.make<State | undefined>(undefined)
      const closed = yield* Ref.make(false)
      const cleared = yield* Ref.make(false)
      yield* Queue.take(slot).pipe(
        Effect.flatMap(([generation, preview]) => publish(runId, generation, preview)),
        Effect.forever,
        Effect.forkScoped,
      )
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Ref.set(closed, true)
          if (!(yield* Ref.get(cleared))) yield* clear(runId, attemptFence)
          yield* Queue.shutdown(slot)
        }),
      )
      return {
        offer: (part) =>
          Effect.gen(function* () {
            if (yield* Ref.get(closed)) return false
            const now = yield* Clock.currentTimeMillis
            const preview = yield* Ref.modify(state, (previous) => {
              const [snapshot, next] = update(previous ?? initialState(part), part, now)
              return [snapshot, next]
            })
            if (preview === undefined) return false
            const generation = yield* SynchronizedRef.get(lanes).pipe(Effect.map((map) => map.get(runId)!.generation))
            return yield* Queue.offer(slot, [generation, { ...preview, runId, attemptFence }])
          }),
        clear: Effect.gen(function* () {
          if (yield* Ref.get(cleared)) return
          yield* Ref.set(cleared, true)
          yield* Ref.set(state, undefined)
          yield* Queue.poll(slot)
          yield* clear(runId, attemptFence)
        }),
      }
    })
  const previews = (runId: string): Stream.Stream<PreviewFrame> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const queue = yield* Queue.sliding<PreviewFrame>(1)
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
  (runId: string): Stream.Stream<PreviewFrame> =>
    Option.match(lane, { onNone: () => Stream.empty, onSome: (service) => service.previews(runId) })
