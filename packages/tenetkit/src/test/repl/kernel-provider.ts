import { describe, effect as effectTest, expect, live as liveTest } from "@effect/vitest"
import { Effect, Exit, Schema, Scope, Stream } from "effect"
import { CellOutcomeUnknown, KernelUnavailable, type CellFailure, validateSequence } from "../../repl/cell.js"
import type { Execution, Service as KernelPool, Inspection } from "../../repl/kernel-pool.js"
import { digest, type KernelProfile } from "../../repl/kernel-profile.js"
import type { Service as KernelResourceStore } from "../../repl/kernel-resource-store.js"

const noSignal = (): AbortSignal => AbortSignal.any([])

const request = (
  pool: KernelPool,
  sessionId: string,
  cellId: string,
  code: string,
): Effect.Effect<Execution, CellFailure, Scope.Scope> => pool.execute({ sessionId, cellId, code, signal: noSignal() })

const run = (pool: KernelPool, sessionId: string, cellId: string, code: string) =>
  request(pool, sessionId, cellId, code).pipe(Effect.flatMap((execution) => execution.result))

const observe = (pool: KernelPool, sessionId: string, cellId: string, code: string) =>
  request(pool, sessionId, cellId, code).pipe(
    Effect.flatMap((execution) =>
      Stream.runCollect(execution.events).pipe(
        Effect.map((events) => ({ events: Array.from(events), result: execution.result })),
      ),
    ),
  )

const expectUnavailable = (failure: CellFailure): void => {
  expect(Schema.is(KernelUnavailable)(failure)).toBe(true)
  if (Schema.is(KernelUnavailable)(failure)) expect(failure.reason).toBe("lease-lost")
}

/** @experimental One fresh provider instance used by the shared KernelPool lifecycle guarantees. */
export interface Harness {
  readonly pool: KernelPool
  readonly profile: KernelProfile
  /** Number of live or paused provider resources owned by this isolated fixture. */
  readonly resourceCount: Effect.Effect<number>
}

/** @experimental Deterministic failure positions a remote provider harness must be able to inject. */
export type ConnectionLoss = "before-admission" | "after-admission" | "after-result"

/** @experimental Additional two-host and provider lifecycle controls required by remote conformance. */
export interface RemoteHarness extends Harness {
  readonly hostB: KernelPool
  readonly changedProfileHost: KernelPool
  readonly changedProfile: KernelProfile
  readonly authority: KernelResourceStore
  readonly expire: (sessionId: string) => Effect.Effect<void>
  readonly pause: (sessionId: string) => Effect.Effect<boolean, CellFailure>
  readonly loseNextConnection: (loss: ConnectionLoss) => Effect.Effect<void>
  readonly executionCount: (sessionId: string, cellId: string) => Effect.Effect<number>
  readonly failNextDeletion: Effect.Effect<void>
  readonly retryCleanup: Effect.Effect<void, CellFailure>
  /** Exact host-only values that must never occur in a profile, event, failure, or result. */
  readonly forbiddenModelText: ReadonlyArray<string>
}

/** @experimental Configuration for the reusable provider conformance suite. */
export interface Options<CommonError = never, RemoteError = never> {
  readonly name: string
  readonly make: Effect.Effect<Harness, CommonError, Scope.Scope>
  readonly remote?: Effect.Effect<RemoteHarness, RemoteError, Scope.Scope>
  /** Use Effect's live clock for providers whose process lifecycle depends on real time. */
  readonly live?: boolean
  readonly skip?: boolean
}

type Tester = typeof effectTest

