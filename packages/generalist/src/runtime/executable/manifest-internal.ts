import type { AgentManifest, ProgramAuthority } from "../../core/durable/manifest/agent-manifest.js"
import { make as makeToolManifest } from "../../core/durable/manifest/tool-manifest.js"
import type { StaticRunOptions, StaticToolExecutable } from "./resolver.js"
import { validateRef as validateCoreRef } from "../../core/durable/manifest/executable-manifest.js"
import { Function, Schema } from "effect"
import type { ExecutionCheckpoint } from "../execution/state.js"
import { ExecutableManifest, ExecutableRef, PinnedExecutable } from "./manifest.js"
import type { ProgramManifest } from "../../core/durable/manifest/program-manifest.js"

type PinnedExecutableEncoded = typeof PinnedExecutable.Encoded

export const validateRef: {
  (manifest: ExecutableManifest): (ref: ExecutableRef) => void
  (ref: ExecutableRef, manifest: ExecutableManifest): void
} = Function.dual(2, (ref: ExecutableRef, manifest: ExecutableManifest): void => validateCoreRef(ref, manifest))

export const decodePinned = (input: PinnedExecutable | PinnedExecutableEncoded): PinnedExecutable => {
  const pinned = Schema.decodeSync(PinnedExecutable, { onExcessProperty: "error" })({
    ref: input.ref,
    manifest: input.manifest,
  })
  validateRef(pinned.ref, pinned.manifest)
  return pinned
}

export const equals: {
  (right: PinnedExecutable): (left: PinnedExecutable) => boolean
  (left: PinnedExecutable, right: PinnedExecutable): boolean
} = Function.dual(2, (left: PinnedExecutable, right: PinnedExecutable): boolean => {
  const verifiedLeft = decodePinned(left)
  const verifiedRight = decodePinned(right)
  return (
    JSON.stringify(Schema.encodeSync(PinnedExecutable)(verifiedLeft)) ===
    JSON.stringify(Schema.encodeSync(PinnedExecutable)(verifiedRight))
  )
})

export const checkpointRef: {
  (manifest: ExecutableManifest, checkpoint: ExecutionCheckpoint | undefined): (current: ExecutableRef) => ExecutableRef
  (current: ExecutableRef, manifest: ExecutableManifest, checkpoint: ExecutionCheckpoint | undefined): ExecutableRef
} = Function.dual(
  3,
  (
    current: ExecutableRef,
    manifest: ExecutableManifest,
    checkpoint: ExecutionCheckpoint | undefined,
  ): ExecutableRef => {
    decodePinned({ ref: current, manifest })
    const next = checkpoint === undefined || !("driverVersion" in checkpoint) ? undefined : checkpoint.executable
    if (next === undefined) return current
    if (next.executable !== current.executable) throw new TypeError("Checkpoint executable closure does not match Run")
    return decodePinned({ ref: { executable: next.executable, active: next.active }, manifest }).ref
  },
)

export const resolveChild: {
  (manifest: ExecutableManifest, selection: string): (ref: ExecutableRef) => ExecutableRef | undefined
  (ref: ExecutableRef, manifest: ExecutableManifest, selection: string): ExecutableRef | undefined
} = Function.dual(
  3,
  (ref: ExecutableRef, manifest: ExecutableManifest, selection: string): ExecutableRef | undefined => {
    const active = manifest.entries.find((entry) => entry.pin === ref.active)
    let child: string | undefined
    if (active?._tag === "Agent" && active.manifest.children.some((binding) => binding.selection === selection)) {
      child = manifest.profiles.find((profile) => profile.selection === selection)?.agent
    } else if (active?._tag === "Program") {
      child = active.manifest.capabilities.agents.find((binding) => binding.selection === selection)?.agent
    }
    const childEntry = manifest.entries.find((entry) => entry._tag === "Agent" && entry.pin === child)
    if (childEntry?._tag !== "Agent") return undefined
    if (
      active?._tag === "Agent" &&
      !childEntry.manifest.tools.every((tool) =>
        active.manifest.tools.some((parentTool) => parentTool.name === tool.name),
      )
    )
      return undefined
    return { executable: ref.executable, active: childEntry.pin }
  },
)

