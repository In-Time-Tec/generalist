import { Context, Effect, Schema } from "effect"
import { CellId, Epoch, SessionId } from "./cell.js"
import { CheckpointKind } from "./kernel-profile.js"

const Identifier = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255))
const Digest = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const PositiveMillis = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

/** @experimental Identity of one host process competing to own a Session kernel. */
export const OwnerId = Identifier
/** @experimental */
export type OwnerId = typeof OwnerId.Type

/** @experimental Storage-issued, monotonically increasing ownership generation for one Session. */
export const Generation = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
/** @experimental */
export type Generation = typeof Generation.Type

/** @experimental Exact current owner of one Session kernel resource. */
export const Claim = Schema.Struct({
  sessionId: SessionId,
  ownerId: OwnerId,
  generation: Generation,
})
/** @experimental */
export type Claim = typeof Claim.Type

/**
 * @experimental Identity every remote command and response carries. `cellId` is also required for
 * inspect, restart, and close: remote adapters create a private control-cell identity for those
 * calls so no command can escape the same admission boundary as authored source.
 */
export const CommandClaim = Schema.Struct({
  sessionId: SessionId,
  ownerId: OwnerId,
  generation: Generation,
  epoch: Epoch,
  profileDigest: Digest,
  cellId: CellId,
})
/** @experimental */
export type CommandClaim = typeof CommandClaim.Type

/** @experimental Mutable provider resource state retained only in the host control authority. */
export const ResourceState = Schema.Literals(["live", "paused", "deleting"])
/** @experimental */
export type ResourceState = typeof ResourceState.Type

/** @experimental A cleanup failure kept with the resource until deletion is proven. */
export const CleanupFailure = Schema.Struct({
  attempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  message: Schema.String.check(Schema.isMaxLength(2048)),
})
/** @experimental */
export type CleanupFailure = typeof CleanupFailure.Type

/** @experimental Exact provider resource targeted by a cleanup or lifecycle compare-and-set. */
export const ResourceIdentity = Schema.Struct({
  provider: Identifier,
  resourceId: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(2048)),
  profileDigest: Digest,
  epoch: Epoch,
})
/** @experimental */
export type ResourceIdentity = typeof ResourceIdentity.Type

/** @experimental Host-supplied immutable binding and lifecycle facts; authority fields remain store-owned. */
export const ResourceBinding = Schema.Struct({
  ...ResourceIdentity.fields,
  state: ResourceState,
  checkpoint: CheckpointKind,
})
/** @experimental */
export type ResourceBinding = typeof ResourceBinding.Type

/**
 * @experimental Host-only binding of one provider resource to its immutable profile and epoch.
 * Resource IDs and cleanup failures never belong in KernelProfile, CellEvent, or CellResult.
 */
export const Resource = Schema.Struct({
  ...ResourceBinding.fields,
  activeCell: Schema.optionalKey(CommandClaim),
  cleanupFailure: Schema.optionalKey(CleanupFailure),
})
/** @experimental */
export type Resource = typeof Resource.Type

/** @experimental Current storage-owned lease plus any provider resource the owner must reconcile. */
export const Lease = Schema.Struct({
  claim: Claim,
  requestedProvider: Identifier,
  requestedProfileDigest: Digest,
  expiresAtMillis: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  resource: Schema.optionalKey(Resource),
})
/** @experimental */
export type Lease = typeof Lease.Type

/** @experimental A resource authority rejected an ownership or lifecycle transition atomically. */
export class KernelResourceRejected extends Schema.TaggedError<KernelResourceRejected>()(
  "tenetkit/repl/KernelResourceRejected",
  {
    sessionId: SessionId,
    reason: Schema.Literals([
      "owned",
      "stale-claim",
      "resource-missing",
      "resource-mismatch",
      "cell-active",
      "cell-not-active",
      "cleanup-pending",
    ]),
    message: Schema.String,
  },
) {}

