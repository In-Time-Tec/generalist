import { Context, Duration, Effect, Layer, Ref, Schedule } from "effect"
import type { RuntimeUnavailable } from "../../errors.js"
import { RunClaims, type ClaimedRun } from "../run-claims.js"
import { ExecutionHost } from "../../execution-host.js"
import { RunStore } from "../../run-store.js"
import { isTerminal } from "../../run.js"

export interface WorkerOptions {
  readonly workerId: string
  readonly concurrency?: number
  readonly lease?: Duration.Input
  readonly pollInterval?: Duration.Input
  /** Upper bound between a persisted cancellation and local interruption of the claimed Run. */
  readonly cancellationInterval?: Duration.Input
}

export interface Interface {
  readonly workerId: string
  readonly claimed: Effect.Effect<ReadonlyArray<ClaimedRun>>
  readonly tick: Effect.Effect<ReadonlyArray<ClaimedRun>, RuntimeUnavailable>
  readonly execute: Effect.Effect<ReadonlyArray<ClaimedRun>, RuntimeUnavailable>
}

export class RuntimeWorker extends Context.Service<RuntimeWorker, Interface>()(
  "@batonfx/runtime/sql/postgres/worker/RuntimeWorker",
) {}

export const makeWorker = (
  options: WorkerOptions,
): Effect.Effect<Interface, never, RunClaims | ExecutionHost | RunStore> =>
  Effect.gen(function* () {
    const claims = yield* RunClaims
    const host = yield* ExecutionHost
    const store = yield* RunStore
    const concurrency = options.concurrency ?? 1
    const lease = options.lease ?? "30 seconds"
    const activeRef = yield* Ref.make<ReadonlyArray<ClaimedRun>>([])
    const renewalInterval = Duration.millis(Math.max(1, Duration.toMillis(lease) / 2))
    const cancellationInterval = options.cancellationInterval ?? "100 millis"

    /**
     * Interrupt a claimed Run when cancellation was persisted by another process.
     * The delay is bounded by `cancellationInterval`.
     */
    const watchCancellation = (runId: string): Effect.Effect<void, RuntimeUnavailable> =>
      Effect.sleep(cancellationInterval).pipe(
        Effect.andThen(store.inspect(runId)),
        Effect.flatMap((run) =>
          run.status === "cancelling"
            ? host.interrupt(runId)
            : isTerminal(run.status)
              ? Effect.void
              : watchCancellation(runId),
        ),
        Effect.catchTag("@batonfx/runtime/RunNotFound", () => Effect.void),
      )

    const executeClaim = (item: ClaimedRun): Effect.Effect<void, RuntimeUnavailable> => {
      const renew: Effect.Effect<void, RuntimeUnavailable> = Effect.sleep(renewalInterval).pipe(
        Effect.andThen(
          claims.refreshLease({
            runId: item.run.runId,
            workerId: options.workerId,
            attemptFence: item.attemptFence,
            lease,
          }),
        ),
        Effect.flatMap((refreshed) => (refreshed ? renew : Effect.void)),
      )
      return host
        .execute({ runId: item.run.runId, ownerId: options.workerId, attemptFence: item.attemptFence })
        .pipe(Effect.raceFirst(renew), Effect.raceFirst(watchCancellation(item.run.runId)))
    }

    const tick: Effect.Effect<ReadonlyArray<ClaimedRun>, RuntimeUnavailable> = Effect.gen(function* () {
      const active = yield* Ref.get(activeRef)
      const refreshed: Array<ClaimedRun> = []
      for (const item of active) {
        const ok = yield* claims.refreshLease({
          runId: item.run.runId,
          workerId: options.workerId,
          attemptFence: item.attemptFence,
          lease,
        })
        if (ok) refreshed.push(item)
      }
      const free = Math.max(0, concurrency - refreshed.length)
      const claimed =
        free === 0
          ? []
          : yield* claims.claimReadyRuns({
              workerId: options.workerId,
              limit: free,
              lease,
            })
      const next = [...refreshed, ...claimed]
      yield* Ref.set(activeRef, next)
      return next
    })

    return {
      workerId: options.workerId,
      claimed: Ref.get(activeRef),
      tick,
      execute: Effect.gen(function* () {
        const claimed = yield* tick
        yield* Effect.forEach(claimed, executeClaim, { concurrency, discard: true })
        return claimed
      }),
    }
  })

export const layerWorker = (
  options: WorkerOptions,
): Layer.Layer<RuntimeWorker, never, RunClaims | ExecutionHost | RunStore> =>
  Layer.effect(RuntimeWorker, makeWorker(options).pipe(Effect.map((service) => RuntimeWorker.of(service))))

export const layerWorkerLoop = (
  options: WorkerOptions,
): Layer.Layer<RuntimeWorker, never, RunClaims | ExecutionHost | RunStore> =>
  Layer.effect(
    RuntimeWorker,
    Effect.gen(function* () {
      const worker = yield* makeWorker(options)
      const poll = options.pollInterval ?? "200 millis"
      yield* Effect.forkDetach(worker.execute.pipe(Effect.ignore, Effect.repeat(Schedule.spaced(poll))))
      return RuntimeWorker.of(worker)
    }),
  )
