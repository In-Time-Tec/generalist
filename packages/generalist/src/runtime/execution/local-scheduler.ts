import { Context, Effect } from "effect"
import { RuntimeUnavailable } from "../errors.js"
import { RunStore } from "../run/store.js"

export interface Options {
  readonly workerId: string
  readonly concurrency?: number
  readonly pollInterval?: import("effect").Duration.Input
}

export interface Service {
  readonly tick: Effect.Effect<void, never, RunStore>
  /** Reconcile one cancellation without scanning the store. */
  readonly reconcileCancellation: (
    runId: string,
  ) => Effect.Effect<"settled" | "deferred" | "inactive" | "stale", RuntimeUnavailable, RunStore>
  /** Awaits every execution this scheduler admitted and has not yet observed finish. */
  readonly idle: Effect.Effect<void>
}

export class LocalScheduler extends Context.Service<LocalScheduler, Service>()(
  "generalist/runtime/execution/local-scheduler/LocalScheduler",
) {}
