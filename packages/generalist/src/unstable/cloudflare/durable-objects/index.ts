import { Effect, Function, Layer, Predicate } from "effect"
import type { Options as DurabilityOptions } from "../../../durability/internal/runtime.js"
import { activate } from "../../../durability/activation.js"
import { layerRunStore as layerRunStoreDurability } from "../../../runtime/state/store.js"
import { layer as layerDurability } from "../../../runtime/state/layer.js"
import { layer as r2Layer, type Bucket } from "../../../durability/r2.js"
import { LocalScheduler, type DrainResult } from "../../../runtime/execution/local-scheduler.js"
import type { StartExecutionError } from "../../../runtime/service.js"

/** @experimental A partition's canonical R2 binding and explicit namespace. */
export interface Options extends DurabilityOptions {
  readonly bucket: Bucket
}

/** @experimental Native R2 persistence; Durable Object storage is never runtime authority. */
export const layerRunStore = ({ bucket, ...options }: Options) =>
  layerRunStoreDurability(options).pipe(Layer.provide(r2Layer(bucket)))

/** @experimental Scoped execution host. Alarm-driven hosts use schedulerMode: "external". */
export const layer = ({ bucket, ...options }: Options) =>
  Layer.effectDiscard(activate).pipe(Layer.provideMerge(layerDurability(options).pipe(Layer.provide(r2Layer(bucket)))))

/**
 * @experimental Run from an independent Cron Trigger or queue consumer for every configured partition.
 * Alarms only accelerate this reconciliation: losing an alarm cannot erase canonical work.
 * The application supplies Crypto and its pinned ExecutableResolver, just as for the Durable Object.
 */
export const reconcile: {
  (options: Options, fuel?: number): Reconciliation
  (fuel?: number): (options: Options) => Reconciliation
} = Function.dual(
  (args) => Predicate.isObject(args[0]),
  (options: Options, fuel: number = 64): Reconciliation =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(layer({ ...options, schedulerMode: "external" }))
        return yield* Effect.gen(function* () {
          const scheduler = yield* LocalScheduler
          return yield* scheduler.drain({ fuel })
        }).pipe(Effect.provideContext(services))
      }),
    ),
)

type Reconciliation = Effect.Effect<
  DrainResult,
  StartExecutionError | Layer.Error<ReturnType<typeof layer>>,
  Layer.Services<ReturnType<typeof layer>>
>
