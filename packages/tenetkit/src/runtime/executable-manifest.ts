import { ExecutableManifest as CoreExecutableManifest } from "tenetkit"
import { Effect, Function, Schema } from "effect"
import type { ExecutionCheckpoint } from "./execution-state.js"

/** @experimental Complete closed executable profile registry and entry closure. */
export interface ExecutableManifest extends CoreExecutableManifest.ExecutableManifest {}
/** @experimental One globally pinned child profile available by selection name. */
export type ProfileBinding = CoreExecutableManifest.ProfileBinding
type AgentEntry = Extract<ExecutableManifest["entries"][number], { readonly _tag: "Agent" }>
type ProgramEntry = Extract<ExecutableManifest["entries"][number], { readonly _tag: "Program" }>
/** @experimental Encoded complete closed executable Agent graph. */
export type ExecutableManifestEncoded = typeof CoreExecutableManifest.ExecutableManifest.Encoded

/** @experimental Complete closed executable Agent graph. */
export const ExecutableManifest: Schema.Codec<ExecutableManifest, ExecutableManifestEncoded> =
  CoreExecutableManifest.ExecutableManifest as Schema.Codec<ExecutableManifest, ExecutableManifestEncoded>

/** @experimental Durable reference to one exact executable closure and active Agent. */
export const ExecutableRef: typeof CoreExecutableManifest.ExecutableRef = CoreExecutableManifest.ExecutableRef
/** @experimental */
export type ExecutableRef = CoreExecutableManifest.ExecutableRef

/** @experimental Executable closure paired with its constructor-owned reference. */
export interface PinnedExecutable extends CoreExecutableManifest.PinnedExecutable {}
/** @experimental Encoded executable closure paired with its reference. */
export interface PinnedExecutableEncoded {
  readonly ref: typeof ExecutableRef.Encoded
  readonly manifest: ExecutableManifestEncoded
}

/** @experimental Paired executable authority boundary. */
export const PinnedExecutable: Schema.Codec<PinnedExecutable, PinnedExecutableEncoded> = Schema.Struct({
  ref: ExecutableRef,
  manifest: ExecutableManifest,
})

/** @experimental Construct, validate, canonicalize, and pin a complete executable closure. */
export const make: typeof CoreExecutableManifest.make = CoreExecutableManifest.make
/** @experimental Construct an exact static executable fixture. */
export const makeTest: {
  (revision?: string): (name: string) => CoreExecutableManifest.PinnedExecutable
  (name: string, revision?: string): CoreExecutableManifest.PinnedExecutable
} = Function.dual(
  2,
  CoreExecutableManifest.makeTest as (name: string, revision?: string) => CoreExecutableManifest.PinnedExecutable,
)
/** @experimental Verify that a durable reference is exactly owned by a closure. */
export const validateRef: {
  (manifest: ExecutableManifest): (ref: ExecutableRef) => void
  (ref: ExecutableRef, manifest: ExecutableManifest): void
} = Function.dual(2, (ref: ExecutableRef, manifest: ExecutableManifest): void =>
  CoreExecutableManifest.validateRef(ref, manifest),
)
/** @experimental */
export const encode: {
  (
    input: PinnedExecutable,
    options?: import("effect/SchemaAST").ParseOptions,
  ): Effect.Effect<PinnedExecutableEncoded, Schema.SchemaError>
  (
    options?: import("effect/SchemaAST").ParseOptions,
  ): (input: PinnedExecutable) => Effect.Effect<PinnedExecutableEncoded, Schema.SchemaError>
} = Function.dual(
  (args) => typeof args[0] === "object" && args[0] !== null && "ref" in args[0] && "manifest" in args[0],
  (input: PinnedExecutable, options?: import("effect/SchemaAST").ParseOptions) =>
    CoreExecutableManifest.encode(input, options),
)
/** @experimental */
export const decode: typeof CoreExecutableManifest.decode = CoreExecutableManifest.decode

/** @experimental Decode and synchronously verify one complete executable authority. */
export const decodePinned = (input: unknown): PinnedExecutable => {
  const value =
    typeof input === "object" && input !== null && "ref" in input && "manifest" in input
      ? { ref: input.ref, manifest: input.manifest }
      : input
  const pinned = Schema.decodeUnknownSync(PinnedExecutable, { onExcessProperty: "error" })(value)
  validateRef(pinned.ref, pinned.manifest)
  return pinned
}

/** @experimental Compare two verified executable authorities exactly. */
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

/** @experimental Validate a checkpoint pin and derive the Run's active executable reference. */
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
    const child =
      active?._tag === "Agent"
        ? (active as AgentEntry).manifest.children.some((binding) => binding.selection === selection)
          ? manifest.profiles.find((profile) => profile.selection === selection)?.agent
          : undefined
        : active?._tag === "Program"
          ? (active as ProgramEntry).manifest.capabilities.agents.find((binding) => binding.selection === selection)
              ?.agent
          : undefined
    if (child === undefined || !manifest.entries.some((entry) => entry._tag === "Agent" && entry.pin === child))
      return undefined
    return { executable: ref.executable, active: child }
  },
)
