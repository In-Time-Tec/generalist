import { Clock, Context, Effect, Layer, Option, PubSub, Queue, Ref, Stream, type Scope } from "effect"
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

interface Interface {
  readonly open: (runId: string, attemptFence: number) => Effect.Effect<Sink, never, Scope.Scope>
  readonly previews: (runId: string) => Stream.Stream<ModelPreview>
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
  const published = yield* PubSub.sliding<ModelPreview>(1)
  yield* Effect.addFinalizer(() => PubSub.shutdown(published))
  const open = (runId: string, attemptFence: number): Effect.Effect<Sink, never, Scope.Scope> =>
    Effect.gen(function* () {
      const slot = yield* Queue.sliding<ModelPreview>(1)
      const state = yield* Ref.make<State | undefined>(undefined)
      const closed = yield* Ref.make(false)
      yield* Queue.take(slot).pipe(
        Effect.tap((preview) => PubSub.publish(published, preview)),
        Effect.forever,
        Effect.forkScoped,
      )
      yield* Effect.addFinalizer(() =>
        Ref.set(closed, true).pipe(Effect.andThen(Queue.shutdown(slot)), Effect.andThen(Ref.set(state, undefined))),
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
            return preview === undefined ? false : yield* Queue.offer(slot, { ...preview, runId, attemptFence })
          }),
        clear: Ref.set(state, undefined).pipe(Effect.andThen(Queue.poll(slot)), Effect.asVoid),
      }
    })
  return ModelPreviewLane.of({
    open,
    previews: (runId) => Stream.fromPubSub(published).pipe(Stream.filter((preview) => preview.runId === runId)),
  })
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
  (runId: string): Stream.Stream<ModelPreview> =>
    Option.match(lane, { onNone: () => Stream.empty, onSome: (service) => service.previews(runId) })
