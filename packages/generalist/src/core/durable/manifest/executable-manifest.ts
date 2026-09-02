import { Effect, Function, Schema } from "effect"
import type { ParseOptions } from "effect/SchemaAST"
import { AgentManifest, make as makeManifest, type PinnedAgent } from "./agent-manifest.js"
import { ProgramManifest, make as makeProgramManifest, type PinnedProgram } from "./program-manifest.js"
import { makeExecutable } from "../pin-internal.js"
import { AgentPin, ExecutablePin, ProgramPin, makeCapability, makeModel } from "../pin.js"

const compareText = (left: string, right: string): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** One complete pinned Agent entry in an executable closure. */
export interface AgentEntry {
  readonly _tag: "Agent"
  readonly pin: AgentPin
  readonly manifest: AgentManifest
}

/** One complete pinned Agent Program entry in an executable closure. */
export interface ProgramEntry {
  readonly _tag: "Program"
  readonly pin: ProgramPin
  readonly manifest: ProgramManifest
}

/** One exact executable definition in a closed closure. */
export type ExecutableEntry = AgentEntry | ProgramEntry

/** One globally pinned child profile available by selection name. */
export interface ProfileBinding {
  readonly selection: string
  readonly agent: AgentPin
}

/** Exact active executable within one closed closure. */
export const ExecutableTarget = Schema.Union([AgentPin, ProgramPin])
export type ExecutableTarget = typeof ExecutableTarget.Type

/** Complete closed executable profile registry and entry closure. */
export interface ExecutableManifest {
  readonly version: "2"
  readonly root: ExecutableTarget
  readonly profiles: ReadonlyArray<ProfileBinding>
  readonly entries: ReadonlyArray<ExecutableEntry>
}

/** Durable reference to one exact executable closure and active Agent. */
export const ExecutableRef = Schema.Struct({ executable: ExecutablePin, active: ExecutableTarget })
export type ExecutableRef = typeof ExecutableRef.Type

/** Executable closure paired with its constructor-owned reference. */
export interface PinnedExecutable {
  readonly ref: ExecutableRef
  readonly manifest: ExecutableManifest
}

interface AgentEntryEncoded extends Omit<AgentEntry, "pin" | "manifest"> {
  readonly pin: string
  readonly manifest: typeof AgentManifest.Encoded
}

interface ProgramEntryEncoded extends Omit<ProgramEntry, "pin" | "manifest"> {
  readonly pin: string
  readonly manifest: typeof ProgramManifest.Encoded
}

type ExecutableEntryEncoded = AgentEntryEncoded | ProgramEntryEncoded

interface ProfileBindingEncoded extends Omit<ProfileBinding, "agent"> {
  readonly agent: string
}

/** Encoded executable manifest. */
export interface ExecutableManifestEncoded extends Omit<ExecutableManifest, "root" | "profiles" | "entries"> {
  readonly root: string
  readonly profiles: ReadonlyArray<ProfileBindingEncoded>
  readonly entries: ReadonlyArray<ExecutableEntryEncoded>
}

interface PinnedExecutableEncoded extends Omit<PinnedExecutable, "ref" | "manifest"> {
  readonly ref: typeof ExecutableRef.Encoded
  readonly manifest: ExecutableManifestEncoded
}

/** One complete pinned Agent entry in an executable closure. */
export const AgentEntry: Schema.Codec<AgentEntry, AgentEntryEncoded> = Schema.TaggedStruct("Agent", {
  pin: AgentPin,
  manifest: AgentManifest,
})

/** One complete pinned Agent Program entry in an executable closure. */
export const ProgramEntry: Schema.Codec<ProgramEntry, ProgramEntryEncoded> = Schema.TaggedStruct("Program", {
  pin: ProgramPin,
  manifest: ProgramManifest,
})

/** One exact executable definition in a closed closure. */
export const ExecutableEntry: Schema.Codec<ExecutableEntry, ExecutableEntryEncoded> = Schema.Union([
  AgentEntry,
  ProgramEntry,
])

/** One globally pinned child profile available by selection name. */
export const ProfileBinding: Schema.Codec<ProfileBinding, ProfileBindingEncoded> = Schema.Struct({
  selection: Schema.String,
  agent: AgentPin,
})

/** Complete closed executable profile registry and entry closure. */
export const ExecutableManifest: Schema.Codec<ExecutableManifest, ExecutableManifestEncoded> = Schema.Struct({
  version: Schema.Literal("2"),
  root: ExecutableTarget,
  profiles: Schema.Array(ProfileBinding),
  entries: Schema.Array(ExecutableEntry),
})

const validateProfiles = (
  manifest: ExecutableManifest,
  byPin: ReadonlyMap<ExecutableTarget, ExecutableEntry>,
): void => {
  const profiles = new Map(manifest.profiles.map((profile) => [profile.selection, profile.agent] as const))
  if (profiles.size !== manifest.profiles.length) throw new TypeError("Duplicate executable profile selection")
  if (manifest.profiles.some((profile, index, values) => index > 0 && values[index - 1]!.selection > profile.selection))
    throw new TypeError("Executable profiles are not uniquely sorted")
  const declaredSelections = new Set<string>()
  for (const entry of manifest.entries) {
    if (entry._tag !== "Agent") continue
    for (const child of entry.manifest.children) {
      declaredSelections.add(child.selection)
      if (!profiles.has(child.selection))
        throw new TypeError(`Child selection has no executable profile: ${child.selection}`)
    }
  }
  for (const profile of manifest.profiles) {
    if (!declaredSelections.has(profile.selection))
      throw new TypeError(`Executable profile is not declared by an Agent: ${profile.selection}`)
    if (byPin.get(profile.agent)?._tag !== "Agent")
      throw new TypeError(`Executable profile does not resolve to an Agent: ${profile.selection}`)
  }
}

