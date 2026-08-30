import { Schema } from "effect"
import { digest as pinDigest } from "../core/durable/pin.js"

/** @experimental Wire version of the cell protocol. A kernel and a host must agree exactly. */
export const protocolVersion = 1

/** @experimental Version of the KernelProfile contract itself. */
export const contractVersion = 2

const Identifier = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255))
const Digest = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const PositiveBytes = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

/** @experimental The pinned runtime that evaluates cells. */
export const Runtime = Schema.Struct({
  name: Identifier,
  version: Identifier,
  digest: Digest,
})
/** @experimental */
export type Runtime = typeof Runtime.Type

/** @experimental Immutable runtime, image, or template reconstructed for one kernel epoch. */
export const Image = Schema.Struct({
  kind: Schema.Literals(["runtime", "image", "template"]),
  reference: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(4096)),
  digest: Digest,
})
/** @experimental */
export type Image = typeof Image.Type

/** @experimental Where cells resolve imports, `require`, and relative paths. */
export const Workspace = Schema.Struct({
  root: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(4096)),
  dataRoot: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(4096)),
})
/** @experimental */
export type Workspace = typeof Workspace.Type

/** @experimental Source and execution bounds enforced by the kernel. */
export const Limits = Schema.Struct({
  sourceBytes: PositiveBytes,
  cellDeadlineMillis: PositiveBytes,
})
/** @experimental */
export type Limits = typeof Limits.Type

/** @experimental Physical process boundary supplied to a kernel. This is a fact, not a security rating. */
export const Isolation = Schema.Literals(["host-process", "container", "microvm"])
/** @experimental */
export type Isolation = typeof Isolation.Type

/** @experimental Distinct state a provider can restore after its live kernel stops or pauses. */
export const CheckpointCapabilities = Schema.Struct({
  liveProcess: Schema.Boolean,
  filesystem: Schema.Boolean,
  namespace: Schema.Boolean,
})
/** @experimental */
export type CheckpointCapabilities = typeof CheckpointCapabilities.Type

/** @experimental What actually continued when a kernel resource was recovered. */
export const CheckpointKind = Schema.Literals(["live-process", "filesystem", "namespace", "restart-only"])
/** @experimental */
export type CheckpointKind = typeof CheckpointKind.Type

/**
 * @experimental Everything a kernel epoch is reconstructed from. The profile declares no
 * secret-bearing field: every field is an identifier, a digest, a path, or a bound, and there is no
 * credential, token, header, or environment slot. Unknown keys are dropped from both the encoded
 * form and the digest, so a host cannot widen the profile by attaching extra data to it. The
 * content of the free-text identifier and path fields is host-supplied and is not scanned or
 * redacted; a host that embeds a secret in a path or a runtime name persists and renders it.
 */
export const KernelProfile = Schema.Struct({
  contractVersion: Schema.Literal(contractVersion),
  protocolVersion: Schema.Literal(protocolVersion),
  provider: Identifier,
  runtime: Runtime,
  image: Image,
  isolation: Isolation,
  checkpoints: CheckpointCapabilities,
  bindingsDigest: Digest,
  workspace: Workspace,
  limits: Limits,
})
/** @experimental */
export type KernelProfile = typeof KernelProfile.Type

/** @experimental */
export interface MakeOptions {
  readonly provider: string
  readonly runtime: Runtime
  readonly image: Image
  readonly isolation: Isolation
  readonly checkpoints: CheckpointCapabilities
  readonly bindingsDigest: string
  readonly workspace: Workspace
  readonly limits: Limits
}

/** @experimental Construct one profile at the current contract and protocol version. */
export const make = (options: MakeOptions): KernelProfile =>
  KernelProfile.make({
    contractVersion,
    protocolVersion,
    provider: options.provider,
    runtime: options.runtime,
    image: options.image,
    isolation: options.isolation,
    checkpoints: options.checkpoints,
    bindingsDigest: options.bindingsDigest,
    workspace: options.workspace,
    limits: options.limits,
  })

/**
 * @experimental Content-addressed identity of one profile. Two profiles with the same digest
 * reconstruct the same kernel epoch; a different digest requires a new epoch.
 */
export const digest = (profile: KernelProfile): string => pinDigest(Schema.encodeSync(KernelProfile)(profile))

/** @experimental Digest of the ordered set of host binding module names mounted into a kernel. */
export const bindingsDigest = (names: ReadonlyArray<string>): string => pinDigest(names.toSorted())
