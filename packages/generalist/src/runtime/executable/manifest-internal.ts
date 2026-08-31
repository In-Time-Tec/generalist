import { validateRef as validateCoreRef } from "../../core/durable/manifest/executable-manifest.js"
import { Function, Schema } from "effect"
import type { ExecutionCheckpoint } from "../execution/state.js"
import { ExecutableManifest, ExecutableRef, PinnedExecutable } from "./manifest.js"

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
    return childEntry === undefined ? undefined : { executable: ref.executable, active: childEntry.pin }
  },
)
