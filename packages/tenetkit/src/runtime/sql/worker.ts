import { Cause, Clock, Context, Duration, Effect, Exit, FiberMap, Layer, Ref, Scope } from "effect"
import type { RuntimeUnavailable } from "../errors.js"
import { RunClaims, type ClaimedRun } from "./run-claims.js"
import { ExecutionHost } from "../execution-host.js"
import { RunStore } from "../run-store.js"
import { isTerminal } from "../run.js"

export interface WorkerOptions {
  readonly workerId: string
  readonly concurrency?: number
  readonly lease?: Duration.Input
  readonly pollInterval?: Duration.Input
  readonly cancellationInterval?: Duration.Input
  readonly onClaim?: (claim: ClaimedRun) => Effect.Effect<void>
}

export interface WorkerFailure {
  readonly at: number
  readonly message: string
}

export type WorkerPoll =
  | { readonly _tag: "Starting" }
  | { readonly _tag: "Succeeded"; readonly at: number }
  | { readonly _tag: "Failed"; readonly at: number; readonly message: string }

export interface WorkerStatus {
  readonly poll: WorkerPoll
  readonly lastSuccessfulPollAt: number | undefined
  readonly lastFailure: WorkerFailure | undefined
  readonly active: number
  readonly capacity: number
  readonly oldestClaimAt: number | undefined
}

interface ActiveClaim {
  readonly attemptFence: number
  readonly claimedAt: number
}

interface WorkerState {
  readonly poll: WorkerPoll
  readonly lastSuccessfulPollAt: number | undefined
  readonly lastFailure: WorkerFailure | undefined
  readonly claims: ReadonlyMap<string, ActiveClaim>
}

export interface Interface {
  readonly workerId: string
  readonly active: Effect.Effect<number>
  readonly status: Effect.Effect<WorkerStatus>
  readonly poll: Effect.Effect<ReadonlyArray<ClaimedRun>, RuntimeUnavailable>
  readonly idle: Effect.Effect<void>
  readonly run: Effect.Effect<never>
}

export class RuntimeWorker extends Context.Service<RuntimeWorker, Interface>()(
  "tenetkit/runtime/sql/worker/RuntimeWorker",
) {}

