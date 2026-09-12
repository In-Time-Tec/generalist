import { Context, Effect } from "effect"
import type { DurabilityFailure } from "../../durability/errors.js"
import { RuntimeOwnershipLost, RuntimeRetired, RuntimeUnavailable } from "../errors.js"
import { RunStore } from "../run/store.js"
import type { StartExecutionError } from "../service.js"
import type { ScheduleInvalid } from "./trigger/schedule.js"

/** Typed scheduler failures: run admission plus an unrepresentable stored recurrence. */
export type SchedulerError = StartExecutionError | ScheduleInvalid

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

/** Scheduler failures once the owning Runtime incarnation retired or lost ownership. */
export type SchedulerLifecycleError = RuntimeOwnershipLost | RuntimeRetired

export interface Service {
  readonly tick: Effect.Effect<void, SchedulerError | SchedulerLifecycleError, RunStore>
  readonly drain: (options?: {
    readonly fuel?: number
  }) => Effect.Effect<DrainResult, SchedulerError | SchedulerLifecycleError, RunStore>
  /** Reconcile one cancellation without scanning the store. */
  readonly reconcileCancellation: (
    runId: string,
  ) => Effect.Effect<
    "settled" | "deferred" | "inactive" | "stale",
    RuntimeUnavailable | DurabilityFailure | SchedulerLifecycleError,
    RunStore
  >
  /** Awaits every execution this scheduler admitted and has not yet observed finish. */
  readonly idle: Effect.Effect<void, SchedulerError | SchedulerLifecycleError>
}

export class LocalScheduler extends Context.Service<LocalScheduler, Service>()(
  "generalist/runtime/execution/local-scheduler/LocalScheduler",
) {}
