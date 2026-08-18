import { Effect, Function, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { RunOptions } from "./agent.js"
import type { Any as AnyAgent } from "./agent-closure.js"
import type { TurnOverrides } from "../turn/turn-policy.js"
import type { HandoffTarget } from "../policy/handoff-target.js"
import { AgentPin } from "../durable/pin.js"

const isAgentLike = (value: unknown): value is AnyAgent =>
  typeof value === "object" && value !== null && "toolkit" in value

export const HandoffFrame = Schema.Struct({
  handoffId: Schema.String,
  source: Schema.String,
  target: Schema.String,
  turn: Schema.Finite,
  reason: Schema.optionalKey(Schema.String),
})

export type HandoffFrame = typeof HandoffFrame.Type

export const HandoffEdgeCount = Schema.Struct({
  source: Schema.String,
  target: Schema.String,
  count: Schema.Finite,
})

export const HandoffControlState = Schema.Struct({
  root: Schema.String,
  active: Schema.String,
  path: Schema.Array(HandoffFrame),
  edgeCounts: Schema.Array(HandoffEdgeCount),
  handoffCount: Schema.Finite,
  pendingContinuation: Schema.optionalKey(
    Schema.Struct({
      prompt: Prompt.Prompt,
      instructions: Schema.optionalKey(Schema.String),
    }),
  ),
})

export type HandoffControlState = typeof HandoffControlState.Type

export const HandoffCommit = Schema.TaggedStruct("HandoffCommit", {
  state: HandoffControlState,
  sessionEntryId: Schema.String,
  sessionParentId: Schema.NullOr(Schema.String),
  projectedHistory: Prompt.Prompt,
  targetAgentPin: Schema.optionalKey(AgentPin),
})

export type HandoffCommit = typeof HandoffCommit.Type

export interface HandoffRunState {
  readonly root: string
  readonly active: HandoffTarget
  readonly path: ReadonlyArray<HandoffFrame>
  readonly edgeCounts: ReadonlyMap<string, ReadonlyMap<string, number>>
  readonly handoffCount: number
  readonly pendingContinuation:
    | {
        readonly prompt: Prompt.RawInput
        readonly overrides?: TurnOverrides
      }
    | undefined
}

export const toHandoffControlState = (state: HandoffRunState): HandoffControlState => ({
  root: state.root,
  active: state.active.name,
  path: state.path,
  edgeCounts: [...state.edgeCounts].flatMap(([source, targets]) =>
    [...targets].map(([target, count]) => ({ source, target, count })),
  ),
  handoffCount: state.handoffCount,
  ...(state.pendingContinuation === undefined
    ? {}
    : {
        pendingContinuation: {
          prompt: Prompt.make(state.pendingContinuation.prompt),
          ...(state.pendingContinuation.overrides?.instructions === undefined
            ? {}
            : { instructions: state.pendingContinuation.overrides.instructions }),
        },
      }),
})

export const takePendingContinuation: {
  <E, R>(
    persist: (state: HandoffControlState) => Effect.Effect<void, E, R>,
  ): (stateRef: Ref.Ref<HandoffRunState>) => Effect.Effect<HandoffRunState["pendingContinuation"], E, R>
  <E, R>(
    stateRef: Ref.Ref<HandoffRunState>,
    persist: (state: HandoffControlState) => Effect.Effect<void, E, R>,
  ): Effect.Effect<HandoffRunState["pendingContinuation"], E, R>
} = Function.dual(
  2,
  <E, R>(
    stateRef: Ref.Ref<HandoffRunState>,
    persist: (state: HandoffControlState) => Effect.Effect<void, E, R>,
  ): Effect.Effect<HandoffRunState["pendingContinuation"], E, R> =>
    Effect.gen(function* () {
      const state = yield* Ref.get(stateRef)
      if (state.pendingContinuation === undefined) return undefined
      const continued = { ...state, pendingContinuation: undefined }
      yield* persist(toHandoffControlState(continued))
      yield* Ref.set(stateRef, continued)
      return state.pendingContinuation
    }),
)

export const fromHandoffControlState: {
  (active: HandoffTarget): (state: HandoffControlState) => HandoffRunState
  (state: HandoffControlState, active: HandoffTarget): HandoffRunState
} = Function.dual(2, (state: HandoffControlState, active: HandoffTarget): HandoffRunState => {
  const edgeCounts = new Map<string, Map<string, number>>()
  for (const edge of state.edgeCounts) {
    const targets = edgeCounts.get(edge.source) ?? new Map<string, number>()
    targets.set(edge.target, edge.count)
    edgeCounts.set(edge.source, targets)
  }
  return {
    root: state.root,
    active,
    path: state.path,
    edgeCounts,
    handoffCount: state.handoffCount,
    ...(state.pendingContinuation === undefined
      ? { pendingContinuation: undefined }
      : {
          pendingContinuation: {
            prompt: state.pendingContinuation.prompt,
            ...(state.pendingContinuation.instructions === undefined
              ? {}
              : { overrides: { instructions: state.pendingContinuation.instructions } }),
          },
        }),
  }
})

export const makeHandoffRunState: {
  (activePin?: AgentPin): (agent: AnyAgent) => HandoffRunState
  (agent: AnyAgent, activePin?: AgentPin): HandoffRunState
} = Function.dual(
  (args) => args.length >= 1 && isAgentLike(args[0]),
  (agent: AnyAgent, activePin?: AgentPin): HandoffRunState => ({
    root: agent.name,
    active: { name: agent.name, agent, ...(activePin === undefined ? {} : { pin: activePin }) },
    path: [],
    edgeCounts: new Map(),
    handoffCount: 0,
    pendingContinuation: undefined,
  }),
)

export const edgeLabel: {
  (target: string): (source: string) => string
  (source: string, target: string): string
} = Function.dual(2, (source: string, target: string): string => JSON.stringify([source, target]))

export const edgeCount: {
  (source: string, target: string): (counts: HandoffRunState["edgeCounts"]) => number
  (counts: HandoffRunState["edgeCounts"], source: string, target: string): number
} = Function.dual(
  3,
  (counts: HandoffRunState["edgeCounts"], source: string, target: string): number =>
    counts.get(source)?.get(target) ?? 0,
)

export const incrementEdge: {
  (source: string, target: string): (counts: HandoffRunState["edgeCounts"]) => HandoffRunState["edgeCounts"]
  (counts: HandoffRunState["edgeCounts"], source: string, target: string): HandoffRunState["edgeCounts"]
} = Function.dual(
  3,
  (counts: HandoffRunState["edgeCounts"], source: string, target: string): HandoffRunState["edgeCounts"] => {
    const next = new Map(counts)
    const targets = new Map(next.get(source))
    targets.set(target, (targets.get(target) ?? 0) + 1)
    next.set(source, targets)
    return next
  },
)

export class HandoffTargetMissing extends Schema.TaggedErrorClass<HandoffTargetMissing>()(
  "tenetkit/core/HandoffTargetMissing",
  { target: Schema.String, turn: Schema.Finite },
) {}

export class HandoffLimitExceeded extends Schema.TaggedErrorClass<HandoffLimitExceeded>()(
  "tenetkit/core/HandoffLimitExceeded",
  {
    kind: Schema.Literals(["total", "edge", "depth"]),
    turn: Schema.Finite,
    limit: Schema.Finite,
    edge: Schema.optionalKey(Schema.String),
  },
) {}

export class HandoffRequirementsMissing extends Schema.TaggedErrorClass<HandoffRequirementsMissing>()(
  "tenetkit/core/HandoffRequirementsMissing",
  { target: Schema.String, message: Schema.String, turn: Schema.Finite },
) {}

export const HandoffAccepted = Schema.TaggedStruct("HandoffAccepted", {
  handoffId: Schema.String,
  source: Schema.String,
  target: Schema.String,
})

export type HandoffAccepted = typeof HandoffAccepted.Type

export const isHandoffAccepted = Schema.is(HandoffAccepted)

export const maxHandoffs: {
  (agent: AnyAgent): (options: RunOptions) => number | undefined
  (options: RunOptions, agent: AnyAgent): number | undefined
} = Function.dual(2, (options: RunOptions, agent: AnyAgent): number | undefined => {
  const run = options.budget?.handoffs
  const agentDefault = agent.budget?.handoffs
  if (run === undefined) return agentDefault
  if (agentDefault === undefined) return run
  return Math.min(run, agentDefault)
})

export const makeHandoffStateRef: {
  (activePin?: AgentPin, restored?: HandoffControlState): (agent: AnyAgent) => Effect.Effect<Ref.Ref<HandoffRunState>>
  (agent: AnyAgent, activePin?: AgentPin, restored?: HandoffControlState): Effect.Effect<Ref.Ref<HandoffRunState>>
} = Function.dual(
  (args) => args.length >= 1 && isAgentLike(args[0]),
  (agent: AnyAgent, activePin?: AgentPin, restored?: HandoffControlState): Effect.Effect<Ref.Ref<HandoffRunState>> =>
    Ref.make(
      restored === undefined
        ? makeHandoffRunState(agent, activePin)
        : fromHandoffControlState(restored, {
            name: agent.name,
            agent,
            ...(activePin === undefined ? {} : { pin: activePin }),
          }),
    ),
)
