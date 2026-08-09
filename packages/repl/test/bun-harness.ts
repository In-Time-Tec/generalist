import { Context, Duration, Effect, FileSystem, Layer, Path, Scope, Stream } from "effect"
import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import type { BunServices } from "@effect/platform-bun/BunServices"
import type { PlatformError } from "effect"
import type { CellEvent, CellFailure, CellResult } from "../src/repl/cell.js"
import type { Execution, Interface as KernelPoolInterface } from "../src/repl/kernel-pool.js"
import { KernelStateStore } from "../src/repl/kernel-state-store.js"
import { HostBindingRegistry, KernelProfile } from "../src/index.js"
import { BunKernelPool, BunKernelStateStore } from "../src/repl/bun.js"

/** The kernel worker module a real-worker test spawns. */
export const workerModule = new URL("../src/repl/bun-worker.ts", import.meta.url).pathname

/** The Baton workspace root cells resolve imports and `require` against. */
export const workspaceRoot = new URL("../../..", import.meta.url).pathname

/** Every platform service a real-worker test needs. */
export const platform: Layer.Layer<BunServices | Path.Path> = Layer.merge(bunLayer, Path.layer)

/**
 * Real-worker suites opt out of the test services. The kernel's interrupt ladder and deadline
 * escalation are built from `Effect.sleep`, and under the default test clock those sleeps never
 * elapse, so a kernel operation that is merely waiting looks exactly like a kernel that has hung.
 */
export const liveOptions = { excludeTestServices: true } as const

/**
 * Per-test kernel bounds a real-worker test narrows. `idleTimeToLive` defaults to five minutes on
 * purpose: a zero time-to-live releases the kernel the instant a cell's scope closes, so every cell
 * would silently get a fresh worker and the Session-reuses-its-kernel invariant would not hold. A
 * test that wants eviction shortens it for that test alone.
 */
export interface PoolOverrides {
  readonly channelBytes?: number
  readonly sourceBytes?: number
  readonly cellDeadlineMillis?: number
  readonly idleTimeToLive?: Duration.Input
  readonly interruptGraceMillis?: number
  readonly maxConcurrentBoots?: number
  readonly startTimeoutMillis?: number
  readonly workspaceRoot?: string
  readonly workerModuleOverride?: string
  readonly modules?: ReadonlyArray<HostBindingRegistry.Module>
}

/** What one real-worker test is handed. */
export interface Harness {
  readonly pool: KernelPoolInterface
  readonly dataRoot: string
  readonly profile: KernelProfile.KernelProfile
  /** How many kernel workers this test process currently owns. */
  readonly ownWorkers: Effect.Effect<number>
}

const ownWorkerCount = (listing: string): number =>
  listing
    .split("\n")
    .filter((line) => line.includes(workerModule))
    .filter((line) => Number(line.trim().split(/\s+/)[1]) === process.pid).length

/**
 * Workers spawned by THIS test process, found by parent-process descent. A global scan of the
 * process table also sees workers from other suites, from an unrelated leak, or from a developer's
 * own Rika, and would fail for reasons that have nothing to do with the code under test.
 */
export const ownWorkers: Effect.Effect<number> = Effect.promise(() =>
  Bun.$`ps -eo pid=,ppid=,command=`.nothrow().text(),
).pipe(Effect.map(ownWorkerCount))

const registryContext = (
  modules: ReadonlyArray<HostBindingRegistry.Module> | undefined,
): Effect.Effect<Context.Context<never>> =>
  modules === undefined
    ? Effect.succeed(Context.empty())
    : HostBindingRegistry.make(modules).pipe(
        Effect.map((registry) => Context.make(HostBindingRegistry.HostBindingRegistry, registry)),
        Effect.orDie,
      )

const profileFor = (input: {
  readonly root: string
  readonly dataRoot: string
  readonly overrides: PoolOverrides | undefined
}): KernelProfile.KernelProfile =>
  KernelProfile.make({
    runtime: { name: "bun", version: Bun.version, digest: "test-digest" },
    bindingsDigest: KernelProfile.bindingsDigest([]),
    workspace: { root: input.root, dataRoot: input.dataRoot },
    limits: {
      sourceBytes: input.overrides?.sourceBytes ?? 65_536,
      channelBytes: input.overrides?.channelBytes ?? 262_144,
      cellDeadlineMillis: input.overrides?.cellDeadlineMillis ?? 5_000,
    },
    trustMode: "trusted-local",
  })

