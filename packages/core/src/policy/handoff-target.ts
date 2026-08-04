import { Context, Layer } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { Agent } from "../agent/agent.js"
import type { AgentPin } from "../durable/pin.js"

export interface HandoffTarget<R = any> {
  readonly name: string
  readonly agent: Agent<Record<string, Tool.Any>, R>
  readonly pin?: AgentPin
}

export const target = <R>(agent: Agent<Record<string, Tool.Any>, R>, pin?: AgentPin): HandoffTarget<R> => ({
  name: agent.name,
  agent,
  ...(pin === undefined ? {} : { pin }),
})

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
