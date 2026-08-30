import { Context, Effect, FiberMap, Layer, Ref, Schedule, Schema, type Scope, Semaphore } from "effect"
import { ActiveExecutions } from "./active-executions.js"
import { RuntimeUnavailable } from "../errors.js"
import { RunExecutor } from "./run-executor.js"
import { RunStore, type Service as RunStoreService } from "../run/store.js"

export interface Options {
  readonly workerId: string
  readonly concurrency?: number
  readonly pollInterval?: import("effect").Duration.Input
}

export type CancellationReconciliation = "settled" | "deferred" | "inactive" | "stale"

export interface Service {
  readonly tick: Effect.Effect<void, never, RunStore>
  /** Reconcile one cancellation without scanning the store. */
  readonly reconcileCancellation: (
    runId: string,
  ) => Effect.Effect<CancellationReconciliation, RuntimeUnavailable, RunStore>
  /** Awaits every execution this scheduler admitted and has not yet observed finish. */
  readonly idle: Effect.Effect<void>
}

export class LocalScheduler extends Context.Service<LocalScheduler, Service>()(
  "tenetkit/runtime/execution/local-scheduler/LocalScheduler",
) {}

export const make = (
  options: Options,
): Effect.Effect<Service, never, RunStore | RunExecutor | ActiveExecutions | Scope.Scope> =>
  Effect.gen(function* () {
    const host = yield* RunExecutor
    const active = yield* ActiveExecutions
    const concurrency = options.concurrency
    const tickLock = yield* Semaphore.make(1)
    const executions = yield* FiberMap.make<string, void, never>()
    const selectionWindow = concurrency === undefined ? 64 : Math.max(concurrency * 2, 16)
    const reconcileWindow = 32

    const cancellingCursor = yield* Ref.make<string | undefined>(undefined)
    const runningCursor = yield* Ref.make<string | undefined>(undefined)
    const queuedCursor = yield* Ref.make<string | undefined>(undefined)

    const reconcileCancellation = (store: RunStoreService, runId: string) =>
      Effect.gen(function* () {
        yield* active.interrupt(runId)
        const stillActive = yield* active.active
        const admitted = yield* Effect.sync(() => new Set(Array.from(executions, ([id]) => id)))
        if (stillActive.has(runId) || admitted.has(runId)) return "deferred" as const
        return yield* store.claimExecution({ runId, ownerId: options.workerId }).pipe(
          Effect.flatMap(host.execute),
          Effect.andThen(store.inspect(runId)),
          Effect.map((run) => (run.status === "cancelled" ? ("settled" as const) : ("deferred" as const))),
          Effect.catchTags({
            "tenetkit/runtime/StaleClaim": () => Effect.succeed("stale" as const),
            "tenetkit/runtime/RunNotFound": () => Effect.succeed("inactive" as const),
            "tenetkit/runtime/RunTerminal": () => Effect.succeed("inactive" as const),
          }),
          Effect.mapError((error) =>
            Schema.is(RuntimeUnavailable)(error)
              ? error
              : RuntimeUnavailable.make({ message: "cancellation reconciliation storage failed" }),
          ),
        )
      })

    const sweepCancelling = (store: RunStoreService) =>
      Effect.gen(function* () {
        const cursor = yield* Ref.get(cancellingCursor)
        const query: Parameters<RunStoreService["list"]>[0] = {
          status: "cancelling",
          order: "oldest",
          limit: reconcileWindow,
        }
        if (cursor !== undefined) Object.assign(query, { afterRunId: cursor })
        const cancelling = yield* store.list(query)
        const last = cancelling[cancelling.length - 1]
        yield* Ref.set(cancellingCursor, cancelling.length === reconcileWindow ? last?.runId : undefined)
        yield* Effect.forEach(cancelling, (run) => reconcileCancellation(store, run.runId).pipe(Effect.ignore), {
          concurrency: concurrency ?? "unbounded",
          discard: true,
        })
      })

    const selectReadyRuns = (store: RunStoreService) =>
      Effect.gen(function* () {
        const priorRunning = yield* Ref.get(runningCursor)
        const runningQuery: Parameters<RunStoreService["list"]>[0] = {
          status: "running",
          order: "oldest",
          limit: selectionWindow,
        }
        if (priorRunning !== undefined) Object.assign(runningQuery, { afterRunId: priorRunning })
        const running = yield* store.list(runningQuery)
        const lastRunning = running[running.length - 1]
        const cursor = yield* Ref.get(queuedCursor)
        const queuedQuery: Parameters<RunStoreService["list"]>[0] = {
          status: "queued",
          order: "oldest",
          limit: selectionWindow,
        }
        if (cursor !== undefined) Object.assign(queuedQuery, { afterRunId: cursor })
        const queued = yield* store.list(queuedQuery)
        const lastQueued = queued[queued.length - 1]
        yield* Ref.set(queuedCursor, queued.length === selectionWindow ? lastQueued?.runId : undefined)
        // Re-admitting a Run this process is already executing would fence out and interrupt that execution.
        const executing = yield* active.active
        const admitted = yield* Effect.sync(() => new Set(Array.from(executions, ([runId]) => runId)))
        const available = yield* Effect.filter(
          [...running, ...queued.filter((run) => run.parentRunId !== undefined)],
          (run) =>
            executing.has(run.runId) || admitted.has(run.runId)
              ? Effect.succeed(false)
              : store
                  .loadExecution(run.runId)
                  .pipe(
                    Effect.map(
                      (execution) => execution.ownerId === undefined || execution.ownerId === options.workerId,
                    ),
                  ),
        )
        const runningIds = new Set(running.map((run) => run.runId))
        const runningAvailable = available.some((run) => runningIds.has(run.runId))
        yield* Ref.set(
          runningCursor,
          running.length === selectionWindow && !runningAvailable ? lastRunning?.runId : undefined,
        )
        yield* Effect.forEach(
          concurrency === undefined ? available : available.slice(0, Math.max(0, concurrency - admitted.size)),
          (run) =>
            FiberMap.run(
              executions,
              run.runId,
              store
                .claimExecution({ runId: run.runId, ownerId: options.workerId })
                .pipe(Effect.flatMap(host.execute), Effect.ignore),
              { onlyIfMissing: true },
            ),
          { discard: true },
        )
      })

    const tick = Effect.gen(function* () {
      const store = yield* RunStore
      yield* sweepCancelling(store)
      yield* selectReadyRuns(store)
    }).pipe(Effect.ignore, (effect) => tickLock.withPermit(effect))

    return LocalScheduler.of({
      tick,
      reconcileCancellation: (runId) => Effect.flatMap(RunStore, (store) => reconcileCancellation(store, runId)),
      idle: FiberMap.awaitEmpty(executions),
    })
  })

export const layer = (
  options: Options,
): Layer.Layer<LocalScheduler, never, RunStore | RunExecutor | ActiveExecutions> =>
  Layer.effect(
    LocalScheduler,
    Effect.gen(function* () {
      const scheduler = yield* make(options)
      const poll = options.pollInterval ?? "250 millis"
      yield* Effect.forkScoped(
        Effect.sleep(poll).pipe(Effect.andThen(scheduler.tick), Effect.repeat(Schedule.spaced(poll))),
      )
      return scheduler
    }),
  )
