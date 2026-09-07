import { Effect, FiberMap, Layer, Ref, Schedule, type Scope, Semaphore } from "effect"
import { ActiveExecutions } from "./active-executions.js"
import { RuntimeUnavailable } from "../errors.js"
import { RunExecutor } from "./run-executor.js"
import { RunStore, type Service as RunStoreService } from "../run/store.js"
import { LocalScheduler, type DrainResult, type Options, type Service } from "./local-scheduler.js"
import type { ActivationFailure } from "../../durability/internal/runtime.js"

export const make = (
  options: Options,
  commandIdPrefix = options.workerId,
): Effect.Effect<Service & { readonly failure: Effect.Effect<never, ActivationFailure> }, never, RunStore | RunExecutor | ActiveExecutions | Scope.Scope> =>
  Effect.gen(function* () {
    const host = yield* RunExecutor
    const active = yield* ActiveExecutions
    const concurrency = options.concurrency
    const tickLock = yield* Semaphore.make(1)
    const executions = yield* FiberMap.make<string, void, ActivationFailure>()
    const selectionWindow = concurrency === undefined ? 64 : Math.max(concurrency * 2, 16)
    const reconcileWindow = 32
    let commandCounter = 0
    let queuedFirst = false

    const cancellingCursor = yield* Ref.make<string | undefined>(undefined)
    const runningCursor = yield* Ref.make<string | undefined>(undefined)
    const queuedCursor = yield* Ref.make<string | undefined>(undefined)

    const reconcileCancellation = (store: RunStoreService, runId: string, commandId: string) =>
      Effect.gen(function* () {
        yield* active.interrupt(runId)
        const stillActive = yield* active.active
        const admitted = yield* Effect.sync(() => new Set(Array.from(executions, ([id]) => id)))
        if (stillActive.has(runId) || admitted.has(runId)) return "deferred" as const
        const execution = yield* store.loadExecution(runId)
        if (execution.ownerId !== undefined) return "deferred" as const
        return yield* store.claimExecution({ commandId, runId, ownerId: options.workerId }).pipe(
          Effect.flatMap(host.execute),
          Effect.andThen(store.inspect(runId)),
          Effect.map((run) => (run.status === "cancelled" ? ("settled" as const) : ("deferred" as const))),
        )
      }).pipe(Effect.catchTags({
        "generalist/runtime/StaleClaim": () => Effect.succeed("stale" as const),
        "generalist/runtime/RunNotFound": () => Effect.succeed("inactive" as const),
        "generalist/runtime/RunTerminal": () => Effect.succeed("inactive" as const),
      }))

    const sweepCancelling = (store: RunStoreService, fuel: number, commandId: string) =>
      Effect.gen(function* () {
        if (fuel <= 0) return { processed: 0, hasMore: false }
        const cursor = yield* Ref.get(cancellingCursor)
        const query: Parameters<RunStoreService["list"]>[0] = {
          status: "cancelling",
          order: "oldest",
          limit: Math.min(reconcileWindow, fuel),
        }
        if (cursor !== undefined) Object.assign(query, { afterRunId: cursor })
        const cancelling = yield* store.list(query)
        const last = cancelling[cancelling.length - 1]
        yield* Ref.set(cancellingCursor, cancelling.length === query.limit ? last?.runId : undefined)
        yield* Effect.forEach(cancelling, (run) => reconcileCancellation(
          store, run.runId, `${commandId}:cancel:${JSON.stringify(run.runId)}`,
        ), {
          concurrency: concurrency ?? "unbounded",
          discard: true,
        })
        return { processed: cancelling.length, hasMore: cancelling.length === query.limit }
      })

    const selectReadyRuns = (store: RunStoreService, fuel: number, commandId: string, preferQueued: boolean) =>
      Effect.gen(function* () {
        if (fuel <= 0) return { processed: 0, hasMore: false }
        const priorRunning = yield* Ref.get(runningCursor)
        const runningQuery: Parameters<RunStoreService["list"]>[0] = {
          status: "running",
          order: "oldest",
          limit: Math.min(selectionWindow, fuel === 1 ? (preferQueued ? 0 : 1) : Math.ceil(fuel / 2)),
        }
        if (priorRunning !== undefined) Object.assign(runningQuery, { afterRunId: priorRunning })
        const running = runningQuery.limit === 0 ? [] : yield* store.list(runningQuery)
        const lastRunning = running[running.length - 1]
        const cursor = yield* Ref.get(queuedCursor)
        const queuedQuery: Parameters<RunStoreService["list"]>[0] = {
          status: "queued",
          order: "oldest",
          limit: Math.min(selectionWindow, fuel - running.length),
        }
        if (cursor !== undefined) Object.assign(queuedQuery, { afterRunId: cursor })
        const queued = queuedQuery.limit === 0 ? [] : yield* store.list(queuedQuery)
        const lastQueued = queued[queued.length - 1]
        if (queuedQuery.limit > 0) {
          yield* Ref.set(queuedCursor, queued.length === queuedQuery.limit ? lastQueued?.runId : undefined)
        }
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
                      (execution) => execution.ownerId === undefined,
                    ),
                    Effect.catchTag("generalist/runtime/RunNotFound", () => Effect.succeed(false)),
                  ),
        )
        const runningIds = new Set(running.map((run) => run.runId))
        const runningAvailable = available.some((run) => runningIds.has(run.runId))
        if (runningQuery.limit > 0) {
          yield* Ref.set(
            runningCursor,
            running.length === runningQuery.limit && !runningAvailable ? lastRunning?.runId : undefined,
          )
        }
        yield* Effect.forEach(
          concurrency === undefined ? available : available.slice(0, Math.max(0, concurrency - admitted.size)),
          (run) => {
            return FiberMap.run(
              executions,
              run.runId,
              store
                .claimExecution({ commandId: `${commandId}:execute:${JSON.stringify(run.runId)}`, runId: run.runId, ownerId: options.workerId })
                .pipe(Effect.flatMap(host.execute), Effect.catchTags({
                  "generalist/runtime/StaleClaim": () => Effect.void,
                  "generalist/runtime/RunNotFound": () => Effect.void,
                  "generalist/runtime/RunTerminal": () => Effect.void,
                })),
              { onlyIfMissing: true },
            )
          },
          { discard: true },
        )
        return {
          processed: running.length + queued.length,
          hasMore: (runningQuery.limit > 0 && running.length === runningQuery.limit) ||
            (queuedQuery.limit > 0 && queued.length === queuedQuery.limit),
        }
      })

    const drain: Service["drain"] = ({ fuel = 64 } = {}) => {
      const commandId = `${commandIdPrefix}:drain:${++commandCounter}`
      queuedFirst = !queuedFirst
      const preferQueued = fuel === 1 ? commandCounter % 3 === 2 : queuedFirst
      const cancellationFuel = fuel === 1 ? (commandCounter % 3 === 0 ? 1 : 0) : Math.ceil(fuel / 2)
      return Effect.gen(function* () {
        if (!Number.isSafeInteger(fuel) || fuel <= 0) {
          return yield* RuntimeUnavailable.make({ message: "scheduler fuel must be a positive safe integer" })
        }
        const store = yield* RunStore
        const cancelling = yield* sweepCancelling(store, cancellationFuel, commandId)
        const selected = yield* selectReadyRuns(store, fuel - cancelling.processed, commandId, preferQueued)
        return {
          processed: cancelling.processed + selected.processed,
          hasMore: cancelling.hasMore || selected.hasMore,
        } satisfies DrainResult
      }).pipe((effect) => tickLock.withPermit(effect))
    }

    return { ...LocalScheduler.of({
      tick: Effect.suspend(() => drain({ fuel: selectionWindow + reconcileWindow })).pipe(Effect.asVoid),
      drain,
      reconcileCancellation: (runId) => {
        const commandId = `${commandIdPrefix}:cancel:${++commandCounter}`
        return Effect.flatMap(RunStore, (store) => reconcileCancellation(store, runId, commandId))
      },
      idle: Effect.raceFirst(FiberMap.awaitEmpty(executions), FiberMap.join(executions)),
    }), failure: FiberMap.join(executions).pipe(Effect.andThen(Effect.never)) }
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
        Effect.sleep(poll).pipe(Effect.andThen(scheduler.tick), Effect.repeat(Schedule.spaced(poll)), Effect.ignore),
      )
      return scheduler
    }),
  )
