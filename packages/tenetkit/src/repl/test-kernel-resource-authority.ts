import { Clock, Effect, Layer, Schema, SynchronizedRef } from "effect"
import {
  type Claim,
  type CommandClaim,
  type Service as KernelResourceAuthorityService,
  type KernelResourceFailure,
  KernelResourceRejected,
  KernelResourceAuthority,
  Lease,
  LeaseMillis,
  Resource,
  type ResourceIdentity,
} from "./kernel-resource-authority.js"

interface AuthorityState {
  readonly generations: ReadonlyMap<string, number>
  readonly leases: ReadonlyMap<string, Lease>
}

const emptyAuthority: AuthorityState = {
  generations: new Map(),
  leases: new Map(),
}

const sameClaim = (left: Claim, right: Claim): boolean =>
  left.sessionId === right.sessionId && left.ownerId === right.ownerId && left.generation === right.generation

const sameCommand = (left: CommandClaim, right: CommandClaim): boolean =>
  sameClaim(left, right) &&
  left.epoch === right.epoch &&
  left.profileDigest === right.profileDigest &&
  left.cellId === right.cellId

const identityOf = (resource: Resource): ResourceIdentity => ({
  provider: resource.provider,
  resourceId: resource.resourceId,
  profileDigest: resource.profileDigest,
  epoch: resource.epoch,
})

const sameResource = (resource: Resource, expected: ResourceIdentity): boolean =>
  resource.provider === expected.provider &&
  resource.resourceId === expected.resourceId &&
  resource.profileDigest === expected.profileDigest &&
  resource.epoch === expected.epoch

const rejected = (
  sessionId: string,
  reason: KernelResourceRejected["reason"],
  message: string,
): KernelResourceRejected => KernelResourceRejected.make({ sessionId, reason, message })

const setLease = (state: AuthorityState, lease: Lease): AuthorityState => ({
  ...state,
  leases: new Map(state.leases).set(lease.claim.sessionId, lease),
})

const currentLease = (
  state: AuthorityState,
  claim: Claim,
  now: number,
): Effect.Effect<Lease, KernelResourceRejected> => {
  const lease = state.leases.get(claim.sessionId)
  return lease !== undefined && sameClaim(lease.claim, claim) && lease.expiresAtMillis > now
    ? Effect.succeed(lease)
    : Effect.fail(rejected(claim.sessionId, "stale-claim", "the kernel resource claim is not current"))
}

/** @experimental In-memory resource authority controls used only by deterministic provider tests. */
export interface MemoryResourceAuthority extends KernelResourceAuthorityService {
  readonly expire: (sessionId: string) => Effect.Effect<void>
}

/**
 * @experimental An atomic in-memory KernelResourceAuthority. It models ownership, command admission,
 * takeover reconciliation, and retained cleanup without pretending to be durable storage.
 */
