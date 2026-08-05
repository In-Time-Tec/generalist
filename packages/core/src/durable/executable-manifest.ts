import { Effect, Schema } from "effect"
import { AgentManifest, make as makeManifest, type PinnedAgent } from "./agent-manifest.js"
import { ProgramManifest, make as makeProgramManifest, type PinnedProgram } from "./program-manifest.js"
import { AgentPin, ExecutablePin, makeCapability, makeExecutable, makeModel, ProgramPin } from "./pin.js"

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

/** @experimental One complete pinned Agent entry in an executable closure. */
export interface AgentEntry {
  readonly _tag: "Agent"
  readonly pin: AgentPin
  readonly manifest: AgentManifest
}

/** @experimental One complete pinned Agent Program entry in an executable closure. */
export interface ProgramEntry {
  readonly _tag: "Program"
  readonly pin: ProgramPin
  readonly manifest: ProgramManifest
}

/** @experimental One exact executable definition in a closed closure. */
export type ExecutableEntry = AgentEntry | ProgramEntry

/** @experimental Exact active executable within one closed closure. */
export const ExecutableTarget = Schema.Union([AgentPin, ProgramPin])
/** @experimental */
export type ExecutableTarget = typeof ExecutableTarget.Type

/** @experimental Complete closed executable Agent graph. */
export interface ExecutableManifest {
  readonly version: "2"
  readonly root: ExecutableTarget
  readonly entries: ReadonlyArray<ExecutableEntry>
}

/** @experimental Durable reference to one exact executable closure and active Agent. */
export const ExecutableRef = Schema.Struct({ executable: ExecutablePin, active: ExecutableTarget })
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

export interface ProgramEntryEncoded extends Omit<ProgramEntry, "pin" | "manifest"> {
  readonly pin: string
  readonly manifest: typeof ProgramManifest.Encoded
}

export type ExecutableEntryEncoded = AgentEntryEncoded | ProgramEntryEncoded

export interface ExecutableManifestEncoded extends Omit<ExecutableManifest, "root" | "entries"> {
  readonly root: string
  readonly entries: ReadonlyArray<ExecutableEntryEncoded>
}

export interface PinnedExecutableEncoded extends Omit<PinnedExecutable, "ref" | "manifest"> {
  readonly ref: typeof ExecutableRef.Encoded
  readonly manifest: ExecutableManifestEncoded
}

/** @experimental One complete pinned Agent entry in an executable closure. */
export const AgentEntry: Schema.Codec<AgentEntry, AgentEntryEncoded> = Schema.Struct({
  _tag: Schema.Literal("Agent"),
  pin: AgentPin,
  manifest: AgentManifest,
})

/** @experimental One complete pinned Agent Program entry in an executable closure. */
export const ProgramEntry: Schema.Codec<ProgramEntry, ProgramEntryEncoded> = Schema.Struct({
  _tag: Schema.Literal("Program"),
  pin: ProgramPin,
  manifest: ProgramManifest,
})

/** @experimental One exact executable definition in a closed closure. */
export const ExecutableEntry: Schema.Codec<ExecutableEntry, ExecutableEntryEncoded> = Schema.Union([
  AgentEntry,
  ProgramEntry,
])

/** @experimental Complete closed executable Agent graph. */
export const ExecutableManifest: Schema.Codec<ExecutableManifest, ExecutableManifestEncoded> = Schema.Struct({
  version: Schema.Literal("2"),
  root: ExecutableTarget,
  entries: Schema.Array(ExecutableEntry),
})

const validate = (pinned: PinnedExecutable): PinnedExecutable => {
  const { manifest, ref } = pinned
  const byPin = new Map(manifest.entries.map((entry) => [entry.pin, entry] as const))
  if (byPin.size !== manifest.entries.length) throw new TypeError("Duplicate executable pin")
  if (manifest.entries.some((entry, index, entries) => index > 0 && entries[index - 1]!.pin > entry.pin))
    throw new TypeError("Executable entries are not uniquely sorted")
  if (!byPin.has(manifest.root)) throw new TypeError(`Root executable is not present: ${manifest.root}`)
  const visiting = new Set<string>()
  const reachable = new Set<string>()
  const visit = (pin: ExecutableTarget): void => {
    if (visiting.has(pin)) throw new TypeError(`Cyclic executable closure at: ${pin}`)
    if (reachable.has(pin)) return
    const entry = byPin.get(pin)
    if (entry === undefined) throw new TypeError(`Dangling executable: ${pin}`)
    visiting.add(pin)
    const children =
      entry._tag === "Agent"
        ? [...entry.manifest.children, ...(entry.manifest.programAuthority?.agents ?? [])]
        : entry.manifest.capabilities.agents
    for (const child of children) {
      const target = byPin.get(child.agent)
      if (target?._tag !== "Agent") throw new TypeError(`Agent binding does not resolve to an Agent: ${child.agent}`)
      visit(child.agent)
    }
    visiting.delete(pin)
    reachable.add(pin)
  }
  visit(manifest.root)
  if (reachable.size !== manifest.entries.length)
    throw new TypeError("Executable closure contains a disconnected executable")
  if (!reachable.has(ref.active)) throw new TypeError(`Active executable is not reachable: ${ref.active}`)
  for (const entry of manifest.entries) {
    const pin = entry._tag === "Agent" ? makeManifest(entry.manifest).pin : makeProgramManifest(entry.manifest).pin
    if (pin !== entry.pin) throw new TypeError(`${entry._tag} manifest digest mismatch: ${entry.pin}`)
  }
  if (ref.executable !== makeExecutable(manifest)) throw new TypeError("Executable manifest digest mismatch")
  return pinned
}

/** @experimental Construct, validate, canonicalize, and pin a complete executable closure. */
export const make = (input: {
  readonly root: ExecutableTarget
  readonly active?: ExecutableTarget
  readonly entries: ReadonlyArray<
    ({ readonly _tag: "Agent" } & PinnedAgent) | ({ readonly _tag: "Program" } & PinnedProgram)
  >
}): PinnedExecutable => {
  const active = input.active ?? input.root
  const entries = input.entries
    .map(({ _tag, pin, manifest }) => ({ _tag, pin, manifest }) as ExecutableEntry)
    .toSorted((left, right) => compareText(left.pin, right.pin))
  const manifest = Schema.decodeUnknownSync(ExecutableManifest, { onExcessProperty: "error" })({
    version: "2",
    root: input.root,
    entries,
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
  return make({ root: agent.pin, entries: [{ _tag: "Agent", ...agent }] })
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
