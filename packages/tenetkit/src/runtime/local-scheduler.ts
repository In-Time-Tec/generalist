import { Context, Effect, FiberMap, Layer, Ref, Schedule, type Scope, Semaphore } from "effect"
import { ActiveExecutions } from "./active-executions.js"
import { AgentExecutionFailure, RuntimeUnavailable } from "./errors.js"
import { ExecutionHost } from "./execution-host.js"
import { RunStore } from "./run-store.js"
import type { Interface as RunStoreInterface } from "./run-store.js"

export interface Options {
  readonly workerId: string
  readonly concurrency?: number
  readonly pollInterval?: import("effect").Duration.Input
}

export type CancellationReconciliation = "settled" | "deferred" | "inactive" | "stale"

export interface Interface {
  readonly tick: Effect.Effect<void, never, RunStore>
  /** Reconcile one cancellation without scanning the store. */
  readonly reconcileCancellation: (
    runId: string,
  ) => Effect.Effect<CancellationReconciliation, RuntimeUnavailable, RunStore>
  /** Awaits every execution this scheduler admitted and has not yet observed finish. */
  readonly idle: Effect.Effect<void>
}

export class LocalScheduler extends Context.Service<LocalScheduler, Interface>()(
  "tenetkit/runtime/local-scheduler/LocalScheduler",
) {}

export const make = (
  options: Options,
): Effect.Effect<Interface, never, RunStore | ExecutionHost | ActiveExecutions | Scope.Scope> =>
  Effect.gen(function* () {
    const host = yield* ExecutionHost
    const active = yield* ActiveExecutions
    const concurrency = options.concurrency
    const tickLock = yield* Semaphore.make(1)
    const executions = yield* FiberMap.make<string, void, never>()
    const selectionWindow = concurrency === undefined ? 64 : Math.max(concurrency * 2, 16)
    const reconcileWindow = 32

    const cancellingCursor = yield* Ref.make<string | undefined>(undefined)
    const runningCursor = yield* Ref.make<string | undefined>(undefined)
    const queuedCursor = yield* Ref.make<string | undefined>(undefined)

    const reconcileCancellation = (store: RunStoreInterface, runId: string) =>
      Effect.gen(function* () {
        yield* active.interrupt(runId)
        const stillActive = yield* active.active
        const admitted = yield* Effect.sync(() => new Set(Array.from(executions, ([id]) => id)))
        if (stillActive.has(runId) || admitted.has(runId)) return "deferred" as const
        return yield* store.loadExecution(runId).pipe(
          Effect.flatMap((execution) =>
            execution.ownerId === undefined
              ? store.cancel({ runId })
              : store.fail({
                  runId,
                  ownerId: execution.ownerId,
                  attemptFence: execution.attemptFence,
                  error: AgentExecutionFailure.make({ message: "execution interrupted" }),
                }),
          ),
          Effect.as("settled" as const),
          Effect.catchTag("tenetkit/runtime/StaleClaim", () => Effect.succeed("stale" as const)),
          Effect.catchTag("tenetkit/runtime/RunNotFound", () => Effect.succeed("inactive" as const)),
          Effect.catchTag("tenetkit/runtime/RunTerminal", () => Effect.succeed("inactive" as const)),
          Effect.mapError((error) =>
            error instanceof RuntimeUnavailable
              ? error
              : RuntimeUnavailable.make({ message: "cancellation reconciliation storage failed" }),
          ),
        )
      })

    const sweepCancelling = (store: RunStoreInterface) =>
      Effect.gen(function* () {
        const cursor = yield* Ref.get(cancellingCursor)
        const cancelling = yield* store.list({
          status: "cancelling",
          order: "oldest",
          limit: reconcileWindow,
          ...(cursor === undefined ? {} : { afterRunId: cursor }),
        })
        const last = cancelling[cancelling.length - 1]
        yield* Ref.set(cancellingCursor, cancelling.length === reconcileWindow ? last?.runId : undefined)
        yield* Effect.forEach(cancelling, (run) => reconcileCancellation(store, run.runId).pipe(Effect.ignore), {
          concurrency: concurrency ?? "unbounded",
          discard: true,
        })
      })

    const selectReadyRuns = (store: RunStoreInterface) =>
      Effect.gen(function* () {
        const priorRunning = yield* Ref.get(runningCursor)
        const running = yield* store.list({
          status: "running",
          order: "oldest",
          limit: selectionWindow,
          ...(priorRunning === undefined ? {} : { afterRunId: priorRunning }),
        })
        const lastRunning = running[running.length - 1]
        const cursor = yield* Ref.get(queuedCursor)
        const queued = yield* store.list({
          status: "queued",
          order: "oldest",
          limit: selectionWindow,
          ...(cursor === undefined ? {} : { afterRunId: cursor }),
        })
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
    }).pipe(Effect.ignore, tickLock.withPermit)

    return LocalScheduler.of({
      tick,
      reconcileCancellation: (runId) => Effect.flatMap(RunStore, (store) => reconcileCancellation(store, runId)),
      idle: FiberMap.awaitEmpty(executions),
    })
  })

export const layer = (
  options: Options,
): Layer.Layer<LocalScheduler, never, RunStore | ExecutionHost | ActiveExecutions> =>
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
