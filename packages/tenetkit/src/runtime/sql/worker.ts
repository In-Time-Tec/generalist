import {
  Cause,
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  FiberMap,
  Layer,
  Queue,
  Ref,
  Schedule,
  Scope,
  Stream,
} from "effect"
import { RuntimeUnavailable } from "../errors.js"
import { RunClaims, type ClaimedRun } from "./run/claims.js"
import { RunExecutor } from "../execution/run-executor.js"
import { RunStore } from "../run/store.js"
import { isTerminal } from "../run.js"

export interface WorkerOptions {
  readonly workerId: string
  readonly concurrency?: number
  readonly lease?: Duration.Input
  readonly fallbackInterval?: Duration.Input
  readonly cancellationInterval?: Duration.Input
  readonly onClaim?: (claim: ClaimedRun) => Effect.Effect<void>
}

export interface WorkerFailure {
  readonly at: number
  readonly message: string
}

export type WorkerScan =
  | { readonly _tag: "Starting" }
  | { readonly _tag: "Succeeded"; readonly at: number }
  | { readonly _tag: "Failed"; readonly at: number; readonly message: string }

export type WorkerWakeup =
  | { readonly _tag: "Starting" }
  | { readonly _tag: "Ready"; readonly at: number }
  | { readonly _tag: "Failed"; readonly at: number; readonly message: string }

export interface WorkerStatus {
  readonly scan: WorkerScan
  readonly wakeup: WorkerWakeup
  readonly lastFallbackAt: number | undefined
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
  readonly scan: WorkerScan
  readonly wakeup: WorkerWakeup
  readonly lastFallbackAt: number | undefined
  readonly lastFailure: WorkerFailure | undefined
  readonly claims: ReadonlyMap<string, ActiveClaim>
}

export interface Service {
  readonly workerId: string
  readonly active: Effect.Effect<number>
  readonly status: Effect.Effect<WorkerStatus>
  readonly poll: Effect.Effect<ReadonlyArray<ClaimedRun>, RuntimeUnavailable>
  readonly idle: Effect.Effect<void>
  readonly run: Effect.Effect<never>
}

export class RuntimeWorker extends Context.Service<RuntimeWorker, Service>()(
  "tenetkit/runtime/sql/worker/RuntimeWorker",
) {}

