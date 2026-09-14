import { Cause, Context, type Crypto, Effect, Layer, Option, Schema } from "effect"
import type { ObjectStore } from "../../durability/object-store.js"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import { RuntimeUnavailable } from "../errors.js"
import { layerRunStore } from "../state/store.js"
import { ExternalChildStore } from "./external/store.js"
import { make as makeEndpoint } from "./coordination-internal.js"

declare const PeerEndpointTypeId: unique symbol

/** Opaque access to one Runtime partition's cross-partition child protocol. */
export interface PeerEndpoint {
  readonly [PeerEndpointTypeId]: typeof PeerEndpointTypeId
}

/** A Runtime-issued peer endpoint. Applications can route it but cannot invoke its protocol. */
export class Peer extends Context.Service<Peer, PeerEndpoint>()("generalist/runtime/child/coordination/Peer") {}

/** A peer endpoint could not be reconstructed from its application-provided storage. */
export class PeerUnavailable extends ActionableTaggedError<PeerUnavailable>()(
  "generalist/runtime/child/coordination/PeerUnavailable",
  {
    partition: Schema.String,
    hint: errorHint("Check the peer namespace and storage Layer, then reconstruct the endpoint."),
  },
) {}

/** Storage-backed identity for one non-executing peer endpoint. */
export interface PeerOptions<StorageError = never, StorageRequirements = never> {
  readonly storage: Layer.Layer<ObjectStore | Crypto.Crypto, StorageError, StorageRequirements>
  readonly namespace: {
    readonly environment: string
    readonly tenant: string
    readonly partition: string
  }
}

/**
 * Reconstruct one opaque, non-executing partition endpoint over application-owned storage.
 * Building this Layer neither acquires execution ownership nor starts a scheduler.
 */
export const layerPeer = <StorageError, StorageRequirements>(
  options: PeerOptions<StorageError, StorageRequirements>,
): Layer.Layer<Peer, PeerUnavailable, StorageRequirements> => {
  const store = layerRunStore({ ...options.namespace, addresses: [] }).pipe(Layer.provide(options.storage))
  return Layer.effect(
    Peer,
    Effect.map(ExternalChildStore, (service) => makeEndpoint(options.namespace.partition, service)),
  ).pipe(
    Layer.provide(store),
    Layer.catchCause((cause) => {
      if (Cause.hasInterrupts(cause)) return Layer.effect(Peer, Effect.interrupt)
      if (Cause.hasDies(cause)) return Layer.effect(Peer, Effect.die(cause))
      return Layer.effect(Peer, Effect.fail(PeerUnavailable.make({ partition: options.namespace.partition })))
    }),
  )
}

/**
 * One application-authorized peer connection and its best-effort wake delivery.
 * Wake implementations must be promptly interruptible and have bounded cleanup.
 */
export interface Route<E = never, R = never> {
  readonly endpoint: Layer.Layer<Peer, E, R>
  readonly wake: Effect.Effect<void, E, R>
}

/** Application-owned partition routing. `None` denies access to that partition. */
export interface RoutesOptions<E = never, R = never> {
  readonly connect: (partition: string) => Effect.Effect<Option.Option<Route<E, R>>, E, R>
}

/** @internal Requirement-closed route used by Runtime reconciliation. */
export interface BoundRoute {
  readonly endpoint: Layer.Layer<Peer, RuntimeUnavailable>
  readonly wake: Effect.Effect<void, RuntimeUnavailable>
}

/** @internal Requirement-closed routing service installed in a Runtime. */
export interface Service {
  readonly connect: (partition: string) => Effect.Effect<Option.Option<BoundRoute>, RuntimeUnavailable>
}

/** Application-authorized cross-partition routing and wake delivery. */
export class Routes extends Context.Service<Routes, Service>()("generalist/runtime/child/coordination/Routes") {}

const unavailable = (partition: string) =>
  RuntimeUnavailable.make({ message: `External child peer ${partition} is unavailable` })

/** Capture route dependencies and translate adapter failures at the Runtime boundary. */
export const layerRoutes = <E, R>(options: RoutesOptions<E, R>): Layer.Layer<Routes, never, R> =>
  Layer.effect(
    Routes,
    Effect.map(Effect.context<R>(), (context) =>
      Routes.of({
        connect: (partition) =>
          options.connect(partition).pipe(
            Effect.provide(context),
            Effect.mapError(() => unavailable(partition)),
            Effect.map(
              Option.map((route) => ({
                endpoint: route.endpoint.pipe(
                  Layer.provide(Layer.succeedContext(context)),
                  Layer.catchCause(() => Layer.effect(Peer, Effect.fail(unavailable(partition)))),
                ),
                wake: route.wake.pipe(
                  Effect.provide(context),
                  Effect.mapError(() => unavailable(partition)),
                ),
              })),
            ),
          ),
      }),
    ),
  )
