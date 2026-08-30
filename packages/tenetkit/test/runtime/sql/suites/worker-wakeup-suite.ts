import { expect, it } from "@effect/vitest"
import { DateTime, Deferred, Effect, Queue, Ref, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import { TestClock } from "effect/testing"
import { Address, Message } from "../../../../src/runtime/index.js"
import { RuntimeUnavailable } from "../../../../src/runtime/errors.js"
import { ExecutionHost } from "../../../../src/runtime/execution/host.js"
import { RunStore } from "../../../../src/runtime/run/store.js"
import type { DecodedRun } from "../../../../src/runtime/sql/codec/rows.js"
import {
  RunClaims,
  type ClaimedRun,
  type Interface as ClaimsInterface,
} from "../../../../src/runtime/sql/run/claims.js"
import type { WorkerOptions } from "../../../../src/runtime/sql/worker.js"
import { assistantRef } from "../../execution/fixtures.js"

const decodedRun: DecodedRun = {
  runId: "run:wakeup",
  status: "running",
  address: Address.make("agent:wakeup"),
  sessionId: "session:wakeup",
  message: Message.make({
    id: "message:wakeup",
    to: Address.make("agent:wakeup"),
    sessionId: "session:wakeup",
    prompt: Prompt.make("work"),
    idempotencyKey: "wakeup",
    correlationId: "wakeup",
  }),
  messageDigest: "digest:wakeup",
  executableRef: assistantRef.ref,
  executableManifest: assistantRef.manifest,
  rootRunId: "run:wakeup",
  depth: 0,
  treePolicy: { maxDepth: 0, maxSubagents: 0 },
  attempt: 1,
  attemptFence: 1,
  lastSequence: 0,
  lastTurnCompletedSequence: -1,
  cancellationRequested: false,
  acceptedSequence: 0,
  admittedAt: "2026-08-29T00:00:00.000Z",
}

const claim = (runId: string): ClaimedRun => ({
  run: { ...decodedRun, runId },
  workerId: "worker-wakeup",
  attemptFence: 1,
  session: {
    sessionId: decodedRun.sessionId,
    runId,
    ownerId: "worker-wakeup",
    runAttemptFence: 1,
    epoch: "1",
  },
  leaseExpiresAt: DateTime.toDate(DateTime.makeUnsafe(0)),
})

export const workerWakeupSuite = (constructors: {
  readonly makeExecutableResolver: typeof import("../../../../src/runtime/executable/resolver.js").makeStatic
  readonly makeRunStore: typeof import("../../../../src/runtime/memory/store.js").makeRunStore
  readonly makeWorker: typeof import("../../../../src/runtime/sql/worker.js").makeWorker
}) => {
  const store = Effect.runSync(
    Effect.scoped(constructors.makeRunStore({ resolver: constructors.makeExecutableResolver([]), addresses: [] })),
  )

  const claims = (
    changes: ClaimsInterface["changes"],
    claimReadyRuns: ClaimsInterface["claimReadyRuns"],
  ): ClaimsInterface =>
    RunClaims.of({
      changes,
      claimReadyRuns,
      refreshLease: () => Effect.succeed(true),
      releaseClaim: () => Effect.void,
      commitWithClaim: () => Effect.void,
    })

  const make = (input: {
    readonly claims: ClaimsInterface
    readonly execute: ExecutionHost["Service"]["execute"]
    readonly options?: Omit<WorkerOptions, "workerId">
  }) =>
    constructors
      .makeWorker({ workerId: "worker-wakeup", ...input.options })
      .pipe(
        Effect.provideService(
          ExecutionHost,
          ExecutionHost.of({ execute: input.execute, interrupt: () => Effect.void }),
        ),
        Effect.provideService(RunStore, store),
        Effect.provideService(RunClaims, input.claims),
      )

  const readyChanges = Stream.concat(Stream.succeed(undefined), Stream.never)

  it.effect("claims work already durable when the wakeup source becomes ready", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const remaining = yield* Ref.make<ReadonlyArray<ClaimedRun>>([claim("run:startup")])
        const service = claims(readyChanges, ({ limit }) =>
          Ref.modify(remaining, (items) => [items.slice(0, limit), items.slice(limit)]),
        )
        const worker = yield* make({
          claims: service,
          execute: () => Deferred.succeed(started, undefined),
          options: { fallbackInterval: "1 day" },
        })

        yield* worker.run.pipe(Effect.forkScoped)
        yield* Deferred.await(started)
        yield* Effect.yieldNow
        expect(yield* worker.status).toMatchObject({
          scan: { _tag: "Succeeded" },
          wakeup: { _tag: "Ready" },
          lastFallbackAt: undefined,
        })
      }),
    ),
  )

  it.effect("coalesces duplicate wakeups into one durable rescan", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const releaseFirstScan = yield* Deferred.make<void>()
        const firstScan = yield* Deferred.make<void>()
        const duplicateWakeupsOffered = yield* Deferred.make<void>()
        const secondScan = yield* Deferred.make<void>()
        const scans = yield* Ref.make(0)
        const changes = Stream.concat(
          Stream.succeed(undefined),
          Stream.concat(
            Stream.fromEffect(Deferred.await(firstScan)).pipe(Stream.drain),
            Stream.concat(
              Stream.make(undefined, undefined, undefined),
              Stream.concat(
                Stream.fromEffect(Deferred.succeed(duplicateWakeupsOffered, undefined)).pipe(Stream.drain),
                Stream.never,
              ),
            ),
          ),
        )
        const service = claims(changes, () =>
          Ref.getAndUpdate(scans, (count) => count + 1).pipe(
            Effect.flatMap((scan) => {
              if (scan === 0) {
                return Deferred.succeed(firstScan, undefined).pipe(
                  Effect.andThen(Deferred.await(releaseFirstScan)),
                  Effect.as([]),
                )
              }
              return Deferred.succeed(secondScan, undefined).pipe(Effect.as([]))
            }),
          ),
        )
        const worker = yield* make({
          claims: service,
          execute: () => Effect.void,
          options: { fallbackInterval: "1 day" },
        })

        yield* worker.run.pipe(Effect.forkScoped)
        yield* Deferred.await(duplicateWakeupsOffered)
        yield* Deferred.succeed(releaseFirstScan, undefined)
        yield* Deferred.await(secondScan)
        yield* Effect.yieldNow
        expect(yield* Ref.get(scans)).toBe(2)
      }),
    ),
  )

  it.effect("uses the durable fallback sweep after a notification is missed", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstScan = yield* Deferred.make<void>()
        const started = yield* Deferred.make<void>()
        const ready = yield* Ref.make(false)
        const scans = yield* Ref.make(0)
        const service = claims(readyChanges, () =>
          Ref.getAndUpdate(scans, (count) => count + 1).pipe(
            Effect.flatMap((scan) =>
              Ref.getAndSet(ready, false).pipe(
                Effect.tap(() => (scan === 0 ? Deferred.succeed(firstScan, undefined) : Effect.void)),
                Effect.map((isReady) => (isReady ? [claim("run:fallback")] : [])),
              ),
            ),
          ),
        )
        const worker = yield* make({
          claims: service,
          execute: () => Deferred.succeed(started, undefined),
          options: { fallbackInterval: "1 hour" },
        })

        yield* worker.run.pipe(Effect.forkScoped)
        yield* Deferred.await(firstScan)
        yield* Ref.set(ready, true)
        yield* TestClock.adjust("1 hour")
        yield* Deferred.await(started)
        expect((yield* worker.status).lastFallbackAt).toBe(3_600_000)
      }),
    ),
  )

  it.effect("keeps wakeups coalesced while saturated and refills as soon as capacity opens", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const wakeups = yield* Queue.sliding<void>(1)
        const firstStarted = yield* Deferred.make<void>()
        const releaseFirst = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        const remaining = yield* Ref.make<ReadonlyArray<ClaimedRun>>([claim("run:first")])
        const service = claims(Stream.concat(Stream.succeed(undefined), Stream.fromQueue(wakeups)), ({ limit }) =>
          Ref.modify(remaining, (items) => [items.slice(0, limit), items.slice(limit)]),
        )
        const worker = yield* make({
          claims: service,
          execute: ({ runId }) =>
            runId === "run:first"
              ? Deferred.succeed(firstStarted, undefined).pipe(Effect.andThen(Deferred.await(releaseFirst)))
              : Deferred.succeed(secondStarted, undefined),
          options: { concurrency: 1, fallbackInterval: "1 day" },
        })

        yield* worker.run.pipe(Effect.forkScoped)
        yield* Deferred.await(firstStarted)
        yield* Ref.set(remaining, [claim("run:second")])
        yield* Queue.offer(wakeups, undefined)
        yield* Queue.offer(wakeups, undefined)
        yield* Effect.yieldNow
        expect(yield* Deferred.isDone(secondStarted)).toBe(false)
        yield* Deferred.succeed(releaseFirst, undefined)
        yield* Deferred.await(secondStarted)
      }),
    ),
  )

  it.effect("reports listener failure and catches up after reconnect", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const sourceFailed = yield* Deferred.make<void>()
        const started = yield* Deferred.make<void>()
        const subscriptions = yield* Ref.make(0)
        const scans = yield* Ref.make(0)
        const unavailable = RuntimeUnavailable.make({ message: "listener disconnected" })
        const changes = Stream.unwrap(
          Ref.getAndUpdate(subscriptions, (count) => count + 1).pipe(
            Effect.map((subscription) =>
              subscription === 0
                ? Stream.concat(
                    Stream.succeed(undefined),
                    Stream.fromEffect(
                      Deferred.succeed(sourceFailed, undefined).pipe(Effect.andThen(Effect.fail(unavailable))),
                    ),
                  )
                : readyChanges,
            ),
          ),
        )
        const service = claims(changes, () =>
          Ref.getAndUpdate(scans, (count) => count + 1).pipe(
            Effect.map((scan) => (scan === 0 ? [] : [claim("run:reconnected")])),
          ),
        )
        const worker = yield* make({
          claims: service,
          execute: () => Deferred.succeed(started, undefined),
          options: { fallbackInterval: "1 day" },
        })

        yield* worker.run.pipe(Effect.forkScoped)
        yield* Deferred.await(sourceFailed)
        yield* Effect.yieldNow
        expect((yield* worker.status).wakeup).toMatchObject({
          _tag: "Failed",
          message: "listener disconnected",
        })
        yield* TestClock.adjust("1 second")
        yield* Deferred.await(started)
        expect(yield* Ref.get(subscriptions)).toBe(2)
        expect((yield* worker.status).wakeup._tag).toBe("Ready")
      }),
    ),
  )

  it.effect("keeps the fallback sweep active while the wakeup source is unavailable", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const sourceFailed = yield* Deferred.make<void>()
        const started = yield* Deferred.make<void>()
        const unavailable = RuntimeUnavailable.make({ message: "listener unavailable" })
        const changes = Stream.fromEffect(
          Deferred.succeed(sourceFailed, undefined).pipe(Effect.andThen(Effect.fail(unavailable))),
        )
        const remaining = yield* Ref.make<ReadonlyArray<ClaimedRun>>([claim("run:unavailable-fallback")])
        const service = claims(changes, ({ limit }) =>
          Ref.modify(remaining, (items) => [items.slice(0, limit), items.slice(limit)]),
        )
        const worker = yield* make({
          claims: service,
          execute: () => Deferred.succeed(started, undefined),
          options: { fallbackInterval: "500 millis" },
        })

        yield* worker.run.pipe(Effect.forkScoped)
        yield* Deferred.await(sourceFailed)
        yield* TestClock.adjust("500 millis")
        yield* Deferred.await(started)
        expect((yield* worker.status).lastFallbackAt).toBe(500)
      }),
    ),
  )

  it.effect("interrupts the wakeup listener when the worker scope closes", () =>
    Effect.gen(function* () {
      const listening = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const changes = Stream.callback<void>((queue) =>
        Effect.acquireRelease(
          Deferred.succeed(listening, undefined).pipe(
            Effect.tap(() => Effect.sync(() => Queue.offerUnsafe(queue, undefined))),
          ),
          () => Deferred.succeed(interrupted, undefined),
        ),
      )
      yield* Effect.scoped(
        Effect.gen(function* () {
          const worker = yield* make({
            claims: claims(changes, () => Effect.succeed([])),
            execute: () => Effect.void,
            options: { fallbackInterval: "1 day" },
          })
          yield* worker.run.pipe(Effect.forkScoped)
          yield* Deferred.await(listening)
        }),
      )
      yield* Deferred.await(interrupted)
    }),
  )
}
