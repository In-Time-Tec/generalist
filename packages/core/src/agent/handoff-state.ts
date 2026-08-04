import { Effect, Ref, Schema } from "effect"
import type { Prompt, Tool } from "effect/unstable/ai"
import type { Agent, RunOptions } from "./agent.js"
import type { AgentRef } from "../durable/agent-ref.js"
import type { TurnOverrides } from "../turn/turn-policy.js"
import type { HandoffTarget } from "../policy/handoff-target.js"

export const HandoffFrame = Schema.Struct({
  handoffId: Schema.String,
  source: Schema.String,
  target: Schema.String,
  turn: Schema.Finite,
  reason: Schema.optionalKey(Schema.String),
})

export type HandoffFrame = typeof HandoffFrame.Type

export interface HandoffRunState {
  readonly rootRef: AgentRef
  readonly active: HandoffTarget
  readonly path: ReadonlyArray<HandoffFrame>
  readonly edgeCounts: ReadonlyMap<string, number>
  readonly handoffCount: number
  readonly pendingContinuation:
    | {
        readonly prompt: Prompt.RawInput
        readonly overrides?: TurnOverrides
      }
    | undefined
}

export const makeHandoffRunState = (
  agent: Agent<Record<string, Tool.Any>, unknown>,
  rootRef: AgentRef,
): HandoffRunState => ({
  rootRef,
  active: { name: agent.name, agent, ref: rootRef },
  path: [],
  edgeCounts: new Map(),
  handoffCount: 0,
  pendingContinuation: undefined,
})

export const edgeKey = (source: AgentRef, target: AgentRef): string => `${source.id}:${target.id}`

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
  rootRef: AgentRef,
): Effect.Effect<Ref.Ref<HandoffRunState>> => Ref.make(makeHandoffRunState(agent, rootRef))
