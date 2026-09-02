import { Function, Schema } from "effect"
import type { Tool } from "effect/unstable/ai"
import type { Agent, ToolSchedulingPolicy } from "../../agent/service.js"
import { validationFailure as toolSchedulingFailure } from "../../agent/tools/scheduler.js"
import { BudgetLimits } from "../run-budget.js"
import { makeAgent } from "../pin-internal.js"
import { AgentPin, CapabilityPin, ModelPin } from "../pin.js"
import { digest } from "../canonical-json.js"
import { NamedCapability, PinnedContent, namedCapabilityWith, type NamedCapabilityEncoded } from "../capability.js"
import { ProgramBudget, type ProgramAgentCapability } from "./program-manifest.js"

const compareText = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export { NamedCapability, PinnedContent }

/** One child profile name this Agent may select from its executable registry. */
export interface ChildSelection {
  readonly selection: string
}

export interface PortablePolicy {
  readonly _tag: "Forever" | "Recurs" | "UntilToolCall" | "Both"
  readonly count?: number
  readonly name?: string
  readonly first?: PortablePolicy
  readonly second?: PortablePolicy
}

/** Exact identity of either a portable policy or an opaque policy capability. */
export type PolicyIdentity =
  | { readonly _tag: "Portable"; readonly policy: PortablePolicy }
  | { readonly _tag: "Pinned"; readonly pin: CapabilityPin }

/** Exact identity and token limits of one reconstructable compaction capability. */
export interface CompactionIdentity {
  readonly service: CapabilityPin
  readonly summaryModel: ModelPin
  readonly contextWindow: number
  readonly reserveTokens: number
  readonly keepRecentTokens: number
  readonly strategyIdentity: string
  readonly summaryPromptIdentity: string
}

/** Maximum Program authority an Agent may narrow for one dynamic child. */
export interface ProgramAuthority {
  readonly sandbox: CapabilityPin
  readonly input: CapabilityPin
  readonly output: CapabilityPin
  readonly maxSourceBytes: number
  readonly tools: ReadonlyArray<NamedCapability>
  readonly agents: ReadonlyArray<ProgramAgentCapability>
  readonly steps: ReadonlyArray<NamedCapability>
  readonly budget: ProgramBudget
}

/** Closed, reconstructable identity contract for one Agent. */
export interface AgentManifest {
  readonly version: "2"
  readonly name: string
  readonly instructions?: string
  readonly supplemental?: string
  readonly model: ModelPin
  readonly tools: ReadonlyArray<NamedCapability>
  readonly skills: ReadonlyArray<NamedCapability>
  readonly services: ReadonlyArray<NamedCapability>
  readonly policy: PolicyIdentity
  readonly toolScheduling: ToolSchedulingPolicy
  readonly compaction?: CompactionIdentity
  readonly programAuthority?: ProgramAuthority
  readonly budget: BudgetLimits
  readonly children: ReadonlyArray<ChildSelection>
}

type PolicyIdentityEncoded =
  | { readonly _tag: "Portable"; readonly policy: PortablePolicy }
  | { readonly _tag: "Pinned"; readonly pin: string }

interface CompactionIdentityEncoded extends Omit<CompactionIdentity, "service" | "summaryModel"> {
  readonly service: string
  readonly summaryModel: string
}

interface AgentManifestEncoded
  extends Omit<
    AgentManifest,
    "model" | "tools" | "skills" | "services" | "policy" | "compaction" | "programAuthority" | "children"
  > {
  readonly model: string
  readonly tools: ReadonlyArray<NamedCapabilityEncoded>
  readonly skills: ReadonlyArray<NamedCapabilityEncoded>
  readonly services: ReadonlyArray<NamedCapabilityEncoded>
  readonly policy: PolicyIdentityEncoded
  readonly compaction?: CompactionIdentityEncoded
  readonly programAuthority?: {
    readonly sandbox: string
    readonly input: string
    readonly output: string
    readonly maxSourceBytes: number
    readonly tools: ReadonlyArray<NamedCapabilityEncoded>
    readonly agents: ReadonlyArray<{ readonly selection: string; readonly agent: string; readonly input: string }>
    readonly steps: ReadonlyArray<NamedCapabilityEncoded>
    readonly budget: typeof ProgramBudget.Encoded
  }
  readonly children: ReadonlyArray<ChildSelection>
}

/** One child profile name this Agent may select from its executable registry. */
export const ChildSelection: Schema.Codec<ChildSelection, ChildSelection> = Schema.Struct({
  selection: Schema.String,
})