export const makeWorker = (
  options: WorkerOptions,
): Effect.Effect<Service, never, RunClaims | RunExecutor | RunStore | Scope.Scope> =>
  Effect.gen(function* () {
    const claims = yield* RunClaims
    const executor = yield* RunExecutor
    const store = yield* RunStore
    const concurrency = options.concurrency ?? 1
    const lease = options.lease ?? "30 seconds"
    const fallbackInterval = options.fallbackInterval ?? "30 seconds"
    const wakeups = yield* Queue.sliding<void>(1)
    yield* Effect.addFinalizer(() => Queue.shutdown(wakeups))
    const active = yield* FiberMap.make<string, void, never>()
    const state = yield* Ref.make<WorkerState>({
      scan: { _tag: "Starting" },
      wakeup: { _tag: "Starting" },
      lastFallbackAt: undefined,
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
                scan: { _tag: "Failed" as const, ...failure },
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

    const recordWakeupFailure = (failure: RuntimeUnavailable) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((at) =>
          Ref.update(state, (current) => ({
            ...current,
            wakeup: { _tag: "Failed" as const, at, message: failure.message },
            lastFailure: { at, message: failure.message },
          })),
        ),
      )

    const recordWakeup = Clock.currentTimeMillis.pipe(
      Effect.flatMap((at) =>
        Ref.update(state, (current) => ({
          ...current,
          wakeup: { _tag: "Ready" as const, at },
        })),
      ),
    )

    const watchCancellation = (runId: string): Effect.Effect<void, RuntimeUnavailable> =>
      Effect.sleep(cancellationInterval).pipe(
        Effect.andThen(store.inspect(runId)),
        Effect.flatMap((run) => {
          if (run.status === "cancelling") {
            return executor.interrupt(runId).pipe(Effect.andThen(watchCancellation(runId)))
          }
          return isTerminal(run.status) ? Effect.void : watchCancellation(runId)
        }),
        Effect.catchTag("tenetkit/runtime/RunNotFound", () => Effect.void),
      )

    const executeClaim = (item: ClaimedRun): Effect.Effect<void> => {
      const renew: Effect.Effect<void, RuntimeUnavailable> = Effect.sleep(renewalInterval).pipe(
        Effect.andThen(
          claims.refreshLease({
            runId: item.run.runId,
            workerId: options.workerId,
            attemptFence: item.attemptFence,
            session: item.session,
            cancellationRequested: item.run.cancellationRequested,
            lease,
          }),
        ),
        Effect.flatMap((refreshed) => (refreshed ? renew : Effect.void)),
      )
      const hosted = executor
        .execute({
          runId: item.run.runId,
          ownerId: options.workerId,
          attemptFence: item.attemptFence,
          session: item.session,
        })
        .pipe(Effect.raceFirst(renew))
      return (
        item.run.cancellationRequested ? hosted : hosted.pipe(Effect.raceFirst(watchCancellation(item.run.runId)))
      ).pipe(
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
                        session: item.session,
                      })
                      .pipe(Effect.ensuring(removeClaim.pipe(Effect.andThen(Queue.offer(wakeups, undefined)))))
                  : Effect.void,
              ),
            )
          yield* FiberMap.run(
            active,
            item.run.runId,
            executeClaim(item).pipe(Effect.ensuring(removeClaim.pipe(Effect.andThen(Queue.offer(wakeups, undefined))))),
            {
              startImmediately: true,
            },
          )
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
        scan: { _tag: "Succeeded" as const, at },
      }))
      return claimed
    }).pipe(Effect.tapCause(recordFailure))

    const drain: Effect.Effect<void, RuntimeUnavailable> = Effect.suspend(() =>
      poll.pipe(
        Effect.flatMap((claimed) =>
          claimed.length === 0
            ? Effect.void
            : FiberMap.size(active).pipe(Effect.flatMap((size) => (size >= concurrency ? Effect.void : drain))),
        ),
      ),
    )

    const runDrain = drain.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.logError("runtime-worker.scan-failed", cause).pipe(
              Effect.annotateLogs({ "tenetkit.worker.id": options.workerId }),
            ),
      ),
    )

    const status = Ref.get(state).pipe(
      Effect.map((current): WorkerStatus => {
        let oldestClaimAt: number | undefined
        for (const claim of current.claims.values())
          if (oldestClaimAt === undefined || claim.claimedAt < oldestClaimAt) oldestClaimAt = claim.claimedAt
        return {
          scan: current.scan,
          wakeup: current.wakeup,
          lastFallbackAt: current.lastFallbackAt,
          lastFailure: current.lastFailure,
          active: current.claims.size,
          capacity: concurrency,
          oldestClaimAt,
        }
      }),
    )

    const sourceEnded = RuntimeUnavailable.make({ message: "Run claim wakeup source ended" })
    const listen = Stream.concat(claims.changes, Stream.fail(sourceEnded)).pipe(
      Stream.tap(() => recordWakeup),
      Stream.tapError((failure) =>
        recordWakeupFailure(failure).pipe(
          Effect.andThen(
            Effect.logWarning("runtime-worker.wakeup-failed").pipe(
              Effect.annotateLogs({
                "tenetkit.worker.id": options.workerId,
                "tenetkit.failure": failure.message,
              }),
            ),
          ),
        ),
      ),
      Stream.retry(Schedule.spaced("1 second")),
      Stream.runForEach(() => Queue.offer(wakeups, undefined)),
    )

    const awaitWakeup = Effect.raceFirst(
      Queue.take(wakeups).pipe(Effect.as("wakeup" as const)),
      Effect.sleep(fallbackInterval).pipe(Effect.as("fallback" as const)),
    ).pipe(
      Effect.tap((reason) =>
        reason === "wakeup"
          ? Effect.void
          : Clock.currentTimeMillis.pipe(
              Effect.flatMap((at) => Ref.update(state, (current) => ({ ...current, lastFallbackAt: at }))),
            ),
      ),
    )

    const run = Effect.scoped(
      Effect.gen(function* () {
        yield* listen.pipe(Effect.forkScoped)
        return yield* Effect.forever(awaitWakeup.pipe(Effect.andThen(runDrain)))
      }),
    )

    return {
      workerId: options.workerId,
      active: status.pipe(Effect.map((current) => current.active)),
      status,
      poll,
      idle: FiberMap.awaitEmpty(active),
      run,
    }
  })

export const layerWorker = (
  options: WorkerOptions,
): Layer.Layer<RuntimeWorker, never, RunClaims | RunExecutor | RunStore> =>
  Layer.effect(RuntimeWorker, makeWorker(options).pipe(Effect.map((service) => RuntimeWorker.of(service))))