export const makeMemoryResourceAuthority: Effect.Effect<MemoryResourceAuthority> = Effect.gen(function* () {
  const authority = yield* SynchronizedRef.make(emptyAuthority)
  const modify = <A>(
    transition: (state: AuthorityState) => Effect.Effect<readonly [A, AuthorityState], KernelResourceFailure>,
  ): Effect.Effect<A, KernelResourceFailure> => SynchronizedRef.modifyEffect(authority, transition)

  return {
    acquire: (request) =>
      Effect.gen(function* () {
        if (!Schema.is(LeaseMillis)(request.leaseMillis)) {
          return yield* rejected(request.sessionId, "resource-mismatch", "the lease duration must be positive")
        }
        const now = yield* Clock.currentTimeMillis
        return yield* modify((state) => {
          const existing = state.leases.get(request.sessionId)
          if (existing !== undefined && existing.expiresAtMillis > now && existing.claim.ownerId !== request.ownerId) {
            return Effect.fail(rejected(request.sessionId, "owned", "another host owns the Session kernel"))
          }
          const reentrant =
            existing !== undefined && existing.expiresAtMillis > now && existing.claim.ownerId === request.ownerId
          const generation = reentrant ? existing.claim.generation : (state.generations.get(request.sessionId) ?? 0) + 1
          const base = {
            claim: { sessionId: request.sessionId, ownerId: request.ownerId, generation },
            requestedProvider: request.provider,
            requestedProfileDigest: request.profileDigest,
            expiresAtMillis: now + request.leaseMillis,
          }
          const lease =
            existing?.resource === undefined ? Lease.make(base) : Lease.make({ ...base, resource: existing.resource })
          const next = setLease(
            {
              ...state,
              generations: new Map(state.generations).set(request.sessionId, generation),
            },
            lease,
          )
          return Effect.succeed([lease, next] as const)
        })
      }),
    renew: (claim, leaseMillis) =>
      Effect.gen(function* () {
        if (!Schema.is(LeaseMillis)(leaseMillis)) {
          return yield* rejected(claim.sessionId, "resource-mismatch", "the lease duration must be positive")
        }
        const now = yield* Clock.currentTimeMillis
        return yield* modify((state) =>
          currentLease(state, claim, now).pipe(
            Effect.map((lease) => {
              const renewed = Lease.make({ ...lease, expiresAtMillis: now + leaseMillis })
              return [renewed, setLease(state, renewed)] as const
            }),
          ),
        )
      }),
    bind: ({ claim, resource }) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        return yield* modify((state) =>
          currentLease(state, claim, now).pipe(
            Effect.flatMap((lease) => {
              const existing = lease.resource
              if (
                resource.provider !== lease.requestedProvider ||
                resource.profileDigest !== lease.requestedProfileDigest
              ) {
                return Effect.fail(
                  rejected(claim.sessionId, "resource-mismatch", "the resource does not match the requested profile"),
                )
              }
              if (existing?.state === "deleting") {
                return Effect.fail(rejected(claim.sessionId, "cleanup-pending", "the resource is still deleting"))
              }
              if (existing !== undefined && !sameResource(existing, resource)) {
                return Effect.fail(
                  rejected(claim.sessionId, "resource-mismatch", "a different provider resource is already bound"),
                )
              }
              if (resource.state === "paused" && existing?.activeCell !== undefined) {
                return Effect.fail(rejected(claim.sessionId, "cell-active", "an active cell prevents idle pause"))
              }
              const withActive =
                existing?.activeCell === undefined
                  ? Resource.make(resource)
                  : Resource.make({ ...resource, activeCell: existing.activeCell })
              const bound =
                existing?.cleanupFailure === undefined
                  ? withActive
                  : Resource.make({ ...withActive, cleanupFailure: existing.cleanupFailure })
              const updated = Lease.make({ ...lease, resource: bound })
              return Effect.succeed([updated, setLease(state, updated)] as const)
            }),
          ),
        )
      }),
    admit: ({ command, kind, expectedCell }) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const claim: Claim = {
          sessionId: command.sessionId,
          ownerId: command.ownerId,
          generation: command.generation,
        }
        return yield* modify((state) =>
          currentLease(state, claim, now).pipe(
            Effect.flatMap((lease) => {
              const resource = lease.resource
              if (resource === undefined) {
                return Effect.fail(rejected(command.sessionId, "resource-missing", "no provider resource is bound"))
              }
              if (
                resource.state !== "live" ||
                resource.provider !== lease.requestedProvider ||
                resource.profileDigest !== lease.requestedProfileDigest ||
                resource.profileDigest !== command.profileDigest ||
                resource.epoch !== command.epoch
              ) {
                return Effect.fail(
                  rejected(command.sessionId, "resource-mismatch", "the command does not name the live resource"),
                )
              }
              if (
                expectedCell !== undefined &&
                (resource.activeCell === undefined || !sameCommand(resource.activeCell, expectedCell))
              ) {
                return Effect.fail(
                  rejected(command.sessionId, "cell-not-active", "the expected admitted cell is not active"),
                )
              }
              if (kind === "control") return Effect.succeed([resource, state] as const)
              if (resource.activeCell !== undefined) {
                return Effect.fail(rejected(command.sessionId, "cell-active", "another cell is already admitted"))
              }
              const admitted = Resource.make({ ...resource, activeCell: command })
              const updated = Lease.make({ ...lease, resource: admitted })
              return Effect.succeed([admitted, setLease(state, updated)] as const)
            }),
          ),
        )
      }),
    finish: ({ claim, expectedCell }) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        return yield* modify((state) =>
          currentLease(state, claim, now).pipe(
            Effect.flatMap((lease) => {
              const resource = lease.resource
              if (resource?.activeCell === undefined || !sameCommand(resource.activeCell, expectedCell)) {
                return Effect.fail(
                  rejected(claim.sessionId, "cell-not-active", "the expected admitted cell is not active"),
                )
              }
              const { activeCell: _, ...idle } = resource
              const updated = Lease.make({ ...lease, resource: Resource.make(idle) })
              return Effect.succeed([undefined, setLease(state, updated)] as const)
            }),
          ),
        )
      }),
    revoke: (claim) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        return yield* modify<ResourceIdentity | undefined>((state) =>
          currentLease(state, claim, now).pipe(
            Effect.flatMap((lease) => {
              const resource = lease.resource
              if (resource === undefined) {
                return Effect.succeed<readonly [ResourceIdentity | undefined, AuthorityState]>([undefined, state])
              }
              if (resource.activeCell !== undefined) {
                return Effect.fail(rejected(claim.sessionId, "cell-active", "an active cell must stop before deletion"))
              }
              const deleting = Resource.make({ ...resource, state: "deleting" })
              const updated = Lease.make({ ...lease, resource: deleting })
              return Effect.succeed<readonly [ResourceIdentity | undefined, AuthorityState]>([
                identityOf(deleting),
                setLease(state, updated),
              ])
            }),
          ),
        )
      }),
    failDeletion: ({ claim, expectedResource }, message) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        return yield* modify((state) =>
          currentLease(state, claim, now).pipe(
            Effect.flatMap((lease) => {
              const resource = lease.resource
              if (
                resource === undefined ||
                resource.state !== "deleting" ||
                !sameResource(resource, expectedResource)
              ) {
                return Effect.fail(
                  rejected(claim.sessionId, "resource-mismatch", "the deleting resource identity changed"),
                )
              }
              const failed = Resource.make({
                ...resource,
                cleanupFailure: { attempts: (resource.cleanupFailure?.attempts ?? 0) + 1, message },
              })
              const updated = Lease.make({ ...lease, resource: failed })
              return Effect.succeed([failed, setLease(state, updated)] as const)
            }),
          ),
        )
      }),
    confirmDeletion: ({ claim, expectedResource }) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        return yield* modify((state) =>
          currentLease(state, claim, now).pipe(
            Effect.flatMap((lease) => {
              const resource = lease.resource
              if (
                resource === undefined ||
                resource.state !== "deleting" ||
                !sameResource(resource, expectedResource)
              ) {
                return Effect.fail(
                  rejected(claim.sessionId, "resource-mismatch", "the deleting resource identity changed"),
                )
              }
              const { resource: _, ...unbound } = lease
              return Effect.succeed([undefined, setLease(state, Lease.make(unbound))] as const)
            }),
          ),
        )
      }),
    inspect: (sessionId) => SynchronizedRef.get(authority).pipe(Effect.map((state) => state.leases.get(sessionId))),
    pendingDeletion: SynchronizedRef.get(authority).pipe(
      Effect.map((state) => Array.from(state.leases.values()).filter((lease) => lease.resource?.state === "deleting")),
    ),
    expire: (sessionId) =>
      SynchronizedRef.update(authority, (state) => {
        const lease = state.leases.get(sessionId)
        return lease === undefined ? state : setLease(state, Lease.make({ ...lease, expiresAtMillis: 0 }))
      }),
  }
})

/** @experimental */
export const layerMemoryResourceAuthority: Layer.Layer<KernelResourceAuthority> = Layer.effect(
  KernelResourceAuthority,
  makeMemoryResourceAuthority,
)
