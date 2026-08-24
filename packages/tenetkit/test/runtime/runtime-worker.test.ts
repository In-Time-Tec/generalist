import { expect, it } from "@effect/vitest"
import { DateTime, Deferred, Effect, Ref } from "effect"
import { TestClock } from "effect/testing"
import { RuntimeUnavailable } from "../../src/runtime/errors.js"
import { ExecutionHost } from "../../src/runtime/execution-host.js"
import { makeWorker } from "../../src/runtime/sql/worker.js"
import { RunClaims, type ClaimedRun, type Interface as ClaimsInterface } from "../../src/runtime/sql/run-claims.js"
import { RunStore, type Interface as StoreInterface } from "../../src/runtime/run-store.js"
import type { RunInspection, RunStatus } from "../../src/runtime/run.js"

const claimed = {
  run: { runId: "run:worker" },
  workerId: "worker-a",
  attemptFence: 1,
  leaseExpiresAt: DateTime.toDate(DateTime.makeUnsafe(0)),
} as ClaimedRun

const claimsService = (refreshLease: ClaimsInterface["refreshLease"]): ClaimsInterface =>
  RunClaims.of({
    claimReadyRuns: () => Effect.succeed([claimed]),
    refreshLease,
    releaseClaim: () => Effect.void,
    commitWithClaim: () => Effect.void,
  })

/** These worker tests exercise claim renewal only; the watcher needs one status read. */
const storeService = (status: RunStatus): StoreInterface =>
  ({ inspect: () => Effect.succeed({ status } as RunInspection) }) as unknown as StoreInterface

it.effect("renews a claim for the lifetime of agent execution", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const refreshes = yield* Ref.make(0)
      const host = ExecutionHost.of({
        execute: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release))),
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({ workerId: "worker-a", lease: "100 millis" }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(
          RunClaims,
          claimsService(() => Ref.updateAndGet(refreshes, (count) => count + 1).pipe(Effect.as(true))),
        ),
      )
      yield* worker.poll
      yield* Deferred.await(started)
      yield* TestClock.adjust("150 millis")
      expect(yield* Ref.get(refreshes)).toBeGreaterThan(0)
      yield* Deferred.succeed(release, undefined)
      yield* worker.idle
      const completedRefreshes = yield* Ref.get(refreshes)
      yield* TestClock.adjust("150 millis")
      expect(yield* Ref.get(refreshes)).toBe(completedRefreshes)
    }),
  ),
)

it.effect("interrupts a claimed Run once another node persists cancellation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const host = ExecutionHost.of({
        execute: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(interrupted))),
        interrupt: () => Deferred.succeed(interrupted, undefined),
      })
      const worker = yield* makeWorker({ workerId: "worker-a", lease: "100 millis" }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("cancelling")),
        Effect.provideService(
          RunClaims,
          claimsService(() => Effect.succeed(true)),
        ),
      )
      yield* worker.poll
      yield* Deferred.await(started)
      yield* TestClock.adjust("150 millis")
      yield* Deferred.await(interrupted)
      yield* worker.idle
    }),
  ),
)

it.effect("interrupts stale execution when lease renewal loses ownership", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const host = ExecutionHost.of({
        execute: () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
          ),
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({ workerId: "worker-a", lease: "100 millis" }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(
          RunClaims,
          claimsService(() => Effect.succeed(false)),
        ),
      )
      yield* worker.poll
      yield* Deferred.await(started)
      yield* TestClock.adjust("50 millis")
      yield* Deferred.await(interrupted)
      yield* worker.idle
    }),
  ),
)

