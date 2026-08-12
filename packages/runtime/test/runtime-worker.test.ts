import { expect, it } from "@effect/vitest"
import { DateTime, Deferred, Effect, Fiber, Ref } from "effect"
import { TestClock } from "effect/testing"
import { ExecutionHost } from "../src/execution-host.js"
import { makeWorker } from "../src/sql/postgres/worker.js"
import { RunClaims, type ClaimedRun, type Interface as ClaimsInterface } from "../src/sql/run-claims.js"
import { RunStore, type Interface as StoreInterface } from "../src/run-store.js"
import type { RunInspection, RunStatus } from "../src/run.js"

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
    const fiber = yield* worker.execute.pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(started)
    yield* TestClock.adjust("150 millis")
    expect(yield* Ref.get(refreshes)).toBeGreaterThan(0)
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(fiber)
    const completedRefreshes = yield* Ref.get(refreshes)
    yield* TestClock.adjust("150 millis")
    expect(yield* Ref.get(refreshes)).toBe(completedRefreshes)
  }),
)

it.effect("interrupts a claimed Run once another node persists cancellation", () =>
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
    const fiber = yield* worker.execute.pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(started)
    yield* TestClock.adjust("150 millis")
    yield* Deferred.await(interrupted)
    yield* Fiber.join(fiber)
  }),
)

it.effect("interrupts stale execution when lease renewal loses ownership", () =>
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
    const fiber = yield* worker.execute.pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(started)
    yield* TestClock.adjust("50 millis")
    yield* Deferred.await(interrupted)
    yield* Fiber.join(fiber)
  }),
)
