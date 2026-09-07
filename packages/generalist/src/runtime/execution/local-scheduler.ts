import { Context, Effect } from "effect"
import type { DurabilityFailure } from "../../durability/errors.js"
import { RuntimeUnavailable } from "../errors.js"
import { RunStore } from "../run/store.js"
import type { StartExecutionError } from "../service.js"

export interface Options {
  readonly workerId: string
  readonly concurrency?: number
  readonly pollInterval?: import("effect").Duration.Input
}

export interface DrainResult {
  /** Authoritative candidates examined, bounded by the supplied fuel. */
  readonly processed: number
  /** More work may remain; a full fuel window requires another drain. */
  readonly hasMore: boolean
  /** Earliest canonical timeout, schedule, or ownership expiry when known. */
  readonly nextDueAt?: number
}

export interface Service {
  readonly tick: Effect.Effect<void, StartExecutionError, RunStore>
  readonly drain: (options?: { readonly fuel?: number }) => Effect.Effect<DrainResult, StartExecutionError, RunStore>
  /** Reconcile one cancellation without scanning the store. */
  readonly reconcileCancellation: (
    runId: string,
  ) => Effect.Effect<"settled" | "deferred" | "inactive" | "stale", RuntimeUnavailable | DurabilityFailure, RunStore>
  /** Awaits every execution this scheduler admitted and has not yet observed finish. */
  readonly idle: Effect.Effect<void, StartExecutionError>
}

export class LocalScheduler extends Context.Service<LocalScheduler, Service>()(
  "generalist/runtime/execution/local-scheduler/LocalScheduler",
) {}
