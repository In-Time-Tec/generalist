import { Context, Effect, Equal, Layer, Option } from "effect"
import { type Placement, identifyRequest, type PageInput } from "./placement.js"
import { ExternalChildStore, type Service } from "./store.js"
import { RuntimeUnavailable } from "../../errors.js"

/** The application authorizes and scopes each peer connection; no marker or envelope grants access. @experimental */
export interface Options<E = never, R = never> {
  readonly partition: string
  readonly limit?: number
  readonly placementCursor?: string
  readonly rootCursor?: string
  readonly connect: (partition: string) => Effect.Effect<Option.Option<Layer.Layer<ExternalChildStore, E, R>>, E, R>
}

/** A HOST-owned, requirement-closed peer router used by the native Runtime. @experimental */
export interface PeerRoutesService {
  readonly connect: (
    partition: string,
  ) => Effect.Effect<
    Option.Option<Layer.Layer<ExternalChildStore, RuntimeUnavailable>>,
    RuntimeUnavailable
  >
}

/** Explicit peer authorization for native cross-partition child placement. @experimental */
export class ExternalChildPeerRoutes extends Context.Service<ExternalChildPeerRoutes, PeerRoutesService>()(
  "generalist/runtime/child/external/reconciliation/ExternalChildPeerRoutes",
) {}

const routeUnavailable = (partition: string) =>
  RuntimeUnavailable.make({ message: `External child peer ${partition} is unavailable` })

/**
 * Capture a HOST's peer dependencies and translate its private connection failures at the
 * framework boundary. Returning None remains the authorization decision; a partition string
 * alone never grants access.
 * @experimental
 */
export const layerPeerRoutes = <E, R>(
  connect: Options<E, R>["connect"],
): Layer.Layer<ExternalChildPeerRoutes, never, R> =>
  Layer.effect(
    ExternalChildPeerRoutes,
    Effect.map(Effect.context<R>(), (context) =>
      ExternalChildPeerRoutes.of({
        connect: (partition) =>
          connect(partition).pipe(
            Effect.provide(context),
            Effect.mapError(() => routeUnavailable(partition)),
            Effect.map(
              Option.map((peer) =>
                peer.pipe(
                  Layer.provide(Layer.succeedContext(context)),
                  Layer.catchCause(() =>
                    Layer.effect(ExternalChildStore, Effect.fail(routeUnavailable(partition))),
                  ),
                ),
              ),
            ),
          ),
      }),
    ),
  )

const deliver = (parent: Service, child: Service, placement: Placement) =>
  Effect.gen(function* () {
    const identity = yield* identifyRequest(placement.request)
    if (
      identity.requestDigest !== placement.requestDigest ||
      identity.executableDigest !== placement.executableDigest
    ) {
      return yield* RuntimeUnavailable.make({
        message: "External placement envelope does not match its immutable identity",
      })
    }
    yield* child.admitRoot({ placementId: placement.placementId, ...placement.request, ...identity })
    yield* parent.acknowledge(placement.placementId)
    const current = yield* parent.inspectPlacement(placement.placementId)
    const root = yield* child.inspectRoot(placement.placementId)
    if (!current.settled && root.outcome === undefined) {
      if (current.cancelRequested) yield* child.cancelRoot(placement.placementId, current.cancelReason)
      else if (current.readiness === "ready") yield* child.activateRoot(placement.placementId)
    }
    const settlement = yield* child.rootSettlement(placement.placementId)
    if (Option.isNone(settlement)) return
    if (!Equal.equals(settlement.value.ref, placement.request.ref)) {
      return yield* RuntimeUnavailable.make({ message: "External settlement belongs to another receiver" })
    }
    yield* parent.settle({
      placementId: placement.placementId,
      settlementId: settlement.value.settlementId,
      outcome: settlement.value.outcome,
      ...(settlement.value.spend === undefined ? undefined : { spend: settlement.value.spend }),
    })
    yield* child.acknowledgeRootSettlement({
      placementId: placement.placementId,
      settlementId: settlement.value.settlementId,
    })
  })

const withPeer = <E, R, A, E2, R2>(
  options: Options<E, R>,
  partition: string,
  use: (peer: Service) => Effect.Effect<A, E2, R2>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const authorized = yield* options.connect(partition)
      if (Option.isNone(authorized)) return false
      const services = yield* Layer.build(authorized.value)
      const peer = yield* ExternalChildStore.pipe(Effect.provide(services))
      yield* use(peer)
      return true
    }),
  )

/**
 * Reconcile two bounded scan windows with original admission and settlement identities.
 * Restart each cursor from the beginning after its sweep ends; interruptions and lost replies
 * leave canonical obligations for a fresh host, not a process-local delivery queue.
 * @experimental
 */
export const reconcilePage = <E, R>(options: Options<E, R>) =>
  Effect.gen(function* () {
    const local = yield* ExternalChildStore
    const placementPage: PageInput = { limit: options.limit ?? 64 }
    const rootPage: PageInput = { limit: options.limit ?? 64 }
    if (options.placementCursor !== undefined)
      Object.assign(placementPage, { afterPlacementId: options.placementCursor })
    if (options.rootCursor !== undefined) Object.assign(rootPage, { afterPlacementId: options.rootCursor })
    const placements = yield* local.outstandingPlacements(placementPage)
    const roots = yield* local.outstandingRoots(rootPage)
    let denied = 0
    for (const placement of placements.items) {
      if (
        placement.request.parent.partition !== options.partition ||
        placement.request.parent.runId !== placement.parentRunId
      ) {
        return yield* RuntimeUnavailable.make({
          message: "External placement does not belong to the reconciling parent",
        })
      }
      const delivered = yield* withPeer(options, placement.request.ref.partition, (peer) =>
        deliver(local, peer, placement),
      )
      if (!delivered) denied++
    }
    for (const root of roots.items) {
      if (root.ref.partition !== options.partition) {
        return yield* RuntimeUnavailable.make({
          message: "External root does not belong to the reconciling receiver",
        })
      }
      const delivered = yield* withPeer(options, root.parent.partition, (peer) =>
        Effect.gen(function* () {
          const placement = yield* peer.inspectPlacement(root.placementId)
          if (
            !Equal.equals(placement.request.parent, root.parent) ||
            !Equal.equals(placement.request.ref, root.ref) ||
            placement.requestDigest !== root.requestDigest ||
            placement.executableDigest !== root.executableDigest
          ) {
            return yield* RuntimeUnavailable.make({
              message: "External root does not match its parent's immutable request",
            })
          }
          yield* deliver(peer, local, placement)
        }),
      )
      if (!delivered) denied++
    }
    return {
      placements: placements.items.length,
      roots: roots.items.length,
      denied,
      placementCursor: placements.cursor,
      rootCursor: roots.cursor,
    }
  })
