import { Duration, Effect, FileSystem, Layer, Path, Ref, Schema, Stream } from "effect"
import type { CellEvent, CellFailure } from "../repl/cell.js"
import { KernelPool, type Service as KernelPoolService } from "../repl/kernel-pool.js"
import {
  KernelSnapshotStore,
  type Service as KernelSnapshotStoreService,
  type Snapshot,
} from "../repl/kernel-snapshot-store.js"
import {
  type AcquireOptions,
  ExecutionFailed,
  type Limits,
  LimitExceeded,
  make,
  type SandboxError,
  type SandboxProviderService,
  SandboxProvider,
  type SandboxService,
  SnapshotNotFound,
  TypeScriptCommand,
  Unavailable,
  Unsupported,
  wallClockMillis,
} from "./service.js"
import { rootedFileSystem } from "./file-system.js"

/** @experimental Bun kernel provider configuration. */
export interface BunKernelOptions {
  readonly image: string
  readonly workspaceRoot: string
  readonly limits?: Limits
}

const unsupported = (operation: Unsupported["operation"], message: string): Unsupported =>
  Unsupported.make({ operation, message })

const executionFailure = (failure: CellFailure): ExecutionFailed =>
  ExecutionFailed.make({ message: failure.message, cause: failure })

const snapshotFailure = (message: string, cause: unknown): ExecutionFailed => ExecutionFailed.make({ message, cause })

const requestedLimits = (configured: Limits, requested: Limits | undefined): Effect.Effect<Limits, Unsupported> => {
  if (requested?.cpuMs !== undefined)
    return Effect.fail(unsupported("limit:cpu", "BunKernel does not enforce CPU time independently of wall clock"))
  if (requested?.memoryMb !== undefined)
    return Effect.fail(unsupported("limit:memory", "BunKernel does not enforce a per-sandbox memory bound"))
  const maximum = wallClockMillis(configured)
  const requestedWallClock = requested === undefined ? undefined : wallClockMillis(requested)
  if (requestedWallClock !== undefined && maximum !== undefined && requestedWallClock > maximum) {
    return Effect.fail(
      unsupported("limit:wall-clock", `requested wall clock ${requestedWallClock}ms exceeds ${maximum}ms`),
    )
  }
  if (requestedWallClock === undefined) return Effect.succeed(configured)
  return Effect.succeed({ ...configured, wallClock: Duration.millis(requestedWallClock) })
}

const immutableSnapshot = (store: KernelSnapshotStoreService, sessionId: string) =>
  store.load(sessionId).pipe(
    Effect.flatMap((snapshot) =>
      snapshot === undefined
        ? Effect.fail(ExecutionFailed.make({ message: `BunKernel produced no snapshot for ${sessionId}` }))
        : store
            .saveImmutable(snapshot)
            .pipe(Effect.mapError((cause) => snapshotFailure(`BunKernel snapshot failed for ${sessionId}`, cause))),
    ),
    Effect.mapError((cause) =>
      Schema.is(ExecutionFailed)(cause) ? cause : snapshotFailure(`BunKernel snapshot failed for ${sessionId}`, cause),
    ),
  )

const restoreSnapshot = (
  store: KernelSnapshotStoreService,
  snapshotId: string,
  sessionId: string,
): Effect.Effect<void, SandboxError> =>
  Effect.gen(function* () {
    const snapshot = yield* store
      .loadImmutable(snapshotId)
      .pipe(Effect.mapError((cause) => snapshotFailure(`BunKernel snapshot ${snapshotId} is unreadable`, cause)))
    if (snapshot === undefined) return yield* SnapshotNotFound.make({ snapshotId })
    const restored: Snapshot = {
      manifest: { ...snapshot.manifest, sessionId },
      payload: snapshot.payload,
    }
    yield* store
      .save(restored)
      .pipe(Effect.mapError((cause) => snapshotFailure(`BunKernel fork failed for ${snapshotId}`, cause)))
  })