const matchesRunOptions = (manifest: AgentManifest, options: StaticRunOptions | undefined): boolean => {
  const expected = manifest.compaction
  const actual = options?.compaction
  return (
    (expected === undefined && actual === undefined) ||
    (expected !== undefined &&
      actual !== undefined &&
      expected.contextWindow === actual.contextWindow &&
      expected.reserveTokens === actual.reserveTokens)
  )
}

/** Verify resolver-owned static options against the persisted active Agent. */
export const matchesActiveRunOptions: {
  (manifest: ExecutableManifest, options: StaticRunOptions | undefined): (ref: ExecutableRef) => boolean
  (ref: ExecutableRef, manifest: ExecutableManifest, options: StaticRunOptions | undefined): boolean
} = Function.dual(
  3,
  (ref: ExecutableRef, manifest: ExecutableManifest, options: StaticRunOptions | undefined): boolean => {
    const active = manifest.entries.find((entry) => entry._tag === "Agent" && entry.pin === ref.active)
    return active?._tag === "Agent" && matchesRunOptions(active.manifest, options)
  },
)

export const validateStaticTool = ({
  entry,
  active,
}: {
  readonly entry: StaticToolExecutable
  readonly active: ExecutableManifest["entries"][number]
}): void => {
  const attested = makeToolManifest(entry.pinned.manifest)
  if (
    active._tag !== "Tool" ||
    entry.pinned.pin !== attested.pin ||
    attested.pin !== active.pin ||
    entry.tool.name !== active.manifest.name
  ) {
    throw new TypeError(`Live Tool does not match static executable reference: ${entry.executable.ref.active}`)
  }
}
const containsProgram = (authority: ProgramAuthority | undefined, program: ProgramManifest): boolean => {
  if (authority === undefined) return false
  if (program.sandbox !== authority.sandbox || program.input !== authority.input || program.output !== authority.output)
    return false
  if (new TextEncoder().encode(program.source.text).byteLength > authority.maxSourceBytes) return false
  for (const dimension of [
    "agentRuns",
    "concurrency",
    "toolCalls",
    "tokens",
    "wallClockMillis",
    "logBytes",
    "outputBytes",
  ] as const) {
    if (program.budget[dimension] > authority.budget[dimension]) return false
  }
  return (
    program.capabilities.tools.every((tool) =>
      authority.tools.some((allowed) => allowed.name === tool.name && allowed.pin === tool.pin),
    ) &&
    program.capabilities.steps.every((step) =>
      authority.steps.some((allowed) => allowed.name === step.name && allowed.pin === step.pin),
    ) &&
    program.capabilities.agents.every((agent) =>
      authority.agents.some(
        (allowed) =>
          allowed.selection === agent.selection && allowed.agent === agent.agent && allowed.input === agent.input,
      ),
    )
  )
}

export const containsChild: {
  (child: PinnedExecutable): (parent: PinnedExecutable) => boolean
  (parent: PinnedExecutable, child: PinnedExecutable): boolean
} = Function.dual(2, (parent: PinnedExecutable, child: PinnedExecutable): boolean => {
  const active = parent.manifest.entries.find((entry) => entry.pin === parent.ref.active)
  const target = child.manifest.entries.find((entry) => entry.pin === child.ref.active)
  if (active === undefined || target === undefined || active._tag === "Tool" || target._tag === "Tool") return false
  const selections = active._tag === "Agent" ? active.manifest.children : active.manifest.capabilities.agents
  const granted =
    target._tag === "Program"
      ? active._tag === "Agent" && containsProgram(active.manifest.programAuthority, target.manifest)
      : selections.some(
          ({ selection }) => resolveChild(parent.ref, parent.manifest, selection)?.active === child.ref.active,
        )
  return (
    granted &&
    child.manifest.entries.every(
      (entry) => entry.pin === target.pin || parent.manifest.entries.some((allowed) => allowed.pin === entry.pin),
    ) &&
    child.manifest.profiles.every((profile) =>
      parent.manifest.profiles.some(
        (allowed) => allowed.selection === profile.selection && allowed.agent === profile.agent,
      ),
    )
  )
})
