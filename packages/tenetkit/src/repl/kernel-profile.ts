import { Schema } from "effect"
import { Pins } from "../core/index.js"

/** @experimental Wire version of the cell protocol. A kernel and a host must agree exactly. */
export const protocolVersion = 1

/** @experimental Version of the KernelProfile contract itself. */
export const contractVersion = 1

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

/**
 * @experimental The kernel's authority posture. `trusted-local` runs with the host user's OS
 * permissions and is a lifecycle boundary, not a sandbox.
 */
export const TrustMode = Schema.Literals(["trusted-local", "trusted-workspace"])
/** @experimental */
export type TrustMode = typeof TrustMode.Type

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
  runtime: Runtime,
  bindingsDigest: Digest,
  workspace: Workspace,
  limits: Limits,
  trustMode: TrustMode,
})
/** @experimental */
export type KernelProfile = typeof KernelProfile.Type

/** @experimental */
export interface MakeOptions {
  readonly runtime: Runtime
  readonly bindingsDigest: string
  readonly workspace: Workspace
  readonly limits: Limits
  readonly trustMode: TrustMode
}

/** @experimental Construct one profile at the current contract and protocol version. */
export const make = (options: MakeOptions): KernelProfile =>
  KernelProfile.make({
    contractVersion,
    protocolVersion,
    runtime: options.runtime,
    bindingsDigest: options.bindingsDigest,
    workspace: options.workspace,
    limits: options.limits,
    trustMode: options.trustMode,
  })

/**
 * @experimental Content-addressed identity of one profile. Two profiles with the same digest
 * reconstruct the same kernel epoch; a different digest requires a new epoch.
 */
export const digest = (profile: KernelProfile): string => Pins.digest(Schema.encodeSync(KernelProfile)(profile))

/** @experimental Digest of the ordered set of host binding module names mounted into a kernel. */
export const bindingsDigest = (names: ReadonlyArray<string>): string => Pins.digest(names.toSorted())
