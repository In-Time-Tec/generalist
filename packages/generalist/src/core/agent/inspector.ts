import { Clock, Context, Effect, Layer, Option, Ref, Schema, Stream } from "effect"
import type { RunId } from "../durable/run-id.js"
import { ActionableTaggedError, errorHint } from "../error-hint.js"
import type { Event } from "./event.js"

/** Process-local token totals reported by completed model turns. */
export interface Usage {
  readonly inputTokens: number
  readonly outputTokens: number
}

/** Point-in-time process-local state for one Agent Run. */
export interface Snapshot {
  readonly runId: RunId
  readonly turn: number
  readonly usage: Usage
  readonly activeTools: ReadonlyArray<string>
  readonly lastEvent?: Event
  readonly elapsed: number
}

/** The requested process-local Run is not known to this Inspector. */
export class RunNotFound extends ActionableTaggedError<RunNotFound>()("generalist/core/InspectorRunNotFound", {
  runId: Schema.String,
  hint: errorHint("Consume the Agent Run with this Inspector layer before requesting its snapshot."),
}) {}

/** Process-local Agent Run inspection seam. */
export interface Service {
  readonly snapshot: (runId: RunId) => Effect.Effect<Snapshot, RunNotFound>
  /** @internal */
  readonly start: (runId: RunId) => Effect.Effect<void>
  /** @internal */
  readonly publish: (runId: RunId, event: Event) => Effect.Effect<void>
}

export class Inspector extends Context.Service<Inspector, Service>()("generalist/core/agent/inspector/Inspector") {
  static get layerMemory(): Layer.Layer<Inspector> {
    return layerMemory
  }

  static layerTest(implementation: Service): Layer.Layer<Inspector> {
    return layerTest(implementation)
  }
}

interface State {
  readonly startedAt: number
  readonly turn: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly activeTools: ReadonlyMap<string, string>
  readonly lastEvent?: Event
}

const emptyState = (startedAt: number): State => ({
  startedAt,
  turn: 0,
  inputTokens: 0,
  outputTokens: 0,
  activeTools: new Map(),
})

const tokenTotal = (value: number | undefined): number => value ?? 0

const nextState = (state: State, event: Event): State => {
  const activeTools = new Map(state.activeTools)
  if (event._tag === "ToolExecutionStarted") activeTools.set(event.call.id, event.call.name)
  if (event._tag === "ToolExecutionCompleted" || event._tag === "ToolExecutionWaiting") {
    activeTools.delete(event.call.id)
  }
  const committedUsage = event._tag === "ModelResponseCommitted" ? event.response.usage : undefined
  const completedUsage = event._tag === "Completed" ? event.usage : undefined
  const turn = "turn" in event ? Math.max(state.turn, event.turn) : state.turn
  return {
    ...state,
    turn,
    inputTokens:
      completedUsage === undefined
        ? state.inputTokens + tokenTotal(committedUsage?.inputTokens.total)
        : tokenTotal(completedUsage.inputTokens.total),
    outputTokens:
      completedUsage === undefined
        ? state.outputTokens + tokenTotal(committedUsage?.outputTokens.total)
        : tokenTotal(completedUsage.outputTokens.total),
    activeTools,
    lastEvent: event,
  }
}

/** In-memory Inspector retained for the lifetime of its Layer. */
export const layerMemory: Layer.Layer<Inspector> = Layer.effect(
  Inspector,
  Effect.gen(function* () {
    const states = yield* Ref.make<ReadonlyMap<RunId, State>>(new Map())
    return Inspector.of({
      start: (runId) =>
        Effect.gen(function* () {
          const startedAt = yield* Clock.currentTimeMillis
          yield* Ref.update(states, (current) => {
            if (current.has(runId)) return current
            const updated = new Map(current)
            updated.set(runId, emptyState(startedAt))
            return updated
          })
        }),
      publish: (runId, event) =>
        Ref.update(states, (current) => {
          const state = current.get(runId)
          if (state === undefined) return current
          const updated = new Map(current)
          updated.set(runId, nextState(state, event))
          return updated
        }),
      snapshot: (runId) =>
        Effect.gen(function* () {
          const state = (yield* Ref.get(states)).get(runId)
          if (state === undefined) {
            return yield* RunNotFound.make({ runId })
          }
          const now = yield* Clock.currentTimeMillis
          const snapshot: Snapshot = {
            runId,
            turn: state.turn,
            usage: { inputTokens: state.inputTokens, outputTokens: state.outputTokens },
            activeTools: [...state.activeTools.values()],
            elapsed: Math.max(0, now - state.startedAt),
          }
          return state.lastEvent === undefined ? snapshot : { ...snapshot, lastEvent: state.lastEvent }
        }),
    })
  }),
)

/** Inspector Layer backed by a caller-supplied implementation. */
export const layerTest = (implementation: Service): Layer.Layer<Inspector> =>
  Layer.succeed(Inspector, Inspector.of(implementation))

/** @internal Publish a Run stream when an Inspector is present without adding a service requirement. */
export const observe = <A extends Event, E, R>(runId: RunId, events: Stream.Stream<A, E, R>): Stream.Stream<A, E, R> =>
  Stream.unwrap(
    Effect.serviceOption(Inspector).pipe(
      Effect.map(
        Option.match({
          onNone: () => events,
          onSome: (inspector) =>
            Stream.concat(
              Stream.fromEffect(inspector.start(runId)).pipe(Stream.drain),
              events.pipe(Stream.tap((event) => inspector.publish(runId, event))),
            ),
        }),
      ),
    ),
  )