/** One real-worker test: what it needs, and what it does with it. */
export interface PoolRequest<A, E, R> {
  readonly overrides?: PoolOverrides
  readonly use: (harness: Harness) => Effect.Effect<A, E, R>
}

/**
 * One Server-scoped pool over real Bun kernel child processes, on a temporary data root that the
 * test scope removes. Every kernel, pipe, and snapshot file this creates is released when the
 * request's `use` returns, however it returns.
 */
export const withPool = <A, E, R>(
  request: PoolRequest<A, E, R>,
): Effect.Effect<A, E | PlatformError.PlatformError, Exclude<R, Scope.Scope> | BunServices | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const dataRoot = yield* fileSystem.makeTempDirectoryScoped({ prefix: "baton-kernel-" })
    const overrides = request.overrides
    const profile = profileFor({ root: overrides?.workspaceRoot ?? workspaceRoot, dataRoot, overrides })
    const store = yield* BunKernelStateStore.make({ dataRoot })
    const pool = yield* BunKernelPool.make({
      profile,
      runtimeCommand: "bun",
      workerModule: overrides?.workerModuleOverride ?? workerModule,
      startTimeoutMillis: overrides?.startTimeoutMillis ?? 20_000,
      interruptGraceMillis: overrides?.interruptGraceMillis ?? 250,
      maxConcurrentBoots: overrides?.maxConcurrentBoots ?? 4,
      idleTimeToLive: overrides?.idleTimeToLive ?? Duration.minutes(5),
      environment: {},
    }).pipe(
      Effect.provideService(KernelStateStore, store),
      Effect.provideContext(yield* registryContext(overrides?.modules)),
    )
    return yield* request.use({ pool, dataRoot, profile, ownWorkers })
  }).pipe(Effect.scoped)

/** One cell submitted to a session of a live pool. */
export interface CellRequest {
  readonly pool: KernelPoolInterface
  readonly sessionId: string
  readonly cellId: string
  readonly code: string
  readonly signal?: AbortSignal
}

const submit = (request: CellRequest): Effect.Effect<Execution, CellFailure> =>
  request.pool.execute({
    sessionId: request.sessionId,
    cellId: request.cellId,
    code: request.code,
    signal: request.signal ?? AbortSignal.any([]),
  })

/** One cell awaited to its terminal outcome. */
export const runCell = (request: CellRequest): Effect.Effect<CellResult, CellFailure> =>
  submit(request).pipe(Effect.flatMap((execution) => execution.result))

/** One cell's streamed events, plus its still-awaitable terminal outcome. */
export interface Observed {
  readonly events: ReadonlyArray<CellEvent>
  readonly result: Effect.Effect<CellResult, CellFailure>
}

/** One cell's events drained to completion, with its outcome left for the caller to observe. */
export const collect = (request: CellRequest): Effect.Effect<Observed, CellFailure> =>
  submit(request).pipe(
    Effect.flatMap((execution) =>
      Stream.runCollect(execution.events).pipe(
        Effect.map((events): Observed => ({ events: events as ReadonlyArray<CellEvent>, result: execution.result })),
      ),
    ),
  )

/**
 * One cell whose terminal outcome is awaited BEFORE its events are drained. Ending a settled cell's
 * event queue must complete it, never discard what it already holds: a consumer is free to take the
 * result first and read the events afterwards, and it must still see every event including the
 * `Result`.
 */
export const collectAfterResult = (request: CellRequest): Effect.Effect<Observed, CellFailure> =>
  submit(request).pipe(
    Effect.flatMap((execution) =>
      Effect.exit(execution.result).pipe(
        Effect.andThen(Stream.runCollect(execution.events)),
        Effect.map((events): Observed => ({ events: events as ReadonlyArray<CellEvent>, result: execution.result })),
      ),
    ),
  )