it.effect("refills capacity while another Run remains active", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const blockedStarted = yield* Deferred.make<void>()
      const unrelatedStarted = yield* Deferred.make<void>()
      const refillStarted = yield* Deferred.make<void>()
      const claimBatch = yield* Ref.make(0)
      const run = (runId: string): ClaimedRun => ({
        ...claimed,
        run: { ...claimed.run, runId },
      })
      const claims = RunClaims.of({
        claimReadyRuns: () =>
          Ref.getAndUpdate(claimBatch, (value) => value + 1).pipe(
            Effect.map((batch) => (batch === 0 ? [run("run:blocked"), run("run:unrelated")] : [run("run:refill")])),
          ),
        refreshLease: () => Effect.succeed(true),
        releaseClaim: () => Effect.void,
        commitWithClaim: () => Effect.void,
      })
      const host = ExecutionHost.of({
        execute: ({ runId }) => {
          if (runId === "run:blocked")
            return Deferred.succeed(blockedStarted, undefined).pipe(Effect.andThen(Effect.never))
          if (runId === "run:unrelated") return Deferred.succeed(unrelatedStarted, undefined)
          return Deferred.succeed(refillStarted, undefined)
        },
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({
        workerId: "worker-a",
        concurrency: 2,
        lease: "1 second",
        pollInterval: "10 millis",
      }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(RunClaims, claims),
      )
      yield* worker.run.pipe(Effect.forkScoped)
      yield* Deferred.await(blockedStarted)
      yield* Deferred.await(unrelatedStarted)
      yield* TestClock.adjust("11 millis")
      expect((yield* Deferred.poll(refillStarted))._tag).toBe("Some")
    }),
  ),
)

it.effect("reports poll freshness, capacity, active work, claim age, and the last failure", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>()
      const attempts = yield* Ref.make(0)
      const claims = RunClaims.of({
        claimReadyRuns: () =>
          Ref.getAndUpdate(attempts, (value) => value + 1).pipe(
            Effect.flatMap((attempt) =>
              attempt === 0
                ? Effect.fail(RuntimeUnavailable.make({ message: "database unavailable" }))
                : Effect.succeed([claimed]),
            ),
          ),
        refreshLease: () => Effect.succeed(true),
        releaseClaim: () => Effect.void,
        commitWithClaim: () => Effect.void,
      })
      const host = ExecutionHost.of({
        execute: () => Deferred.await(release),
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({ workerId: "worker-a", concurrency: 2 }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(RunClaims, claims),
      )
      expect(yield* worker.status).toEqual({
        poll: { _tag: "Starting" },
        lastSuccessfulPollAt: undefined,
        lastFailure: undefined,
        active: 0,
        capacity: 2,
        oldestClaimAt: undefined,
      })
      yield* Effect.result(worker.poll)
      const failed = yield* worker.status
      expect(failed.poll._tag).toBe("Failed")
      expect(failed.lastSuccessfulPollAt).toBeUndefined()
      expect(failed.lastFailure?.message).toContain("database unavailable")
      expect(failed.active).toBe(0)

      yield* TestClock.adjust("25 millis")
      yield* worker.poll
      expect(yield* worker.status).toMatchObject({
        poll: { _tag: "Succeeded", at: 25 },
        lastSuccessfulPollAt: 25,
        active: 1,
        capacity: 2,
        oldestClaimAt: 25,
      })
      expect((yield* worker.status).lastFailure?.message).toContain("database unavailable")
      yield* Deferred.succeed(release, undefined)
      yield* worker.idle
      expect(yield* worker.status).toMatchObject({ active: 0, oldestClaimAt: undefined })
    }),
  ),
)

