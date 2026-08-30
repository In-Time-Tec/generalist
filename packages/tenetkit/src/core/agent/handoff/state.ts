import { Effect, Function, Ref, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { RunOptions } from "../service.js"
import type { Any as AnyAgent } from "../closure.js"
import type { TurnOverrides } from "../../turn/policy.js"
import type { Target } from "../../policy/handoff-target.js"
import { AgentPin } from "../../durable/pin.js"

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

export const ControlState = Schema.Struct({
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

export type ControlState = typeof ControlState.Type

export const Commit = Schema.TaggedStruct("Commit", {
  state: ControlState,
  sessionEntryId: Schema.String,
  sessionParentId: Schema.NullOr(Schema.String),
  projectedHistory: Prompt.Prompt,
  targetAgentPin: Schema.optionalKey(AgentPin),
})

export type Commit = typeof Commit.Type

export interface HandoffRunState {
  readonly root: string
  readonly active: Target
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

export const toControlState = (state: HandoffRunState): ControlState => {
  const control = {
    root: state.root,
    active: state.active.name,
    path: state.path,
    edgeCounts: [...state.edgeCounts].flatMap(([source, targets]) =>
      [...targets].map(([target, count]) => ({ source, target, count })),
    ),
    handoffCount: state.handoffCount,
  }
  if (state.pendingContinuation !== undefined) {
    const instructions = state.pendingContinuation.overrides?.instructions
    const pendingContinuation =
      instructions === undefined
        ? { prompt: Prompt.make(state.pendingContinuation.prompt) }
        : { prompt: Prompt.make(state.pendingContinuation.prompt), instructions }
    return { ...control, pendingContinuation }
  }
  return control
}

export const takePendingContinuation: {
  <E, R>(
    persist: (state: ControlState) => Effect.Effect<void, E, R>,
  ): (stateRef: Ref.Ref<HandoffRunState>) => Effect.Effect<HandoffRunState["pendingContinuation"], E, R>
  <E, R>(
    stateRef: Ref.Ref<HandoffRunState>,
    persist: (state: ControlState) => Effect.Effect<void, E, R>,
  ): Effect.Effect<HandoffRunState["pendingContinuation"], E, R>
} = Function.dual(
  2,
  <E, R>(
    stateRef: Ref.Ref<HandoffRunState>,
    persist: (state: ControlState) => Effect.Effect<void, E, R>,
  ): Effect.Effect<HandoffRunState["pendingContinuation"], E, R> =>
    Effect.gen(function* () {
      const state = yield* Ref.get(stateRef)
      if (state.pendingContinuation === undefined) return undefined
      const continued = { ...state, pendingContinuation: undefined }
      yield* persist(toControlState(continued))
      yield* Ref.set(stateRef, continued)
      return state.pendingContinuation
    }),
)

export const fromControlState: {
  (active: Target): (state: ControlState) => HandoffRunState
  (state: ControlState, active: Target): HandoffRunState
} = Function.dual(2, (state: ControlState, active: Target): HandoffRunState => {
  const edgeCounts = new Map<string, Map<string, number>>()
  for (const edge of state.edgeCounts) {
    const targets = edgeCounts.get(edge.source) ?? new Map<string, number>()
    targets.set(edge.target, edge.count)
    edgeCounts.set(edge.source, targets)
  }
  const restored = {
    root: state.root,
    active,
    path: state.path,
    edgeCounts,
    handoffCount: state.handoffCount,
    pendingContinuation: undefined,
  }
  if (state.pendingContinuation !== undefined) {
    const instructions = state.pendingContinuation.instructions
    const pendingContinuation =
      instructions === undefined
        ? { prompt: state.pendingContinuation.prompt }
        : { prompt: state.pendingContinuation.prompt, overrides: { instructions } }
    return { ...restored, pendingContinuation }
  }
  return restored
})

export const initialHandoffRunState: {
  (activePin?: AgentPin): (agent: AnyAgent) => HandoffRunState
  (agent: AnyAgent, activePin?: AgentPin): HandoffRunState
} = Function.dual(
  (args) => args.length >= 1 && !Schema.is(AgentPin)(args[0]),
  (agent: AnyAgent, activePin?: AgentPin): HandoffRunState => {
    const active: Target =
      activePin === undefined ? { name: agent.name, agent } : { name: agent.name, agent, pin: activePin }
    return {
      root: agent.name,
      active,
      path: [],
      edgeCounts: new Map(),
      handoffCount: 0,
      pendingContinuation: undefined,
    }
  },
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

export class TargetMissing extends Schema.TaggedError<TargetMissing>()("tenetkit/core/TargetMissing", {
  target: Schema.String,
  turn: Schema.Finite,
}) {}

export class HandoffLimitExceeded extends Schema.TaggedError<HandoffLimitExceeded>()(
  "tenetkit/core/HandoffLimitExceeded",
  {
    kind: Schema.Literals(["total", "edge", "depth"]),
    turn: Schema.Finite,
    limit: Schema.Finite,
    edge: Schema.optionalKey(Schema.String),
  },
) {}

export class HandoffRequirementsMissing extends Schema.TaggedError<HandoffRequirementsMissing>()(
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
