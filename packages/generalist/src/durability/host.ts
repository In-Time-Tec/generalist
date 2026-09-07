import { Effect, Layer, Option, Schema } from "effect"
import { type Scope, type Location, page as pageDiscovery, inspect } from "./discovery.js"
import type { ActivationFailure, Options as DurabilityOptions } from "./internal/runtime.js"
import { layer } from "../runtime/state/layer.js"
import { activate } from "./activation.js"
import type { ExecutableResolver } from "../runtime/executable/resolver.js"
import { type DrainResult, LocalScheduler } from "../runtime/execution/local-scheduler.js"
import { DurabilityFailure } from "./errors.js"

/** Application-authorized runtime configuration, never supplied by a discovery marker. @experimental */
export interface Configuration
  extends Omit<DurabilityOptions, "environment" | "tenant" | "partition" | "schedulerMode"> {
  readonly resolver: Layer.Layer<ExecutableResolver, ActivationFailure>
}

/** One bounded discovery page; a continuation resumes listing, not ownership. @experimental */
export interface Options<E = never, R = never> extends Scope {
  readonly cursor?: string
  readonly drainFuel?: number
  readonly authorize: (location: Location) => Effect.Effect<Option.Option<Configuration>, E, R>
}

/** A location is never activated merely because its marker exists. @experimental */
export type PartitionResult =
  | { readonly location: Location; readonly status: "denied" | "uncommitted" }
  | { readonly location: Location; readonly status: "drained"; readonly drain: DrainResult }

/** Completed page results; revisit the tenant from the beginning after consuming the continuation. @experimental */
export interface PageResult {
  readonly partitions: ReadonlyArray<PartitionResult>
  readonly cursor?: string
}

const Fuel = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 }))

/**
 * Discover, validate, activate, drain, and close at most one provider page (1000 locations).
 * Locations run sequentially in independent scopes. Failure or interruption closes the current host;
 * retry the same page after resolving the failure. Exact committed work is not redispatched.
 * Call again from the host's periodic recovery lifecycle, even when no notification arrives.
 * @experimental
 */
export const reconcilePage = <E, R>(options: Options<E, R>) =>
  Effect.gen(function* () {
    const fuel = yield* Schema.decodeEffect(Fuel)(options.drainFuel ?? 64).pipe(
      Effect.mapError(() =>
        DurabilityFailure.make({
          reason: "configuration",
          message: "Discovery host drain fuel must be an integer between 1 and 1000",
        }),
      ),
    )
    const page = yield* pageDiscovery(options)
    const partitions: Array<PartitionResult> = []
    for (const location of page.locations) {
      const authorization = yield* options.authorize(location)
      if (Option.isNone(authorization)) {
        partitions.push({ location, status: "denied" })
        continue
      }
      const inspection = yield* inspect(location)
      if (inspection.status === "uncommitted") {
        partitions.push({ location, status: "uncommitted" })
        continue
      }
      const { resolver, ...configuration } = authorization.value
      const drain = yield* Effect.scoped(
        Effect.gen(function* () {
          const services = yield* Layer.build(
            layer({
              ...configuration,
              ...location,
              schedulerMode: "external",
            }).pipe(Layer.provide(resolver)),
          )
          yield* activate.pipe(Effect.provide(services))
          return yield* Effect.flatMap(LocalScheduler, (scheduler) => scheduler.drain({ fuel })).pipe(
            Effect.provide(services),
          )
        }),
      )
      partitions.push({ location, status: "drained", drain })
    }
    const result: PageResult = { partitions }
    if (page.cursor !== undefined) return { ...result, cursor: page.cursor }
    return result
  })
