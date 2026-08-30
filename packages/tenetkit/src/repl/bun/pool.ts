import { Clock, Duration, Effect, Exit, Fiber, Layer, RcMap, Ref, Scope, Semaphore, Stream } from "effect"
import type { CellEvent, CellFailure, CellId, KernelUnavailable, RestartReason, SessionId } from "../cell.js"
import {
  type Execution,
  type ExecuteRequest,
  type Inspection,
  type Service as KernelPoolService,
  type InspectRequest,
  type Interruption,
  KernelPool,
  type Restart,
} from "../kernel-pool.js"
import { KernelStateStore } from "../kernel-state-store.js"
import { HostModules, type Service as HostModulesService } from "../host-modules.js"
import { type CheckpointKind, type KernelProfile, digest } from "../kernel-profile.js"
import { type Kernel, make as makeKernel } from "./kernel.js"
import { toSnapshot, unavailable } from "./runtime.js"

/** @experimental How the pool boots and retires the one kernel that owns each Session. */
export interface Options {
  readonly profile: KernelProfile
  readonly runtimeCommand: string
  readonly workerModule: string
  readonly startTimeoutMillis: number
  readonly interruptGraceMillis: number
  /** @experimental Host source evaluated on every worker start, after restore, before any cell. */
  readonly bootstrap?: string
  readonly captureTimeoutMillis?: number | undefined
  readonly maxConcurrentBoots: number
  readonly idleTimeToLive: Duration.Input
  readonly environment: Readonly<Record<string, string>>
}

interface Lease {
  readonly kernel: Kernel
  readonly generation: number
}

interface SessionState {
  readonly epoch: number
  readonly recovery: CheckpointKind
  readonly lease: Lease | undefined
}

const initialState: SessionState = { epoch: 0, recovery: "restart-only", lease: undefined }

/**
 * @experimental One live Bun kernel per Session, owned by a Server-scoped reference-counted map.
 * A Session reuses its kernel across Runs, and the map's own scope releases every kernel on Server
 * shutdown. The pool adds no poll, no keepalive, and no timer that survives a completed cell: a
 * kernel's reference is held for exactly the duration of a cell, and idle eviction is the map's
 * reference-count expiry rather than a sweep.
 */