const withHarness = <A, E, MakeError>(
  make: Effect.Effect<Harness, MakeError, Scope.Scope>,
  use: (harness: Harness) => Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<A, E | MakeError> => Effect.scoped(Effect.flatMap(make, use))

const withRemote = <A, E, MakeError>(
  make: Effect.Effect<RemoteHarness, MakeError, Scope.Scope>,
  use: (harness: RemoteHarness) => Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<A, E | MakeError> => Effect.scoped(Effect.flatMap(make, use))

const registerCommon = <CommonError, RemoteError>(options: Options<CommonError, RemoteError>, test: Tester): void => {
  test("keeps one live kernel and admits only one cell per Session", () =>
    withHarness(options.make, ({ pool, resourceCount }) =>
      Effect.gen(function* () {
        yield* run(pool, "one-session", "seed", "const shared = 41")
        expect((yield* run(pool, "one-session", "reuse", "shared + 1")).value).toBe("42")
        const active = yield* request(pool, "one-session", "active", "await new Promise(() => {})")
        const rejected = yield* request(pool, "one-session", "overlap", "0").pipe(Effect.flip)
        expectUnavailable(rejected)
        expect(yield* resourceCount).toBe(1)
        expect((yield* pool.interrupt("one-session", "active"))._tag).toBe("Interrupted")
        yield* Effect.exit(active.result)
      }),
    ))

  test("admits different Sessions concurrently", () =>
    withHarness(options.make, ({ pool, resourceCount }) =>
      Effect.gen(function* () {
        const first = yield* request(pool, "parallel-a", "active-a", "await new Promise(() => {})")
        const second = yield* request(pool, "parallel-b", "active-b", "await new Promise(() => {})").pipe(
          Effect.timeout("5 seconds"),
        )
        expect(yield* resourceCount).toBe(2)
        expect((yield* pool.interrupt("parallel-a", "active-a"))._tag).toBe("Interrupted")
        expect((yield* pool.interrupt("parallel-b", "active-b"))._tag).toBe("Interrupted")
        yield* Effect.all([Effect.exit(first.result), Effect.exit(second.result)], { concurrency: "unbounded" })
      }),
    ))

  test("preserves the exact event sequence and terminal result", () =>
    withHarness(options.make, ({ pool, profile }) =>
      Effect.gen(function* () {
        const observed = yield* observe(
          pool,
          "events",
          "event-cell",
          'console.log("alpha"); console.error("beta"); 6 * 7',
        )
        const result = yield* observed.result
        expect(observed.events.map((event) => event._tag)).toEqual(["KernelReady", "Stdout", "Stderr", "Result"])
        expect(observed.events.map((event) => event.sequence)).toEqual([0, 1, 2, 3])
        expect(validateSequence({ sessionId: "events", events: observed.events })).toBeUndefined()
        expect(observed.events[0]).toMatchObject({
          sessionId: "events",
          cellId: "event-cell",
          epoch: 0,
        })
        expect(result).toMatchObject({
          cellId: "event-cell",
          epoch: 0,
          sequence: 3,
          value: "42",
          stdout: "alpha\n",
          stderr: "beta\n",
        })
        expect(observed.events[0]?._tag).toBe("KernelReady")
        if (observed.events[0]?._tag === "KernelReady") {
          expect(observed.events[0].profileDigest.length).toBeGreaterThan(0)
        }
        expect(profile.provider.length).toBeGreaterThan(0)
      }),
    ))

  test("preserves inspect, interrupt, restart, and close lifecycle semantics", () =>
    withHarness(options.make, ({ pool, resourceCount }) =>
      Effect.gen(function* () {
        yield* run(pool, "lifecycle", "seed", "const kept = 7; const handle = new AbortController()")
        const inspection = yield* pool.inspect({ sessionId: "lifecycle", name: "kept" })
        expect(inspection.bindings.map((binding) => binding.name)).toEqual(["kept"])
        const restart = yield* pool.restart("lifecycle", "requested")
        expect(restart).toMatchObject({
          sessionId: "lifecycle",
          epoch: 1,
          reason: "requested",
          recovery: "namespace",
        })
        expect(restart.restoredNames).toContain("kept")
        expect(restart.droppedNames).toContain("handle")
        expect((yield* pool.inspect({ sessionId: "lifecycle" })).epoch).toBe(1)
        const active = yield* request(pool, "lifecycle", "interrupt", "await new Promise(() => {})")
        expect((yield* pool.interrupt("lifecycle", "interrupt"))._tag).toBe("Interrupted")
        yield* Effect.exit(active.result)
        yield* pool.close("lifecycle")
        expect(yield* resourceCount).toBe(0)
      }),
    ))
}

const registerRemote = <MakeError>(make: Effect.Effect<RemoteHarness, MakeError, Scope.Scope>, test: Tester): void => {
  test("atomically elects one of two hosts and one current generation", () =>
    withRemote(make, ({ pool, hostB, authority, resourceCount }) =>
      Effect.gen(function* () {
        const [left, right] = yield* Effect.all(
          [Effect.exit(pool.inspect({ sessionId: "race" })), Effect.exit(hostB.inspect({ sessionId: "race" }))],
          { concurrency: "unbounded" },
        )
        expect([left, right].filter(Exit.isSuccess)).toHaveLength(1)
        expect([left, right].filter(Exit.isFailure)).toHaveLength(1)
        expect((yield* authority.inspect("race"))?.claim.generation).toBe(1)
        expect(yield* resourceCount).toBe(1)
      }),
    ))

  test("rejects every stale KernelPool operation after takeover", () =>
    withRemote(make, ({ pool, hostB, authority, expire }) =>
      Effect.gen(function* () {
        yield* run(pool, "stale", "seed", "const owned = 1")
        yield* expire("stale")
        yield* hostB.inspect({ sessionId: "stale" })
        expect((yield* authority.inspect("stale"))?.claim).toMatchObject({ ownerId: "host-b", generation: 2 })
        const failures = yield* Effect.all(
          [
            request(pool, "stale", "late-execute", "2"),
            pool.inspect({ sessionId: "stale" }),
            pool.interrupt("stale", "seed"),
            pool.restart("stale", "requested"),
            pool.close("stale"),
          ].map((operation) => operation.pipe(Effect.flip)),
          { concurrency: 1 },
        )
        for (const failure of failures) expectUnavailable(failure)
      }),
    ))

  test("reconnects one exact resource after host loss without creating a second kernel", () =>
    withRemote(make, ({ pool, hostB, authority, expire, resourceCount }) =>
      Effect.gen(function* () {
        yield* run(pool, "reconnect", "seed", "const survivor = 41")
        const before = yield* authority.inspect("reconnect")
        yield* expire("reconnect")
        const result = yield* run(hostB, "reconnect", "after", "survivor + 1")
        const after = yield* authority.inspect("reconnect")
        expect(result.value).toBe("42")
        expect(after?.claim).toMatchObject({ ownerId: "host-b", generation: 2 })
        expect(after?.resource?.resourceId).toBe(before?.resource?.resourceId)
        expect(yield* resourceCount).toBe(1)
      }),
    ))

  test("replaces a mismatched profile with a new epoch and an exact state account", () =>
    withRemote(make, ({ pool, changedProfileHost, changedProfile, authority, expire, resourceCount }) =>
      Effect.gen(function* () {
        yield* run(pool, "profile-change", "seed", "const restored = 7; const dropped = new AbortController()")
        yield* expire("profile-change")
        const observed = yield* observe(changedProfileHost, "profile-change", "replacement", "restored")
        const result = yield* observed.result
        expect(observed.events.map((event) => event._tag)).toEqual([
          "KernelRestarted",
          "StateRestored",
          "StateLost",
          "KernelReady",
          "Result",
        ])
        expect(observed.events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4])
        expect(observed.events[1]).toMatchObject({ names: ["restored"] })
        expect(observed.events[2]).toMatchObject({ droppedNames: ["dropped"] })
        expect(result).toMatchObject({ epoch: 1, value: "7" })
        const lease = yield* authority.inspect("profile-change")
        expect(lease?.resource?.epoch).toBe(1)
        expect(lease?.resource?.profileDigest.length).toBeGreaterThan(0)
        expect(lease?.requestedProfileDigest).toBe(digest(changedProfile))
        expect(lease?.resource?.profileDigest).toBe(digest(changedProfile))
        expect(lease?.resource?.provider).toBe(changedProfile.provider)
        expect(yield* resourceCount).toBe(1)
      }),
    ))

  test("maps connection loss before admission to no evaluation and after admission to unknown", () =>
    withRemote(make, ({ pool, loseNextConnection, executionCount }) =>
      Effect.gen(function* () {
        yield* loseNextConnection("before-admission")
        const before = yield* request(pool, "loss", "before", "1").pipe(Effect.flip)
        expect(Schema.is(KernelUnavailable)(before)).toBe(true)
        expect(yield* executionCount("loss", "before")).toBe(0)

        yield* loseNextConnection("after-admission")
        const admitted = yield* request(pool, "loss", "uncertain", "2")
        const unknown = yield* admitted.result.pipe(Effect.flip)
        expect(Schema.is(CellOutcomeUnknown)(unknown)).toBe(true)
        expect(yield* executionCount("loss", "uncertain")).toBe(1)
      }),
    ))

  test("returns a proven terminal result after response loss and never replays uncertain source", () =>
    withRemote(make, ({ pool, loseNextConnection, executionCount }) =>
      Effect.gen(function* () {
        yield* loseNextConnection("after-result")
        expect((yield* run(pool, "proof", "proven", "21 * 2")).value).toBe("42")
        expect(yield* executionCount("proof", "proven")).toBe(1)

        yield* loseNextConnection("after-admission")
        const execution = yield* request(pool, "proof", "never-replay", "globalThis.effect = 1")
        expect(Schema.is(CellOutcomeUnknown)(yield* execution.result.pipe(Effect.flip))).toBe(true)
        yield* pool.inspect({ sessionId: "proof" })
        expect(yield* executionCount("proof", "never-replay")).toBe(1)
      }),
    ))

  test("pauses only while idle and reports live-process resume explicitly", () =>
    withRemote(make, ({ pool, hostB, authority, expire, pause }) =>
      Effect.gen(function* () {
        yield* run(pool, "pause", "seed", "const pausedValue = 42")
        const active = yield* request(pool, "pause", "active", "await new Promise(() => {})")
        expect(yield* pause("pause")).toBe(false)
        expect((yield* pool.interrupt("pause", "active"))._tag).toBe("Interrupted")
        yield* Effect.exit(active.result)
        expect(yield* pause("pause")).toBe(true)
        expect((yield* authority.inspect("pause"))?.resource).toMatchObject({
          state: "paused",
          checkpoint: "live-process",
        })
        yield* expire("pause")
        const inspection: Inspection = yield* hostB.inspect({ sessionId: "pause" })
        expect(inspection).toMatchObject({ epoch: 0, recovery: "live-process" })
        expect((yield* run(hostB, "pause", "resumed", "pausedValue")).value).toBe("42")
      }),
    ))

  test("deletes live and paused resources on close", () =>
    withRemote(make, ({ pool, authority, pause, resourceCount }) =>
      Effect.gen(function* () {
        yield* run(pool, "close-live", "seed-live", "1")
        yield* run(pool, "close-paused", "seed-paused", "2")
        expect(yield* pause("close-paused")).toBe(true)
        yield* pool.close("close-live")
        yield* pool.close("close-paused")
        expect((yield* authority.inspect("close-live"))?.resource).toBeUndefined()
        expect((yield* authority.inspect("close-paused"))?.resource).toBeUndefined()
        expect(yield* resourceCount).toBe(0)
      }),
    ))

  test("retains failed deletion visibly and retries the exact resource", () =>
    withRemote(make, ({ pool, authority, failNextDeletion, retryCleanup, resourceCount }) =>
      Effect.gen(function* () {
        yield* run(pool, "cleanup", "seed", "1")
        yield* failNextDeletion
        yield* pool.close("cleanup").pipe(Effect.flip)
        const pending = yield* authority.pendingDeletion
        expect(pending).toHaveLength(1)
        expect(pending[0]?.resource?.state).toBe("deleting")
        expect(pending[0]?.resource?.resourceId.length).toBeGreaterThan(0)
        expect(pending[0]?.resource?.cleanupFailure?.attempts).toBe(1)
        expect(yield* resourceCount).toBe(1)
        yield* retryCleanup
        expect(yield* authority.pendingDeletion).toEqual([])
        expect(yield* resourceCount).toBe(0)
      }),
    ))

  test("keeps provider resource IDs and control secrets out of model-visible data", () =>
    withRemote(make, ({ pool, profile, forbiddenModelText }) =>
      Effect.gen(function* () {
        const observed = yield* observe(pool, "redaction", "cell", "42")
        const result = yield* observed.result
        const visible = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          profile,
          events: observed.events,
          result,
        })
        for (const forbidden of forbiddenModelText) expect(visible).not.toContain(forbidden)
      }),
    ))
}

/** @experimental Register the shared KernelPool provider contract and optional remote guarantees. */
export const kernelProviderConformance = <CommonError, RemoteError>(
  options: Options<CommonError, RemoteError>,
): void => {
  const suite = options.skip === true ? describe.skip : describe
  suite(`${options.name} KernelPool provider conformance`, () => {
    const test = options.live === true ? liveTest : effectTest
    registerCommon(options, test)
    if (options.remote !== undefined) registerRemote(options.remote, test)
  })
}