it.effect("continuous run survives an unavailable claim poll", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const firstPolled = yield* Deferred.make<void>()
      const started = yield* Deferred.make<void>()
      const polls = yield* Ref.make(0)
      const claims = RunClaims.of({
        claimReadyRuns: () =>
          Ref.getAndUpdate(polls, (value) => value + 1).pipe(
            Effect.flatMap((poll) =>
              poll === 0
                ? Deferred.succeed(firstPolled, undefined).pipe(
                    Effect.andThen(Effect.fail(RuntimeUnavailable.make({ message: "database unavailable" }))),
                  )
                : Effect.succeed([claimed]),
            ),
          ),
        refreshLease: () => Effect.succeed(true),
        releaseClaim: () => Effect.void,
        commitWithClaim: () => Effect.void,
      })
      const host = ExecutionHost.of({
        execute: () => Deferred.succeed(started, undefined),
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({ workerId: "worker-a", pollInterval: "10 millis" }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(RunClaims, claims),
      )
      yield* worker.run.pipe(Effect.forkScoped)
      yield* Deferred.await(firstPolled)
      yield* Effect.yieldNow
      expect((yield* worker.status).poll._tag).toBe("Failed")
      yield* TestClock.adjust("10 millis")
      yield* Deferred.await(started)
      expect(yield* Ref.get(polls)).toBeGreaterThanOrEqual(2)
      expect((yield* worker.status).poll._tag).toBe("Succeeded")
    }),
  ),
)

it.effect("does not restart an active Run for the same claim fence", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const releases = yield* Deferred.make<void>()
      const executions = yield* Ref.make(0)
      const observations = yield* Ref.make(0)
      const host = ExecutionHost.of({
        execute: () =>
          Ref.update(executions, (count) => count + 1).pipe(
            Effect.andThen(Deferred.succeed(started, undefined)),
            Effect.andThen(Deferred.await(releases)),
          ),
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({
        workerId: "worker-a",
        concurrency: 2,
        onClaim: () => Ref.update(observations, (count) => count + 1),
      }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(
          RunClaims,
          claimsService(() => Effect.succeed(true)),
        ),
      )
      yield* worker.poll
      yield* Deferred.await(started)
      yield* worker.poll
      expect(yield* Ref.get(executions)).toBe(1)
      expect(yield* Ref.get(observations)).toBe(1)
      expect((yield* worker.status).active).toBe(1)
      yield* Deferred.succeed(releases, undefined)
      yield* worker.idle
    }),
  ),
)

it.effect("replaces stale execution when the same Run is claimed with a newer fence", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const oldStarted = yield* Deferred.make<void>()
      const oldInterrupted = yield* Deferred.make<void>()
      const newStarted = yield* Deferred.make<void>()
      const claimIndex = yield* Ref.make(0)
      const fences = yield* Ref.make<ReadonlyArray<number>>([])
      const observedFences = yield* Ref.make<ReadonlyArray<number>>([])
      const claims = RunClaims.of({
        claimReadyRuns: () =>
          Ref.getAndUpdate(claimIndex, (value) => value + 1).pipe(
            Effect.map((index) => [{ ...claimed, attemptFence: index + 1 }] as ReadonlyArray<ClaimedRun>),
          ),
        refreshLease: () => Effect.succeed(true),
        releaseClaim: () => Effect.void,
        commitWithClaim: () => Effect.void,
      })
      const host = ExecutionHost.of({
        execute: ({ attemptFence }) =>
          Ref.update(fences, (values) => [...values, attemptFence]).pipe(
            Effect.andThen(
              attemptFence === 1
                ? Deferred.succeed(oldStarted, undefined).pipe(
                    Effect.andThen(Effect.never),
                    Effect.onInterrupt(() => Deferred.succeed(oldInterrupted, undefined)),
                  )
                : Deferred.succeed(newStarted, undefined),
            ),
          ),
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({
        workerId: "worker-a",
        concurrency: 2,
        onClaim: ({ attemptFence }) => Ref.update(observedFences, (values) => [...values, attemptFence]),
      }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(RunClaims, claims),
      )
      yield* worker.poll
      yield* Deferred.await(oldStarted)
      yield* worker.poll
      yield* Deferred.await(oldInterrupted)
      yield* Deferred.await(newStarted)
      expect(yield* Ref.get(fences)).toEqual([1, 2])
      expect(yield* Ref.get(observedFences)).toEqual([1, 2])
    }),
  ),
)

