import type { Effect, Ref } from "effect"
import type { Prompt } from "effect/unstable/ai"
import type { Any as AnyAgent } from "../../agent/lifecycle/definition.js"
import type { Service } from "../tool-context.js"

/** @internal Parent state needed only while Generalist executes a tool. */
export interface InheritanceState {
  readonly history?: Effect.Effect<Prompt.Prompt>
  readonly agent?: AnyAgent
  readonly inheritedSandboxSnapshot?: Ref.Ref<string | undefined>
}

const bindings = new WeakMap<Service, InheritanceState>()

/** @internal Attach framework-owned parent state to an operational ToolContext. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal bindings are attached in direct ownership paths.
export const bindInheritance = <A extends Service>(context: A, state: InheritanceState): A => {
  bindings.set(context, state)
  return context
}

/** @internal Read framework-owned parent state for a live ToolContext. */
export const inheritanceFor = (context: Service): InheritanceState | undefined => bindings.get(context)

/** @internal Preserve framework-owned parent state when a host derives ToolContext metadata. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal bindings are copied in direct ownership paths.
export const copyInheritance = <A extends Service>(source: Service, target: A): A => {
  const state = inheritanceFor(source)
  return state === undefined ? target : bindInheritance(target, state)
}
