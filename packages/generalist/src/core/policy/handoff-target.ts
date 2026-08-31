import { Context, Function, Layer, Schema } from "effect"
import type { LanguageModel } from "effect/unstable/ai"
import type { Any as AnyAgent } from "../agent/closure.js"
import type { AgentPin } from "../durable/pin.js"

/** One catalog entry. The catalog never provides a target's requirements; `HandoffRequirementsMissing` reports them. */
export interface Target {
  readonly name: string
  readonly agent: AnyAgent
  readonly pin?: AgentPin
  /** Model layer the specialist runs on after the handoff. Wins over the active registry selection. */
  readonly model?: Layer.Layer<LanguageModel.LanguageModel>
}

/** @experimental */
export interface TargetOptions {
  readonly pin?: AgentPin
  /** Model layer the specialist runs on after the handoff. Wins over the active registry selection. */
  readonly model?: Layer.Layer<LanguageModel.LanguageModel>
}

interface MutableTarget {
  name: string
  agent: AnyAgent
  pin?: AgentPin
  model?: Layer.Layer<LanguageModel.LanguageModel>
}

export const target: {
  (options?: TargetOptions): (agent: AnyAgent) => Target
  (agent: AnyAgent, options?: TargetOptions): Target
} = Function.dual(
  (args) => args.length > 1 || Schema.is(Schema.Struct({ name: Schema.String }))(args[0]),
  (agent: AnyAgent, options: TargetOptions = {}): Target => {
    const entry: MutableTarget = { name: agent.name, agent }
    if (options.pin !== undefined) entry.pin = options.pin
    if (options.model !== undefined) entry.model = options.model
    return entry
  },
)

export class Catalog extends Context.Service<
  Catalog,
  {
    readonly resolve: (name: string) => Target | undefined
    readonly targets: ReadonlyMap<string, Target>
  }
>()("generalist/core/policy/handoff-target/Catalog") {}

export const layerCatalog = (targets: ReadonlyArray<Target>): Layer.Layer<Catalog> => {
  const byName = new Map(targets.map((entry) => [entry.name, entry] as const))
  return Layer.succeed(Catalog, {
    resolve: (name: string) => byName.get(name),
    targets: byName,
  })
}
