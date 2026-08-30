import { Context, Function, Layer, Schema } from "effect"
import type { Any as AnyAgent } from "../agent/closure.js"
import type { AgentPin } from "../durable/pin.js"

/** One catalog entry. The catalog never provides a target's requirements; `HandoffRequirementsMissing` reports them. */
export interface Target {
  readonly name: string
  readonly agent: AnyAgent
  readonly pin?: AgentPin
}

interface MutableTarget {
  name: string
  agent: AnyAgent
  pin?: AgentPin
}

export const target: {
  (pin?: AgentPin): (agent: AnyAgent) => Target
  (agent: AnyAgent, pin?: AgentPin): Target
} = Function.dual(
  (args) => args.length > 1 || Schema.is(Schema.Struct({ name: Schema.String }))(args[0]),
  (agent: AnyAgent, pin?: AgentPin): Target => {
    const entry: MutableTarget = { name: agent.name, agent }
    if (pin !== undefined) entry.pin = pin
    return entry
  },
)

export interface CatalogService {
  readonly resolve: (name: string) => Target | undefined
  readonly targets: ReadonlyMap<string, Target>
}

export class Catalog extends Context.Service<Catalog, CatalogService>()(
  "tenetkit/core/policy/handoff-target/Catalog",
) {}

export const layerCatalog = (targets: ReadonlyArray<Target>): Layer.Layer<Catalog> => {
  const byName = new Map(targets.map((entry) => [entry.name, entry] as const))
  return Layer.succeed(Catalog, {
    resolve: (name: string) => byName.get(name),
    targets: byName,
  })
}
