import { Clock, Context, Crypto, Effect, Function, Layer, Semaphore } from "effect"
import type { ActorContext } from "rivetkit"
import { activate } from "../../../durability/activation.js"
import type { ActivationFailure, Options } from "../../../durability/internal/runtime.js"
import { layer, type RuntimeServices } from "../../../runtime/state/layer.js"
import type { ObjectStore } from "../../../durability/object-store.js"
import { RuntimeUnavailable } from "../../../runtime/errors.js"
import type { ExecutableResolver } from "../../../runtime/executable/resolver.js"
import { type DrainResult, LocalScheduler } from "../../../runtime/execution/local-scheduler.js"

/** @experimental Rivet capabilities used only as wake hints. */
export type RuntimeActorContext = Pick<
  ActorContext<undefined, undefined, undefined, undefined, undefined, undefined>,
  "actorId" | "schedule" | "cron"
>

/** @experimental Diagnostic identity for an application-owned wake scope, not storage authority. */
export interface ActorRuntimeContext {
  readonly ownerId: string
}

/** @experimental Runtime construction inside an application-owned actor wake scope. */
export interface ActorRuntimeOptions extends Omit<Options, "schedulerMode"> {
  readonly drainFuel?: number
  readonly recoveryIntervalMillis?: number
  readonly drainAction: string
  readonly initialize?: (context: ActorRuntimeContext) => Effect.Effect<void, ActivationFailure, RuntimeServices>
  readonly reconcile?: (
    context: ActorRuntimeContext,
  ) => Effect.Effect<number | undefined, ActivationFailure, RuntimeServices>
}

/** @experimental Operations sharing one object-native Runtime and actor-owned scope. */
export class ActorRuntime extends Context.Service<
  ActorRuntime,
  {
    readonly ownerId: string
    readonly notify: Effect.Effect<void>
    readonly guarded: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
    readonly drain: Effect.Effect<DrainResult, ActivationFailure, RuntimeServices>
  }
>()("generalist/unstable/rivet/actors/runtime/ActorRuntime") {}

/** @experimental Services installed in one actor-owned ManagedRuntime. */
export type ActorRuntimeServices = RuntimeServices | ActorRuntime

const notify = (context: RuntimeActorContext, action: string, delayMillis = 0) =>
  Effect.tryPromise({
    try: () => context.schedule.after(Math.max(0, delayMillis), action),
    catch: () => RuntimeUnavailable.make({ message: "Rivet Runtime doorbell failed" }),
  }).pipe(
    Effect.asVoid,
    Effect.catchTag("generalist/runtime/RuntimeUnavailable", () =>
      Effect.logWarning("Rivet Runtime doorbell failed; periodic recovery remains armed"),
    ),
  )

const makeHost = Effect.fn("RivetActorRuntime.makeHost")(function* (
  context: RuntimeActorContext,
  options: ActorRuntimeOptions,
) {
  const crypto = yield* Crypto.Crypto
  const ownerId = `${context.actorId}:${yield* crypto.randomUUIDv4}`
  const activationContext = { ownerId }
  yield* Effect.tryPromise({
    try: () =>
      context.cron.every({
        name: "generalist-runtime-recovery",
        interval: Math.max(5_000, Math.floor(options.recoveryIntervalMillis ?? 5_000)),
        action: options.drainAction,
        maxHistory: 0,
      }),
    catch: () => RuntimeUnavailable.make({ message: "Rivet Runtime periodic recovery could not be armed" }),
  })
  yield* options.initialize?.(activationContext) ?? Effect.void
  yield* activate
  const admission = yield* Semaphore.make(1)
  const execution = yield* Semaphore.make(1)
  const guarded = admission.withPermits(1)
  const reconcile = guarded(
    Effect.gen(function* () {
      if (options.reconcile !== undefined) return yield* options.reconcile(activationContext)
      return undefined
    }),
  )
  const drain = execution.withPermits(1)(
    Effect.gen(function* () {
      yield* reconcile
      const scheduler = yield* LocalScheduler
      const result = yield* scheduler.drain({ fuel: Math.max(1, Math.floor(options.drainFuel ?? 64)) })
      const productDue = yield* reconcile
      let nextDueAt = result.nextDueAt
      if (productDue !== undefined && (nextDueAt === undefined || productDue < nextDueAt)) nextDueAt = productDue
      if (nextDueAt !== undefined) {
        const now = yield* Clock.currentTimeMillis
        yield* notify(context, options.drainAction, result.hasMore ? 0 : nextDueAt - now)
        return { ...result, nextDueAt }
      }
      return result
    }),
  )
  yield* drain
  return ActorRuntime.of({ ownerId, notify: notify(context, options.drainAction), guarded, drain })
})

const layerActorRuntimeImpl = (context: RuntimeActorContext, options: ActorRuntimeOptions) => {
  const {
    drainAction: _drainAction,
    drainFuel: _drainFuel,
    recoveryIntervalMillis: _recoveryInterval,
    initialize: _initialize,
    reconcile: _reconcile,
    ...storeOptions
  } = options
  return Layer.effect(ActorRuntime, makeHost(context, options)).pipe(
    Layer.provideMerge(layer({ ...storeOptions, schedulerMode: "external" })),
  )
}

/** @experimental Build once in onWake and dispose the owning ManagedRuntime in onSleep/onDestroy. */
export const layerActorRuntime: {
  (
    context: RuntimeActorContext,
    options: ActorRuntimeOptions,
  ): Layer.Layer<ActorRuntimeServices, ActivationFailure, ObjectStore | Crypto.Crypto | ExecutableResolver>
  (
    options: ActorRuntimeOptions,
  ): (
    context: RuntimeActorContext,
  ) => Layer.Layer<ActorRuntimeServices, ActivationFailure, ObjectStore | Crypto.Crypto | ExecutableResolver>
} = Function.dual(2, layerActorRuntimeImpl)