/** @experimental Construct a provider over an existing BunKernelPool and BunKernelSnapshotStore. */
export const makeBunKernelProvider = (
  options: BunKernelOptions,
): Effect.Effect<SandboxProviderService, never, FileSystem.FileSystem | KernelPool | KernelSnapshotStore | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const pool = yield* KernelPool
    const store = yield* KernelSnapshotStore
    const paused = yield* Ref.make<ReadonlySet<string>>(new Set())
    const nextId = yield* Ref.make(0)
    const configuredLimits = options.limits ?? {}
    const sandboxFiles = rootedFileSystem(fileSystem, path, options.workspaceRoot)

    const freshId = Ref.updateAndGet(nextId, (value) => value + 1).pipe(Effect.map((value) => `bun-kernel-${value}`))
    const isPaused = (sessionId: string) => Ref.get(paused).pipe(Effect.map((all) => all.has(sessionId)))
    const markPaused = (sessionId: string, value: boolean) =>
      Ref.update(paused, (all) => {
        const next = new Set(all)
        if (value) next.add(sessionId)
        else next.delete(sessionId)
        return next
      })

    const sandbox = (sessionId: string, limits: Limits): SandboxService => {
      const start: SandboxService["start"] = (command) => {
        if (!Schema.is(TypeScriptCommand)(command)) {
          const operation = command._tag === "Process" ? "exec:process" : "exec:javascript-module"
          return Effect.fail(unsupported(operation, `BunKernel does not execute ${command._tag} commands`))
        }
        return Effect.gen(function* () {
          if (yield* isPaused(sessionId)) return yield* Unavailable.make({ message: `sandbox ${sessionId} is paused` })
          const execution = yield* pool
            .execute({ sessionId, cellId: command.cellId, code: command.source })
            .pipe(Effect.mapError(executionFailure))
          const events = execution.events.pipe(
            Stream.mapError(executionFailure),
            Stream.flatMap((event: CellEvent) => {
              const metadata = { _tag: "Metadata" as const, value: event }
              if (event._tag === "Stdout" || event._tag === "Stderr") {
                return Stream.fromIterable([
                  {
                    _tag: "Output" as const,
                    channel: event._tag === "Stdout" ? ("stdout" as const) : ("stderr" as const),
                    text: event.text,
                  },
                  metadata,
                ])
              }
              return Stream.succeed(metadata)
            }),
          )
          const deadline = wallClockMillis(limits)
          const result = execution.result.pipe(
            Effect.mapError(executionFailure),
            Effect.map((cell) => ({
              stdout: cell.stdout,
              stderr: cell.stderr,
              exitCode: 0,
              value: cell,
            })),
          )
          return {
            events,
            result:
              deadline === undefined
                ? result
                : result.pipe(
                    Effect.timeoutOrElse({
                      duration: Duration.millis(deadline),
                      orElse: () => Effect.fail(LimitExceeded.make({ resource: "wall-clock", limit: deadline })),
                    }),
                  ),
          }
        })
      }
      return make({
        isolation: "process",
        limits,
        capabilities: {
          commands: ["TypeScript"],
          files: true,
          pause: true,
          resume: true,
          snapshot: true,
          fork: true,
          limits: ["wall-clock"],
        },
        start,
        files: Effect.succeed(sandboxFiles),
        pause: pool
          .close(sessionId)
          .pipe(Effect.mapError(executionFailure), Effect.andThen(markPaused(sessionId, true))),
        resume: markPaused(sessionId, false),
        snapshot: immutableSnapshot(store, sessionId),
        fork: (snapshotId) =>
          Effect.gen(function* () {
            const forkId = yield* freshId
            yield* restoreSnapshot(store, snapshotId, forkId)
            return sandbox(forkId, limits)
          }),
      })
    }

    return SandboxProvider.of({
      defaultImage: options.image,
      acquire: (request: AcquireOptions = {}) =>
        Effect.gen(function* () {
          if (request.image !== undefined && request.image !== options.image) {
            return yield* Unavailable.make({
              message: `BunKernel image ${request.image} does not match configured image ${options.image}`,
            })
          }
          const limits = yield* requestedLimits(configuredLimits, request.limits)
          const sessionId = request.key ?? (yield* freshId)
          return sandbox(sessionId, limits)
        }),
    })
  })

/** @experimental Provide the process-isolated BunKernel Sandbox leaf. */
export const layerBunKernel = (
  options: BunKernelOptions,
): Layer.Layer<SandboxProvider, never, FileSystem.FileSystem | KernelPool | KernelSnapshotStore | Path.Path> =>
  Layer.effect(SandboxProvider, makeBunKernelProvider(options))
