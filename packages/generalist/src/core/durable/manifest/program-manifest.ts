import { Schema } from "effect"
import { NamedCapability } from "../capability.js"
import { AgentPin, CapabilityPin, ProgramPin, makeProgram } from "../pin.js"

const compareText = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const uniqueSorted = <A>(
  values: ReadonlyArray<A>,
  orderOf: (value: A) => string,
  identityOf: (value: A) => string,
  labels: readonly [string, string],
): Array<A> => {
  const sorted = [...values].toSorted((left, right) => compareText(orderOf(left), orderOf(right)))
  const orders = new Set<string>()
  const identities = new Set<string>()
  for (const value of sorted) {
    const order = orderOf(value)
    const identity = identityOf(value)
    if (orders.has(order)) throw new TypeError(`Duplicate ${labels[0]}: ${order}`)
    if (identities.has(identity)) throw new TypeError(`Duplicate ${labels[1]}: ${identity}`)
    orders.add(order)
    identities.add(identity)
  }
  return sorted
}

/** Sandboxed source pinned as part of one Agent Program. */
export const ProgramSource = Schema.Struct({
  language: Schema.Literal("javascript"),
  text: Schema.String,
})
export type ProgramSource = typeof ProgramSource.Type

/** Exact Agent and input schema callable by one Program selection. */
export const ProgramAgentCapability = Schema.Struct({
  selection: Schema.String,
  agent: AgentPin,
  input: CapabilityPin,
})
export type ProgramAgentCapability = typeof ProgramAgentCapability.Type

/** Bounded resources available to one Agent Program. */
export const ProgramBudget = Schema.Struct({
  agentRuns: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  concurrency: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  toolCalls: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  tokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  wallClockMillis: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  logBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  outputBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type ProgramBudget = typeof ProgramBudget.Type

/** Exact host capabilities visible inside one Agent Program sandbox. */
export const ProgramCapabilityManifest = Schema.Struct({
  tools: Schema.Array(NamedCapability),
  agents: Schema.Array(ProgramAgentCapability),
  steps: Schema.Array(NamedCapability),
})
export type ProgramCapabilityManifest = typeof ProgramCapabilityManifest.Type

/** Closed reconstructable identity contract for one Agent Program. */
export const ProgramManifest = Schema.Struct({
  version: Schema.Literal("1"),
  name: Schema.String,
  source: ProgramSource,
  sandbox: CapabilityPin,
  input: CapabilityPin,
  output: CapabilityPin,
  capabilities: ProgramCapabilityManifest,
  budget: ProgramBudget,
})
export type ProgramManifest = typeof ProgramManifest.Type

/** An Agent Program manifest paired with its constructor-owned digest. */
export interface PinnedProgram {
  readonly pin: ProgramPin
  readonly manifest: ProgramManifest
}

/** Construct and pin one canonical Agent Program manifest. */
export const make = (input: Omit<ProgramManifest, "version"> & { readonly version?: "1" }): PinnedProgram => {
  const manifest = Schema.decodeSync(ProgramManifest, { onExcessProperty: "error" })({
    ...input,
    version: "1",
    capabilities: {
      tools: uniqueSorted(
        input.capabilities.tools,
        (value) => value.name,
        (value) => value.pin,
        ["tool name", "tool pin"],
      ),
      agents: uniqueSorted(
        input.capabilities.agents,
        (value) => value.selection,
        (value) => value.agent,
        ["Agent selection", "Agent pin"],
      ),
      steps: uniqueSorted(
        input.capabilities.steps,
        (value) => value.name,
        (value) => value.pin,
        ["step name", "step pin"],
      ),
    },
  })
  return { manifest, pin: makeProgram(manifest) }
}
