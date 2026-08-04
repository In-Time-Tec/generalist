import { Effect, Schema } from "effect"
import { AgentManifest, make as makeManifest, type PinnedAgent } from "./agent-manifest.js"
import { AgentPin, ExecutablePin, makeCapability, makeExecutable, makeModel } from "./pin.js"

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

/** @experimental One complete pinned Agent entry in an executable closure. */
export interface AgentEntry {
  readonly pin: AgentPin
  readonly manifest: AgentManifest
}

/** @experimental Complete closed executable Agent graph. */
export interface ExecutableManifest {
  readonly version: "1"
  readonly root: AgentPin
  readonly agents: ReadonlyArray<AgentEntry>
}

/** @experimental Durable reference to one exact executable closure and active Agent. */
export const ExecutableRef = Schema.Struct({ executable: ExecutablePin, active: AgentPin })
/** @experimental */
export type ExecutableRef = typeof ExecutableRef.Type

/** @experimental Executable closure paired with its constructor-owned reference. */
export interface PinnedExecutable {
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
}

export interface AgentEntryEncoded extends Omit<AgentEntry, "pin" | "manifest"> {
  readonly pin: string
  readonly manifest: typeof AgentManifest.Encoded
}

export interface ExecutableManifestEncoded extends Omit<ExecutableManifest, "root" | "agents"> {
  readonly root: string
  readonly agents: ReadonlyArray<AgentEntryEncoded>
}

export interface PinnedExecutableEncoded extends Omit<PinnedExecutable, "ref" | "manifest"> {
  readonly ref: typeof ExecutableRef.Encoded
  readonly manifest: ExecutableManifestEncoded
}

/** @experimental One complete pinned Agent entry in an executable closure. */
export const AgentEntry: Schema.Codec<AgentEntry, AgentEntryEncoded> = Schema.Struct({
  pin: AgentPin,
  manifest: AgentManifest,
})

/** @experimental Complete closed executable Agent graph. */
export const ExecutableManifest: Schema.Codec<ExecutableManifest, ExecutableManifestEncoded> = Schema.Struct({
  version: Schema.Literal("1"),
  root: AgentPin,
  agents: Schema.Array(AgentEntry),
})

const validate = (pinned: PinnedExecutable): PinnedExecutable => {
  const { manifest, ref } = pinned
  const byPin = new Map(manifest.agents.map((entry) => [entry.pin, entry.manifest] as const))
  if (byPin.size !== manifest.agents.length) throw new TypeError("Duplicate Agent pin")
  if (manifest.agents.some((entry, index, agents) => index > 0 && agents[index - 1]!.pin > entry.pin)) {
    throw new TypeError("Agent entries are not uniquely sorted")
  }
  if (!byPin.has(manifest.root)) throw new TypeError(`Root Agent is not present: ${manifest.root}`)
  const visiting = new Set<string>()
  const reachable = new Set<string>()
  const visit = (pin: AgentPin): void => {
    if (visiting.has(pin)) throw new TypeError(`Cyclic Agent closure at: ${pin}`)
    if (reachable.has(pin)) return
    const agent = byPin.get(pin)
    if (agent === undefined) throw new TypeError(`Dangling child Agent: ${pin}`)
    visiting.add(pin)
    for (const child of agent.children) visit(child.agent)
    visiting.delete(pin)
    reachable.add(pin)
  }
  visit(manifest.root)
  if (reachable.size !== manifest.agents.length) throw new TypeError("Executable closure contains a disconnected Agent")
  if (!reachable.has(ref.active)) throw new TypeError(`Active Agent is not reachable: ${ref.active}`)
  for (const entry of manifest.agents) {
    if (makeManifest(entry.manifest).pin !== entry.pin) {
      throw new TypeError(`Agent manifest digest mismatch: ${entry.pin}`)
    }
  }
  if (ref.executable !== makeExecutable(manifest)) throw new TypeError("Executable manifest digest mismatch")
  return pinned
}

/** @experimental Construct, validate, canonicalize, and pin a complete executable closure. */
export const make = (input: {
  readonly root: AgentPin
  readonly active?: AgentPin
  readonly agents: ReadonlyArray<PinnedAgent>
}): PinnedExecutable => {
  const active = input.active ?? input.root
  const agents = input.agents
    .map(({ pin, manifest }) => ({ pin, manifest }))
    .toSorted((left, right) => compareText(left.pin, right.pin))
  const manifest = Schema.decodeUnknownSync(ExecutableManifest, { onExcessProperty: "error" })({
    version: "1",
    root: input.root,
    agents,
  })
  return validate({ manifest, ref: { executable: makeExecutable(manifest), active } })
}

/** @experimental Canonical executable fixture for tests and non-running documentation examples. */
export const makeTest = (name: string, revision = "1"): PinnedExecutable => {
  const agent = makeManifest({
    name,
    model: makeModel({ fixture: name, revision }),
    tools: [],
    skills: [],
    services: [],
    policy: { _tag: "Pinned", pin: makeCapability({ fixture: name, policy: revision }) },
    budget: {},
    children: [],
  })
  return make({ root: agent.pin, agents: [agent] })
}

/** @experimental Verify that a durable reference is exactly owned by a closure. */
export const validateRef = (ref: ExecutableRef, manifest: ExecutableManifest): void => {
  validate({ ref, manifest })
}

const PinnedExecutableSchema: Schema.Codec<PinnedExecutable, PinnedExecutableEncoded> = Schema.Struct({
  ref: ExecutableRef,
  manifest: ExecutableManifest,
})

/** @experimental Encode one constructor-validated executable authority. */
export const encode = Schema.encodeEffect(PinnedExecutableSchema)

/** @experimental Decode and verify one complete pinned executable authority. */
export const decode = (input: unknown) =>
  Schema.decodeUnknownEffect(PinnedExecutableSchema, { onExcessProperty: "error" })(input).pipe(
    Effect.flatMap((pinned) => Effect.try(() => validate(pinned))),
  )