/** @experimental The resource authority could not read or commit its durable state. */
export class KernelResourceStoreUnavailable extends Schema.TaggedError<KernelResourceStoreUnavailable>()(
  "tenetkit/repl/KernelResourceStoreUnavailable",
  {
    sessionId: Schema.optionalKey(SessionId),
    message: Schema.String,
  },
) {}

/** @experimental Closed failure union for host-owned resource authority operations. */
export type KernelResourceFailure = KernelResourceRejected | KernelResourceStoreUnavailable

/** @experimental Atomically request ownership using the store's authoritative clock. */
export interface AcquireRequest {
  readonly sessionId: SessionId
  readonly ownerId: OwnerId
  readonly provider: string
  readonly profileDigest: string
  readonly leaseMillis: number
}

/** @experimental Bind or update the exact current provider resource. A different ID requires deletion first. */
export interface BindRequest {
  readonly claim: Claim
  readonly resource: ResourceBinding
}

/** @experimental Admit a claim-bound command at the provider-side boundary immediately before it acts. */
export interface AdmitRequest {
  readonly command: CommandClaim
  readonly kind: "cell" | "control"
  readonly expectedCell?: CommandClaim
}

/** @experimental Clear only the exact admitted cell under the current owner's authority. */
export interface FinishRequest {
  readonly claim: Claim
  readonly expectedCell: CommandClaim
}

/** @experimental Complete or report cleanup only for the exact resource the provider call targeted. */
export interface DeletionRequest {
  readonly claim: Claim
  readonly expectedResource: ResourceIdentity
}

/**
 * @experimental Durable authority for a live external kernel resource. This is neither Runtime Run
 * fencing nor KernelStateStore. Implementations must serialize every method per Session. `acquire`
 * issues a greater generation only after the prior lease expires; `admit` validates the exact
 * generation/profile/resource/epoch at the boundary that acts on the resource and records the sole
 * active cell atomically. `expectedCell` lets a new owner interrupt and reconcile an earlier
 * generation's admitted cell without granting that earlier generation authority. A transition to
 * `paused` must reject while `activeCell` is present. Store-owned `activeCell` and cleanup fields
 * cannot be overwritten through `bind`. `revoke` marks a resource deleting before provider
 * deletion, and only an exact resource compare-and-set in `confirmDeletion` may forget its mutable
 * ID after deletion is proven. Failed deletion stays visible through `pendingDeletion`.
 */
export interface Service {
  readonly acquire: (request: AcquireRequest) => Effect.Effect<Lease, KernelResourceFailure>
  readonly renew: (claim: Claim, leaseMillis: number) => Effect.Effect<Lease, KernelResourceFailure>
  readonly bind: (request: BindRequest) => Effect.Effect<Lease, KernelResourceFailure>
  readonly admit: (request: AdmitRequest) => Effect.Effect<Resource, KernelResourceFailure>
  readonly finish: (request: FinishRequest) => Effect.Effect<void, KernelResourceFailure>
  readonly revoke: (claim: Claim) => Effect.Effect<ResourceIdentity | undefined, KernelResourceFailure>
  readonly failDeletion: (request: DeletionRequest, message: string) => Effect.Effect<Resource, KernelResourceFailure>
  readonly confirmDeletion: (request: DeletionRequest) => Effect.Effect<void, KernelResourceFailure>
  readonly inspect: (sessionId: SessionId) => Effect.Effect<Lease | undefined, KernelResourceStoreUnavailable>
  readonly pendingDeletion: Effect.Effect<ReadonlyArray<Lease>, KernelResourceStoreUnavailable>
}

/** @experimental */
export class KernelResourceStore extends Context.Service<KernelResourceStore, Service>()(
  "tenetkit/repl/kernel-resource-store/KernelResourceStore",
) {}

/** @experimental Validate a caller-supplied lease duration at an adapter boundary. */
export const LeaseMillis = PositiveMillis