/** Closed portable turn-policy constructor data. */
export const PortablePolicy: Schema.Codec<PortablePolicy, PortablePolicy> = Schema.suspend(() =>
  Schema.Union([
    Schema.TaggedStruct("Forever", {}),
    Schema.TaggedStruct("Recurs", { count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
    Schema.TaggedStruct("UntilToolCall", { name: Schema.String }),
    Schema.TaggedStruct("Both", { first: PortablePolicy, second: PortablePolicy }),
  ]),
)

/** Exact identity of either a portable policy or an opaque policy capability. */
export const PolicyIdentity: Schema.Codec<PolicyIdentity, PolicyIdentityEncoded> = Schema.Union([
  Schema.TaggedStruct("Portable", { policy: PortablePolicy }),
  Schema.TaggedStruct("Pinned", { pin: CapabilityPin }),
])
const ToolSchedulingPolicySchema = Schema.Struct({
  maxConcurrency: Schema.Int.check(Schema.isGreaterThan(0)),
  parallelSafe: Schema.Array(Schema.String),
})
/** Exact identity and token limits of one reconstructable compaction capability. */
export const CompactionIdentity: Schema.Codec<CompactionIdentity, CompactionIdentityEncoded> = Schema.Struct({
  service: CapabilityPin,
  summaryModel: ModelPin,
  contextWindow: Schema.Int.check(Schema.isGreaterThan(0)),
  reserveTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  keepRecentTokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  strategyIdentity: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  summaryPromptIdentity: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
})
const ProgramSelectionId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const ProgramAuthorityNamedCapability = namedCapabilityWith(ProgramSelectionId)
const ProgramAuthorityAgentCapability = Schema.Struct({
  selection: ProgramSelectionId,
  agent: AgentPin,
  input: CapabilityPin,
})

/** Maximum Program authority an Agent may narrow for one dynamic child. */
export const ProgramAuthority = Schema.Struct({
  sandbox: CapabilityPin,
  input: CapabilityPin,
  output: CapabilityPin,
  maxSourceBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  tools: Schema.Array(ProgramAuthorityNamedCapability).pipe(Schema.check(Schema.isMaxLength(64))),
  agents: Schema.Array(ProgramAuthorityAgentCapability).pipe(Schema.check(Schema.isMaxLength(64))),
  steps: Schema.Array(ProgramAuthorityNamedCapability).pipe(Schema.check(Schema.isMaxLength(64))),
  budget: ProgramBudget,
})
/** Closed, reconstructable identity contract for one Agent. */
export const AgentManifest: Schema.Codec<AgentManifest, AgentManifestEncoded> = Schema.Struct({
  version: Schema.Literal("2"),
  name: Schema.String,
  instructions: Schema.optionalKey(Schema.String),
  supplemental: Schema.optionalKey(Schema.String),
  model: ModelPin,
  tools: Schema.Array(NamedCapability),
  skills: Schema.Array(NamedCapability),
  services: Schema.Array(NamedCapability),
  policy: PolicyIdentity,
  toolScheduling: ToolSchedulingPolicySchema,
  compaction: Schema.optionalKey(CompactionIdentity),
  programAuthority: Schema.optionalKey(ProgramAuthority),
  budget: BudgetLimits,
  children: Schema.Array(ChildSelection),
})
/** An Agent manifest paired with its constructor-owned digest. */
export interface PinnedAgent {
  readonly pin: AgentPin
  readonly manifest: AgentManifest
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

const capabilityOrder = (value: NamedCapability): string => value.name
const capabilityIdentity = (value: NamedCapability): string => value.pin
const childOrder = (value: ChildSelection): string => value.selection

/** Construct and pin a canonical closed Agent manifest. */
export const make = (input: Omit<AgentManifest, "version"> & { readonly version?: "2" }): PinnedAgent => {
  const invalidToolScheduling = toolSchedulingFailure(
    input.toolScheduling,
    input.tools.map(({ name }) => name),
  )
  if (invalidToolScheduling !== undefined) throw new TypeError(invalidToolScheduling)
  const version = "2" as const
  const canonical = {
    ...input,
    version,
    toolScheduling: {
      ...input.toolScheduling,
      parallelSafe: [...input.toolScheduling.parallelSafe].toSorted(compareText),
    },
    tools: uniqueSorted(input.tools, capabilityOrder, capabilityIdentity, ["tool name", "tool pin"]),
    skills: uniqueSorted(input.skills, capabilityOrder, capabilityIdentity, ["skill name", "skill pin"]),
    services: uniqueSorted(input.services, capabilityOrder, capabilityIdentity, ["service name", "service pin"]),
    children: uniqueSorted(input.children, childOrder, childOrder, ["child selection", "child selection"]),
  }
  const manifestInput =
    input.programAuthority === undefined
      ? canonical
      : {
          ...canonical,
          programAuthority: {
            sandbox: input.programAuthority.sandbox,
            input: input.programAuthority.input,
            output: input.programAuthority.output,
            maxSourceBytes: input.programAuthority.maxSourceBytes,
            budget: input.programAuthority.budget,
            tools: uniqueSorted(input.programAuthority.tools, capabilityOrder, capabilityIdentity, [
              "Program tool name",
              "Program tool pin",
            ]),
            agents: uniqueSorted(
              input.programAuthority.agents,
              (value) => value.selection,
              (value) => value.agent,
              ["Program Agent selection", "Program Agent pin"],
            ),
            steps: uniqueSorted(input.programAuthority.steps, capabilityOrder, capabilityIdentity, [
              "Program step name",
              "Program step pin",
            ]),
          },
        }
  const manifest = Schema.decodeSync(AgentManifest, { onExcessProperty: "error" })(manifestInput)
  return { manifest, pin: makeAgent(manifest) }
}

/** Build an exact manifest for a live Agent using explicitly supplied opaque dependencies. */
export const fromLiveAgent: {
  <Tools extends Record<string, Tool.Any>, R, PolicyServices, AuthorizationServices>(identity: {
    readonly model: ModelPin
    readonly tools: ReadonlyArray<NamedCapability>
    readonly skills: ReadonlyArray<NamedCapability>
    readonly services: ReadonlyArray<NamedCapability>
    readonly policy: PolicyIdentity
    readonly compaction?: CompactionIdentity
    readonly programAuthority?: ProgramAuthority
    readonly budget: BudgetLimits
    readonly children: ReadonlyArray<ChildSelection>
  }): (agent: Agent<Tools, R, PolicyServices, AuthorizationServices, Schema.Top, Schema.Top>) => PinnedAgent
  <Tools extends Record<string, Tool.Any>, R, PolicyServices, AuthorizationServices>(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, Schema.Top, Schema.Top>,
    identity: {
      readonly model: ModelPin
      readonly tools: ReadonlyArray<NamedCapability>
      readonly skills: ReadonlyArray<NamedCapability>
      readonly services: ReadonlyArray<NamedCapability>
      readonly policy: PolicyIdentity
      readonly compaction?: CompactionIdentity
      readonly programAuthority?: ProgramAuthority
      readonly budget: BudgetLimits
      readonly children: ReadonlyArray<ChildSelection>
    },
  ): PinnedAgent
} = Function.dual(
  2,
  <Tools extends Record<string, Tool.Any>, R, PolicyServices, AuthorizationServices>(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, Schema.Top, Schema.Top>,
    identity: {
      readonly model: ModelPin
      readonly tools: ReadonlyArray<NamedCapability>
      readonly skills: ReadonlyArray<NamedCapability>
      readonly services: ReadonlyArray<NamedCapability>
      readonly policy: PolicyIdentity
      readonly compaction?: CompactionIdentity
      readonly programAuthority?: ProgramAuthority
      readonly budget: BudgetLimits
      readonly children: ReadonlyArray<ChildSelection>
    },
  ): PinnedAgent => {
    const actualTools = Object.keys(agent.toolkit.tools).toSorted()
    const pinnedTools = identity.tools.map(({ name }) => name).toSorted()
    if (actualTools.length !== pinnedTools.length || actualTools.some((name, index) => name !== pinnedTools[index])) {
      throw new TypeError("Tool pins must exactly match the live Agent toolkit")
    }
    if (identity.policy._tag === "Portable") {
      if (agent.policy.snapshot === undefined || digest(agent.policy.snapshot) !== digest(identity.policy.policy)) {
        throw new TypeError("Portable policy must exactly match the live Agent policy snapshot")
      }
    } else if (agent.policy.snapshot !== undefined) {
      throw new TypeError("Pinned policy identity is only valid for an opaque live Agent policy")
    }
    if (digest(agent.budget ?? {}) !== digest(identity.budget)) {
      throw new TypeError("Budget must exactly match the live Agent budget")
    }
    const manifestInput = {
      name: agent.name,
      ...identity,
      toolScheduling: agent.toolScheduling,
    }
    if (agent.instructions !== undefined) Object.assign(manifestInput, { instructions: agent.instructions })
    if (agent.supplemental !== undefined) Object.assign(manifestInput, { supplemental: agent.supplemental })
    return make(manifestInput)
  },
)
