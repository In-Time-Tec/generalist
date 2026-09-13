import type { Descriptor } from "../../../capability/state.js"

interface CapabilityOwner {
  readonly name: string
}

const bindings = new WeakMap<CapabilityOwner, ReadonlyArray<Descriptor>>()

/** @internal Return capabilities attached by framework-owned child inheritance. */
export const capabilitiesFor = (agent: CapabilityOwner): ReadonlyArray<Descriptor> | undefined => bindings.get(agent)

/** @internal Bind framework-owned child capabilities without widening Agent's public shape. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal bindings are updated in direct ownership paths.
export const bindCapabilities = <A extends CapabilityOwner>(
  agent: A,
  capabilities: ReadonlyArray<Descriptor> | undefined,
): A => {
  if (capabilities !== undefined) bindings.set(agent, capabilities)
  return agent
}

/** @internal Preserve framework-owned child capabilities when an Agent is cloned. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal bindings are copied in direct ownership paths.
export const copyCapabilities = <A extends CapabilityOwner>(source: CapabilityOwner, target: A): A =>
  bindCapabilities(target, capabilitiesFor(source))