it.effect("awaits claim observation before host execution", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const observed = yield* Deferred.make<void>()
      const continueObservation = yield* Deferred.make<void>()
      const executed = yield* Deferred.make<void>()
      const host = ExecutionHost.of({
        execute: () => Deferred.succeed(executed, undefined),
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({
        workerId: "worker-a",
        onClaim: () => Deferred.succeed(observed, undefined).pipe(Effect.andThen(Deferred.await(continueObservation))),
      }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(
          RunClaims,
          claimsService(() => Effect.succeed(true)),
        ),
      )
      yield* worker.poll.pipe(Effect.forkScoped)
      yield* Deferred.await(observed)
      expect(yield* Deferred.isDone(executed)).toBe(false)
      yield* Deferred.succeed(continueObservation, undefined)
      yield* Deferred.await(executed)
    }),
  ),
)

it.effect("releases an unobserved claim when claim observation defects", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const claimIndex = yield* Ref.make(0)
      const observationAttempts = yield* Ref.make(0)
      const observedFences = yield* Ref.make<ReadonlyArray<number>>([])
      const executedFences = yield* Ref.make<ReadonlyArray<number>>([])
      const releasedFences = yield* Ref.make<ReadonlyArray<number>>([])
      const claims = RunClaims.of({
        claimReadyRuns: () =>
          Ref.getAndUpdate(claimIndex, (value) => value + 1).pipe(
            Effect.map((index) => [{ ...claimed, attemptFence: index + 1 }] as ReadonlyArray<ClaimedRun>),
          ),
        refreshLease: () => Effect.succeed(true),
        releaseClaim: ({ attemptFence }) => Ref.update(releasedFences, (values) => [...values, attemptFence]),
        commitWithClaim: () => Effect.void,
      })
      const host = ExecutionHost.of({
        execute: ({ attemptFence }) => Ref.update(executedFences, (values) => [...values, attemptFence]),
        interrupt: () => Effect.void,
      })
      const worker = yield* makeWorker({
        workerId: "worker-a",
        onClaim: ({ attemptFence }) =>
          Ref.getAndUpdate(observationAttempts, (count) => count + 1).pipe(
            Effect.flatMap((attempt) =>
              attempt === 0
                ? Effect.die("observer defect")
                : Ref.update(observedFences, (values) => [...values, attemptFence]),
            ),
          ),
      }).pipe(
        Effect.provideService(ExecutionHost, host),
        Effect.provideService(RunStore, storeService("running")),
        Effect.provideService(RunClaims, claims),
      )

      const first = yield* Effect.exit(worker.poll)
      expect(first._tag).toBe("Failure")
      expect(yield* Ref.get(releasedFences)).toEqual([1])
      expect(yield* Ref.get(executedFences)).toEqual([])
      expect((yield* worker.status).active).toBe(0)

      yield* worker.poll
      yield* worker.idle
      expect(yield* Ref.get(observedFences)).toEqual([2])
      expect(yield* Ref.get(executedFences)).toEqual([2])
      expect(yield* Ref.get(observationAttempts)).toBe(2)
      expect((yield* worker.status).active).toBe(0)
    }),
  ),
)

it.effect("closing the worker scope interrupts active execution", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const interrupted = yield* Deferred.make<void>()
    const host = ExecutionHost.of({
      execute: () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
        ),
      interrupt: () => Effect.void,
    })
    yield* Effect.scoped(
      Effect.gen(function* () {
        const worker = yield* makeWorker({ workerId: "worker-a" }).pipe(
          Effect.provideService(ExecutionHost, host),
          Effect.provideService(RunStore, storeService("running")),
          Effect.provideService(
            RunClaims,
            claimsService(() => Effect.succeed(true)),
          ),
        )
        yield* worker.poll
        yield* Deferred.await(started)
      }),
    )
    yield* Deferred.await(interrupted)
  }),
)
