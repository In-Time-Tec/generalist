import { Effect, Layer } from "effect"
import * as Durability from "../../../durability/index.js"
import { layer as r2Layer, type Bucket } from "../../../durability/r2.js"
import { LocalScheduler } from "../../../runtime/execution/local-scheduler.js"

/** @experimental A partition's canonical R2 binding and explicit namespace. */
export interface Options extends Durability.Options {
  readonly bucket: Bucket
}

/** @experimental Native R2 persistence; Durable Object storage is never runtime authority. */
export const layerRunStore = ({ bucket, ...options }: Options) =>
  Durability.layerRunStore(options).pipe(Layer.provide(r2Layer(bucket)))

/** @experimental Scoped execution host. Alarm-driven hosts use schedulerMode: "external". */
export const layer = ({ bucket, ...options }: Options) =>
  Layer.effectDiscard(Durability.activate).pipe(
    Layer.provideMerge(Durability.layer(options).pipe(Layer.provide(r2Layer(bucket)))),
  )

/**
 * @experimental Run from an independent Cron Trigger or queue consumer for every configured partition.
 * Alarms only accelerate this reconciliation: losing an alarm cannot erase canonical work.
 * The application supplies Crypto and its pinned ExecutableResolver, just as for the Durable Object.
 */
export const reconcile = (options: Options, fuel = 64) =>
  Effect.scoped(
    Effect.gen(function* () {
      const scheduler = yield* LocalScheduler
      return yield* scheduler.drain({ fuel })
    }).pipe(Effect.provide(layer({ ...options, schedulerMode: "external" }))),
  )