const validate = (pinned: PinnedExecutable): PinnedExecutable => {
  const { manifest, ref } = pinned
  const byPin = new Map(manifest.entries.map((entry) => [entry.pin, entry] as const))
  if (byPin.size !== manifest.entries.length) throw new TypeError("Duplicate executable pin")
  if (manifest.entries.some((entry, index, entries) => index > 0 && entries[index - 1]!.pin > entry.pin))
    throw new TypeError("Executable entries are not uniquely sorted")
  if (!byPin.has(manifest.root)) throw new TypeError(`Root executable is not present: ${manifest.root}`)
  validateProfiles(manifest, byPin)
  const visiting = new Set<string>()
  const reachable = new Set<string>()
  const visit = (pin: ExecutableTarget): void => {
    if (visiting.has(pin)) throw new TypeError(`Cyclic executable closure at: ${pin}`)
    if (reachable.has(pin)) return
    const entry = byPin.get(pin)
    if (entry === undefined) throw new TypeError(`Dangling executable: ${pin}`)
    visiting.add(pin)
    const children =
      entry._tag === "Agent" ? (entry.manifest.programAuthority?.agents ?? []) : entry.manifest.capabilities.agents
    for (const child of children) {
      const target = byPin.get(child.agent)
      if (target?._tag !== "Agent") throw new TypeError(`Agent reference does not resolve to an Agent: ${child.agent}`)
      visit(child.agent)
    }
    visiting.delete(pin)
    reachable.add(pin)
  }
  visit(manifest.root)
  for (const profile of manifest.profiles) visit(profile.agent)
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

/** Construct, validate, canonicalize, and pin a complete executable closure. */
export const make = (input: {
  readonly root: ExecutableTarget
  readonly active?: ExecutableTarget
  readonly profiles?: ReadonlyArray<ProfileBinding>
  readonly entries: ReadonlyArray<
    ({ readonly _tag: "Agent" } & PinnedAgent) | ({ readonly _tag: "Program" } & PinnedProgram)
  >
}): PinnedExecutable => {
  const active = input.active ?? input.root
  const entries: Array<ExecutableEntry> = input.entries.map((entry) =>
    entry._tag === "Agent"
      ? { _tag: "Agent", pin: entry.pin, manifest: entry.manifest }
      : { _tag: "Program", pin: entry.pin, manifest: entry.manifest },
  )
  entries.sort((left, right) => compareText(left.pin, right.pin))
  const profiles = [...(input.profiles ?? [])].toSorted((left, right) => compareText(left.selection, right.selection))
  const manifest = Schema.decodeSync(ExecutableManifest, { onExcessProperty: "error" })({
    version: "2",
    root: input.root,
    profiles,
    entries,
  })
  return validate({ manifest, ref: { executable: makeExecutable(manifest), active } })
}

/** Canonical executable fixture for tests and non-running documentation examples. */
export const makeTest: {
  (revision?: string): (name: string) => PinnedExecutable
  (name: string, revision?: string): PinnedExecutable
} = Function.dual(2, (name: string, revision: string = "1"): PinnedExecutable => {
  const agent = makeManifest({
    name,
    model: makeModel({ fixture: name, revision }),
    tools: [],
    skills: [],
    services: [],
    policy: { _tag: "Pinned", pin: makeCapability({ fixture: name, policy: revision }) },
    toolScheduling: { maxConcurrency: 1, parallelSafe: [] },
    budget: {},
    children: [],
  })
  return make({ root: agent.pin, profiles: [], entries: [{ _tag: "Agent", ...agent }] })
})

/** Verify that a durable reference is exactly owned by a closure. */
export const validateRef: {
  (manifest: ExecutableManifest): (ref: ExecutableRef) => void
  (ref: ExecutableRef, manifest: ExecutableManifest): void
} = Function.dual(2, (ref: ExecutableRef, manifest: ExecutableManifest): void => {
  validate({ ref, manifest })
})

const PinnedExecutableSchema: Schema.Codec<PinnedExecutable, PinnedExecutableEncoded> = Schema.Struct({
  ref: ExecutableRef,
  manifest: ExecutableManifest,
})

/** Encode one constructor-validated executable authority. */
export const encode: {
  (input: PinnedExecutable, options?: ParseOptions): Effect.Effect<PinnedExecutableEncoded, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: PinnedExecutable) => Effect.Effect<PinnedExecutableEncoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !Schema.is(PinnedExecutableSchema)(args[0])),
  (
    input: PinnedExecutable,
    options?: ParseOptions,
  ): Effect.Effect<PinnedExecutableEncoded, Schema.SchemaError, never> =>
    Schema.encodeEffect(PinnedExecutableSchema)(input, options),
)

/** Decode and verify one complete pinned executable authority. */
const decodePinned = Schema.decodeUnknownEffect(PinnedExecutableSchema, { onExcessProperty: "error" })
export const decode = Function.flow(
  decodePinned,
  Effect.flatMap((pinned) => Effect.try(() => validate(pinned))),
)
