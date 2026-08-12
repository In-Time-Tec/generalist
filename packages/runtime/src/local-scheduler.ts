import { Context, Effect, FiberMap, Layer, Ref, Schedule, type Scope, Semaphore } from "effect"
import { ActiveExecutions } from "./active-executions.js"
import { AgentExecutionFailure } from "./errors.js"
import { ExecutionHost } from "./execution-host.js"
import { RunStore } from "./run-store.js"
import type { Interface as RunStoreInterface } from "./run-store.js"

export interface Options {
  readonly workerId: string
  readonly concurrency?: number
  readonly pollInterval?: import("effect").Duration.Input
}

export interface Interface {
  readonly tick: Effect.Effect<void, never, RunStore>
  /** Awaits every execution this scheduler admitted and has not yet observed finish. */
  readonly idle: Effect.Effect<void>
}

export class LocalScheduler extends Context.Service<LocalScheduler, Interface>()(
  "@batonfx/runtime/local-scheduler/LocalScheduler",
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
        yield* Effect.forEach(cancelling, (run) => active.interrupt(run.runId), {
          concurrency: "unbounded",
          discard: true,
        })
        const stillActive = yield* active.active
        const admitted = yield* Effect.sync(() => new Set(Array.from(executions, ([runId]) => runId)))
        yield* Effect.forEach(
          cancelling,
          (run) =>
            stillActive.has(run.runId) || admitted.has(run.runId)
              ? Effect.void
              : store.loadExecution(run.runId).pipe(
                  Effect.flatMap((execution) => {
                    if (execution.ownerId === undefined) return store.cancel({ runId: run.runId })
                    return store.fail({
                      runId: run.runId,
                      ownerId: execution.ownerId,
                      attemptFence: execution.attemptFence,
                      error: AgentExecutionFailure.make({ message: "execution interrupted" }),
                    })
                  }),
                  Effect.ignore,
                ),
          { concurrency: concurrency ?? "unbounded", discard: true },
        )
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
        const info = yield* store.info
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
                      (execution) =>
                        info.backend === "sqlite" ||
                        execution.ownerId === undefined ||
                        execution.ownerId === options.workerId,
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

    return LocalScheduler.of({ tick, idle: FiberMap.awaitEmpty(executions) })
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
