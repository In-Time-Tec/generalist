import { Effect, Ref, Schema } from "effect"
import { Prompt, type Tool } from "effect/unstable/ai"
import type { Agent, RunOptions } from "./agent.js"
import type { TurnOverrides } from "../turn/turn-policy.js"
import type { HandoffTarget } from "../policy/handoff-target.js"
import { AgentPin } from "../durable/pin.js"

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

export const HandoffCommit = Schema.Struct({
  _tag: Schema.Literal("HandoffCommit"),
  state: HandoffControlState,
  transcript: Prompt.Prompt,
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

export const takePendingContinuation = <E, R>(
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
  })

export const fromHandoffControlState = (state: HandoffControlState, active: HandoffTarget): HandoffRunState => {
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
}

export const makeHandoffRunState = (
  agent: Agent<Record<string, Tool.Any>, unknown>,
  activePin?: AgentPin,
): HandoffRunState => ({
  root: agent.name,
  active: { name: agent.name, agent, ...(activePin === undefined ? {} : { pin: activePin }) },
  path: [],
  edgeCounts: new Map(),
  handoffCount: 0,
  pendingContinuation: undefined,
})

export const edgeLabel = (source: string, target: string): string => JSON.stringify([source, target])

export const edgeCount = (counts: HandoffRunState["edgeCounts"], source: string, target: string): number =>
  counts.get(source)?.get(target) ?? 0

export const incrementEdge = (
  counts: HandoffRunState["edgeCounts"],
  source: string,
  target: string,
): HandoffRunState["edgeCounts"] => {
  const next = new Map(counts)
  const targets = new Map(next.get(source))
  targets.set(target, (targets.get(target) ?? 0) + 1)
  next.set(source, targets)
  return next
}

export class HandoffTargetMissing extends Schema.TaggedErrorClass<HandoffTargetMissing>()(
  "@batonfx/core/HandoffTargetMissing",
  { target: Schema.String, turn: Schema.Finite },
) {}

export class HandoffLimitExceeded extends Schema.TaggedErrorClass<HandoffLimitExceeded>()(
  "@batonfx/core/HandoffLimitExceeded",
  {
    kind: Schema.Literals(["total", "edge", "depth"]),
    turn: Schema.Finite,
    limit: Schema.Finite,
    edge: Schema.optionalKey(Schema.String),
  },
) {}

export class HandoffRequirementsMissing extends Schema.TaggedErrorClass<HandoffRequirementsMissing>()(
  "@batonfx/core/HandoffRequirementsMissing",
  { target: Schema.String, message: Schema.String, turn: Schema.Finite },
) {}

export const HandoffAccepted = Schema.Struct({
  _tag: Schema.Literal("HandoffAccepted"),
  handoffId: Schema.String,
  source: Schema.String,
  target: Schema.String,
})

export type HandoffAccepted = typeof HandoffAccepted.Type

export const isHandoffAccepted = Schema.is(HandoffAccepted)

export const maxHandoffs = (
  options: RunOptions,
  agent: Agent<Record<string, Tool.Any>, unknown>,
): number | undefined => {
  const run = options.budget?.handoffs
  const agentDefault = agent.budget?.handoffs
  if (run === undefined) return agentDefault
  if (agentDefault === undefined) return run
  return Math.min(run, agentDefault)
}

export const makeHandoffStateRef = (
  agent: Agent<Record<string, Tool.Any>, unknown>,
  activePin?: AgentPin,
  restored?: HandoffControlState,
): Effect.Effect<Ref.Ref<HandoffRunState>> =>
  Ref.make(
    restored === undefined
      ? makeHandoffRunState(agent, activePin)
      : fromHandoffControlState(restored, {
          name: agent.name,
          agent,
          ...(activePin === undefined ? {} : { pin: activePin }),
        }),
  )