export const makeWorker = (
  options: WorkerOptions,
): Effect.Effect<Interface, never, RunClaims | ExecutionHost | RunStore | Scope.Scope> =>
  Effect.gen(function* () {
    const claims = yield* RunClaims
    const host = yield* ExecutionHost
    const store = yield* RunStore
    const concurrency = options.concurrency ?? 1
    const lease = options.lease ?? "30 seconds"
    const pollInterval = options.pollInterval ?? "200 millis"
    const active = yield* FiberMap.make<string, void, never>()
    const state = yield* Ref.make<WorkerState>({
      poll: { _tag: "Starting" },
      lastSuccessfulPollAt: undefined,
      lastFailure: undefined,
      claims: new Map(),
    })
    const renewalInterval = Duration.millis(Math.max(1, Duration.toMillis(lease) / 2))
    const cancellationInterval = options.cancellationInterval ?? "100 millis"

    const recordFailure = (cause: Cause.Cause<unknown>) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Clock.currentTimeMillis.pipe(
            Effect.flatMap((at) => {
              const failure = { at, message: Cause.pretty(cause) }
              return Ref.update(state, (current) => ({
                ...current,
                poll: { _tag: "Failed" as const, ...failure },
                lastFailure: failure,
              }))
            }),
          )

    const recordExecutionFailure = (cause: Cause.Cause<unknown>) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.void
        : Clock.currentTimeMillis.pipe(
            Effect.flatMap((at) =>
              Ref.update(state, (current) => ({
                ...current,
                lastFailure: { at, message: Cause.pretty(cause) },
              })),
            ),
          )

    const watchCancellation = (runId: string): Effect.Effect<void, RuntimeUnavailable> =>
      Effect.sleep(cancellationInterval).pipe(
        Effect.andThen(store.inspect(runId)),
        Effect.flatMap((run) =>
          run.status === "cancelling"
            ? host.interrupt(runId).pipe(Effect.andThen(watchCancellation(runId)))
            : isTerminal(run.status)
              ? Effect.void
              : watchCancellation(runId),
        ),
        Effect.catchTag("tenetkit/runtime/RunNotFound", () => Effect.void),
      )

    const executeClaim = (item: ClaimedRun): Effect.Effect<void> => {
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
      return host.execute({ runId: item.run.runId, ownerId: options.workerId, attemptFence: item.attemptFence }).pipe(
        Effect.raceFirst(renew),
        Effect.raceFirst(watchCancellation(item.run.runId)),
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.interrupt
            : recordExecutionFailure(cause).pipe(
                Effect.andThen(
                  Effect.logError("runtime-worker.execution-failed").pipe(
                    Effect.annotateLogs({
                      "tenetkit.run.id": item.run.runId,
                      "tenetkit.worker.id": options.workerId,
                    }),
                  ),
                ),
              ),
        ),
      )
    }

    const startClaim = (item: ClaimedRun) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const claimedAt = yield* Clock.currentTimeMillis
          const removeClaim = Ref.update(state, (current) => {
            const known = current.claims.get(item.run.runId)
            if (known?.attemptFence !== item.attemptFence) return current
            const next = new Map(current.claims)
            next.delete(item.run.runId)
            return { ...current, claims: next }
          })
          const starts = yield* Ref.modify(state, (current) => {
            const known = current.claims.get(item.run.runId)
            if (known !== undefined && known.attemptFence >= item.attemptFence) return [false, current] as const
            return [
              true,
              {
                ...current,
                claims: new Map(current.claims).set(item.run.runId, { attemptFence: item.attemptFence, claimedAt }),
              },
            ] as const
          })
          if (!starts) return
          if (options.onClaim !== undefined)
            yield* options.onClaim(item).pipe(
              Effect.onExit((exit) =>
                Exit.isFailure(exit)
                  ? claims
                      .releaseClaim({
                        runId: item.run.runId,
                        workerId: options.workerId,
                        attemptFence: item.attemptFence,
                      })
                      .pipe(Effect.ensuring(removeClaim))
                  : Effect.void,
              ),
            )
          yield* FiberMap.run(active, item.run.runId, executeClaim(item).pipe(Effect.ensuring(removeClaim)), {
            startImmediately: true,
          })
        }),
      )

    const poll = Effect.gen(function* () {
      const free = Math.max(0, concurrency - (yield* FiberMap.size(active)))
      const claimed: ReadonlyArray<ClaimedRun> =
        free === 0
          ? []
          : yield* claims.claimReadyRuns({
              workerId: options.workerId,
              limit: free,
              lease,
            })
      yield* Effect.forEach(claimed, startClaim, { discard: true })
      const at = yield* Clock.currentTimeMillis
      yield* Ref.update(state, (current) => ({
        ...current,
        poll: { _tag: "Succeeded" as const, at },
        lastSuccessfulPollAt: at,
      }))
      return claimed
    }).pipe(Effect.tapCause(recordFailure))

    const iteration = poll.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.logError("runtime-worker.poll-failed", cause).pipe(
              Effect.annotateLogs({ "tenetkit.worker.id": options.workerId }),
            ),
      ),
      Effect.andThen(Effect.sleep(pollInterval)),
    )

    const status = Ref.get(state).pipe(
      Effect.map((current): WorkerStatus => {
        let oldestClaimAt: number | undefined
        for (const claim of current.claims.values())
          if (oldestClaimAt === undefined || claim.claimedAt < oldestClaimAt) oldestClaimAt = claim.claimedAt
        return {
          poll: current.poll,
          lastSuccessfulPollAt: current.lastSuccessfulPollAt,
          lastFailure: current.lastFailure,
          active: current.claims.size,
          capacity: concurrency,
          oldestClaimAt,
        }
      }),
    )

    return {
      workerId: options.workerId,
      active: status.pipe(Effect.map((current) => current.active)),
      status,
      poll,
      idle: FiberMap.awaitEmpty(active),
      run: Effect.forever(iteration),
    }
  })

export const layerWorker = (
  options: WorkerOptions,
): Layer.Layer<RuntimeWorker, never, RunClaims | ExecutionHost | RunStore> =>
  Layer.effect(RuntimeWorker, makeWorker(options).pipe(Effect.map((service) => RuntimeWorker.of(service))))
