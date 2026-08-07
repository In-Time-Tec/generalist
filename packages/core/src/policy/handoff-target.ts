import { Context, Function, Layer } from "effect"
import type { Any as AnyAgent } from "../agent/agent-closure.js"
import type { AgentPin } from "../durable/pin.js"

/** One catalog entry. The catalog never provides a target's requirements; `HandoffRequirementsMissing` reports them. */
export interface HandoffTarget {
  readonly name: string
  readonly agent: AnyAgent
  readonly pin?: AgentPin
}

export const target: {
  (pin?: AgentPin): (agent: AnyAgent) => HandoffTarget
  (agent: AnyAgent, pin?: AgentPin): HandoffTarget
} = Function.dual(
  (args) => args.length > 1 || typeof args[0] === "object",
  (agent: AnyAgent, pin?: AgentPin): HandoffTarget => ({
    name: agent.name,
    agent,
    ...(pin === undefined ? {} : { pin }),
  }),
)

export interface HandoffCatalogInterface {
  readonly resolve: (name: string) => HandoffTarget | undefined
  readonly targets: ReadonlyMap<string, HandoffTarget>
}

export class HandoffCatalog extends Context.Service<HandoffCatalog, HandoffCatalogInterface>()(
  "@batonfx/core/HandoffCatalog",
) {}

export const layerCatalog = (targets: ReadonlyArray<HandoffTarget>): Layer.Layer<HandoffCatalog> => {
  const byName = new Map(targets.map((entry) => [entry.name, entry] as const))
  return Layer.succeed(HandoffCatalog, {
    resolve: (name: string) => byName.get(name),
    targets: byName,
  })
}