export const make = (options: Options): Effect.Effect<KernelPoolService, never, KernelStateStore | Scope.Scope> =>
  Effect.gen(function* () {
    const store = yield* KernelStateStore
    const mounted = yield* Effect.serviceOption(HostModules)
    const bindings: HostModulesService | undefined = mounted._tag === "Some" ? mounted.value : undefined
    const boots = yield* Semaphore.make(Math.max(options.maxConcurrentBoots, 1))
    const states = yield* Ref.make(new Map<string, SessionState>())
    const generations = yield* Ref.make(0)
    const profileDigest = digest(options.profile)
    const captureTimeoutMillis = options.captureTimeoutMillis ?? 2_000
    const workspace = options.profile.workspace

    const stateOf = (sessionId: string): Effect.Effect<SessionState> =>
      Ref.get(states).pipe(Effect.map((all) => all.get(sessionId) ?? initialState))

    const putState = (sessionId: string, next: SessionState): Effect.Effect<void> =>
      Ref.update(states, (all) => new Map(all).set(sessionId, next))

    const boot = (sessionId: SessionId): Effect.Effect<Lease, KernelUnavailable, Scope.Scope> =>
      boots.withPermits(1)(
        Effect.gen(function* () {
          const state = yield* stateOf(sessionId)
          const generation = yield* Ref.updateAndGet(generations, (value) => value + 1)
          const kernel = yield* makeKernel({
            sessionId,
            epoch: state.epoch,
            workspaceRoot: workspace.root,
            runtimeCommand: options.runtimeCommand,
            workerModule: options.workerModule,
            startTimeoutMillis: options.startTimeoutMillis,
            environment: options.environment,
            registry: bindings,
            controlTimeoutMillis: captureTimeoutMillis,
          })
          yield* kernel.mount
          const snapshot = yield* store.load(sessionId).pipe(Effect.orElseSucceed(() => undefined))
          let recovery: CheckpointKind = "restart-only"
          if (snapshot !== undefined) {
            const restored = yield* kernel.restore(new TextDecoder().decode(snapshot.payload)).pipe(Effect.option)
            if (restored._tag === "Some" && restored.value.failure === undefined) recovery = "namespace"
          }
          /**
           * A host assembles the mounted surface into whatever shape its cells are written
           * against, and does it here: after restore, so the bootstrap always describes the
           * worker that actually exists, and before any model cell, so the first cell sees the
           * same surface as the last. It is deliberately not snapshot-restored — a restored
           * binding would close over a dead worker's handles.
           */
          if (options.bootstrap !== undefined) {
            const bootstrapped = yield* kernel.execute({
              cellId: `bootstrap-${generation}`,
              code: options.bootstrap,
              deadlineMillis: options.profile.limits.cellDeadlineMillis,
              sequenceStart: 0,
            })
            const drained = yield* Effect.forkChild(
              Stream.runDrain(Stream.fromQueue(bootstrapped.events)).pipe(Effect.ignore),
            )
            yield* bootstrapped.outcome.pipe(Effect.ignore)
            yield* Fiber.await(drained).pipe(Effect.ignore)
          }
          const lease: Lease = { kernel, generation }
          yield* putState(sessionId, { ...state, recovery, lease })
          yield* Effect.addFinalizer(() =>
            Effect.flatMap(stateOf(sessionId), (current) =>
              current.lease?.generation === generation
                ? putState(sessionId, { ...current, lease: undefined })
                : Effect.void,
            ),
          )
          return lease
        }),
      )

    const kernels = yield* RcMap.make({
      lookup: boot,
      idleTimeToLive: options.idleTimeToLive,
    })

    const retire = (sessionId: SessionId, lease: Lease): Effect.Effect<void> =>
      Effect.gen(function* () {
        const retired = yield* Ref.modify(states, (all) => {
          const current = all.get(sessionId) ?? initialState
          if (current.lease?.generation !== lease.generation) return [false, all]
          return [true, new Map(all).set(sessionId, { ...current, lease: undefined })]
        })
        if (retired) yield* RcMap.invalidate(kernels, sessionId)
      }).pipe(Effect.uninterruptible)

    const capture = (sessionId: SessionId, lease: Lease): Effect.Effect<void> =>
      Effect.gen(function* () {
        const captured = yield* lease.kernel.capture
        const savedAtMillis = yield* Clock.currentTimeMillis
        yield* store.save(
          toSnapshot({
            sessionId,
            epoch: lease.kernel.epoch,
            profileDigest,
            savedAtMillis,
            payload: captured.payload,
            restored: captured.restored,
            dropped: captured.dropped,
          }),
        )
      }).pipe(Effect.timeoutOption(captureTimeoutMillis), Effect.ignore)

    const useKernel = <A>(
      sessionId: SessionId,
      use: (lease: Lease) => Effect.Effect<A, CellFailure>,
    ): Effect.Effect<A, CellFailure> => Effect.scoped(Effect.flatMap(RcMap.get(kernels, sessionId), use))

    /**
     * Enforce the profile's cell deadline from the host. The worker's `vm` watchdog terminates only
     * synchronous evaluation, so a cell that awaits never reaches it; without a host-side ceiling a
     * cell waiting on a hung request would hold its Session forever while the profile digest still
     * claimed a bound. This runs one grace period behind the worker's own deadline so a cell the
     * watchdog can terminate in place — with its namespace intact — is reported as the timeout it
     * is, and the host only escalates when that did not happen.
     */
    const stopOverdueCell = (cellId: CellId, lease: Lease): Effect.Effect<void> =>
      lease.kernel.interrupt(cellId, options.interruptGraceMillis).pipe(
        Effect.flatMap((outcome) => (outcome === "Unresponsive" ? lease.kernel.kill.pipe(Effect.ignore) : Effect.void)),
        Effect.ignore,
      )

    const watchAbort = (signal: AbortSignal): Effect.Effect<void> =>
      Effect.callback<void>((resume) => {
        if (signal.aborted) {
          resume(Effect.void)
          return
        }
        const onAbort = (): void => resume(Effect.void)
        signal.addEventListener("abort", onAbort, { once: true })
        return Effect.sync(() => signal.removeEventListener("abort", onAbort))
      })

    return {
      execute: (request: ExecuteRequest) =>
        Effect.gen(function* () {
          const sourceBytes = new TextEncoder().encode(request.code).byteLength
          if (sourceBytes > options.profile.limits.sourceBytes) {
            return yield* unavailable({
              sessionId: request.sessionId,
              reason: "profile-mismatch",
              message: `the cell source is ${sourceBytes} bytes, over the profile bound of ${options.profile.limits.sourceBytes}`,
            })
          }
          const cellScope = yield* Scope.make()
          return yield* Effect.gen(function* () {
            const lease = yield* RcMap.get(kernels, request.sessionId)
            const prelude: ReadonlyArray<CellEvent> = [
              {
                _tag: "KernelReady",
                cellId: request.cellId,
                sequence: 0,
                sessionId: request.sessionId,
                epoch: lease.kernel.epoch,
                profileDigest,
              },
            ]
            const started = yield* lease.kernel.execute({
              cellId: request.cellId,
              code: request.code,
              deadlineMillis: options.profile.limits.cellDeadlineMillis,
              sequenceStart: prelude.length,
            })
            yield* watchAbort(request.signal).pipe(
              Effect.andThen(lease.kernel.interrupt(request.cellId, options.interruptGraceMillis)),
              Effect.ignore,
              Effect.forkIn(cellScope),
            )
            yield* Effect.sleep(options.profile.limits.cellDeadlineMillis + options.interruptGraceMillis).pipe(
              Effect.andThen(stopOverdueCell(request.cellId, lease)),
              Effect.ignore,
              Effect.forkIn(cellScope),
            )
            /**
             * Interrupting the caller is itself a cancellation, and it is the only one that must
             * stop the cell outright. The abort signal a host passes is watched by a fiber in
             * `cellScope`, which closes as this result settles, so an interrupted caller would
             * tear that watcher down before the signal fired and leave the cell running unstopped.
             *
             * Killing the kernel is the honest remedy rather than an in-place interrupt: an
             * interrupt only rejects what the host awaits, while the cell's own continuations keep
             * running, so a cell that awaited a timer before writing a file would still land that
             * write after the caller was told it had been cancelled. The process is the only
             * boundary that actually ends the work. The namespace dies with it, which is why
             * `interrupt` keeps its in-place meaning for callers that want the session to survive.
             */
            const execution: Execution = {
              events: Stream.concat(Stream.fromIterable(prelude), Stream.fromQueue(started.events)),
              result: started.outcome.pipe(
                Effect.onInterrupt(() =>
                  lease.kernel.kill.pipe(Effect.ignore, Effect.andThen(retire(request.sessionId, lease))),
                ),
                Effect.onExit(() =>
                  capture(request.sessionId, lease).pipe(
                    Effect.andThen(Scope.close(cellScope, Exit.succeed(undefined))),
                  ),
                ),
              ),
            }
            return execution
          }).pipe(
            Scope.provide(cellScope),
            Effect.onError(() => Scope.close(cellScope, Exit.succeed(undefined))),
          )
        }),
      inspect: (request: InspectRequest) =>
        useKernel(request.sessionId, (lease) =>
          Effect.gen(function* () {
            const bound = yield* lease.kernel.inspect
            const state = yield* stateOf(request.sessionId)
            const inspection: Inspection = {
              sessionId: request.sessionId,
              epoch: state.epoch,
              profile: options.profile,
              recovery: state.recovery,
              bindings: request.name === undefined ? bound : bound.filter((b) => b.name === request.name),
            }
            return inspection
          }),
        ),
      interrupt: (sessionId: SessionId, cellId: CellId) =>
        Effect.flatMap(stateOf(sessionId), (state) =>
          state.lease === undefined
            ? Effect.succeed<Interruption>({ sessionId, cellId, _tag: "NotRunning" })
            : state.lease.kernel
                .interrupt(cellId, options.interruptGraceMillis)
                .pipe(Effect.map((tag): Interruption => ({ sessionId, cellId, _tag: tag }))),
        ),
      restart: (sessionId: SessionId, reason: RestartReason) =>
        Effect.gen(function* () {
          const state = yield* stateOf(sessionId)
          if (state.lease !== undefined) yield* capture(sessionId, state.lease)
          const snapshot = yield* store.load(sessionId).pipe(Effect.orElseSucceed(() => undefined))
          const epoch = state.epoch + 1
          const recovery: CheckpointKind = snapshot === undefined ? "restart-only" : "namespace"
          yield* putState(sessionId, { epoch, recovery, lease: undefined })
          if (state.lease !== undefined) yield* state.lease.kernel.kill.pipe(Effect.ignore)
          yield* RcMap.invalidate(kernels, sessionId)
          const restart: Restart = {
            sessionId,
            epoch,
            reason,
            recovery,
            restoredNames: snapshot === undefined ? [] : snapshot.manifest.restored.map((binding) => binding.name),
            droppedNames: snapshot === undefined ? [] : snapshot.manifest.dropped.map((binding) => binding.name),
          }
          return restart
        }),
      close: (sessionId: SessionId) =>
        Effect.gen(function* () {
          const state = yield* stateOf(sessionId)
          if (state.lease !== undefined) yield* capture(sessionId, state.lease)
          if (state.lease !== undefined) yield* state.lease.kernel.kill.pipe(Effect.ignore)
          yield* RcMap.invalidate(kernels, sessionId)
          yield* putState(sessionId, { ...state, lease: undefined })
        }),
    }
  })

/** @experimental One Server-scoped pool of live Bun kernels, one per Session. */
export const layer = (options: Options): Layer.Layer<KernelPool, never, KernelStateStore> =>
  Layer.effect(KernelPool, make(options).pipe(Effect.map(KernelPool.of)))
