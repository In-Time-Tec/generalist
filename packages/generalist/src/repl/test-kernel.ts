import { Clock, Effect, Layer, Ref, Schema, Stream } from "effect"
import {
  CellExecutionFailed,
  type CellEvent,
  type CellFailure,
  type CellResult,
  KernelUnavailable,
  type RestartReason,
} from "./cell.js"
import {
  type Binding,
  type Execution,
  type ExecuteRequest,
  type Inspection,
  type Service as KernelPoolService,
  type Interruption,
  KernelPool,
  type Restart,
} from "./kernel-pool.js"
import { ExecutionFailed, make as makeSandbox, SandboxProvider, Unsupported, Unavailable } from "../sandbox/service.js"
import {
  type Service as KernelSnapshotStoreService,
  KernelSnapshotStore,
  KernelStateUnavailable,
  Manifest,
  snapshotId,
  type Snapshot,
} from "./kernel-snapshot-store.js"
import { type KernelProfile, digest } from "./kernel-profile.js"

/** What the scripted pool does with one cell. */
export type Script =
  | { readonly _tag: "Value"; readonly value: string; readonly stdout?: string; readonly stderr?: string }
  | { readonly _tag: "Throw"; readonly name: string; readonly message: string; readonly stderr?: string }
  | { readonly _tag: "Failure"; readonly failure: CellFailure }
export interface TestPoolOptions {
  readonly profile: KernelProfile
  readonly script?: (request: ExecuteRequest) => Script
  readonly bindings?: ReadonlyArray<Binding>
}

interface SessionState {
  readonly epoch: number
  readonly running: string | undefined
  readonly closed: boolean
}

const initial: SessionState = { epoch: 0, running: undefined, closed: false }

const defaultScript = (request: ExecuteRequest): Script => ({ _tag: "Value", value: request.code })

/**
 * A KernelPool that evaluates nothing. It enforces the observable kernel contract —
 * cell-local monotonic sequences, epochs across restart, closed sessions — so hosts and projections
 * can be tested without a worker process.
 */
export const makeTest = (options: TestPoolOptions): Effect.Effect<KernelPoolService> =>
  Effect.gen(function* () {
    const sessions = yield* Ref.make(new Map<string, SessionState>())
    const script = options.script ?? defaultScript
    const bindings = options.bindings ?? []
    const profileDigest = digest(options.profile)
    const stateOf = (sessionId: string): Effect.Effect<SessionState> =>
      Ref.get(sessions).pipe(Effect.map((all) => all.get(sessionId) ?? initial))
    const update = (sessionId: string, next: SessionState): Effect.Effect<void> =>
      Ref.update(sessions, (all) => new Map(all).set(sessionId, next))
    const unavailable = (sessionId: string, reason: KernelUnavailable["reason"]): KernelUnavailable =>
      KernelUnavailable.make({ sessionId, reason, message: `session ${sessionId} is ${reason}` })
    return {
      execute: (request) =>
        Effect.gen(function* () {
          const state = yield* stateOf(request.sessionId)
          if (state.closed) return yield* unavailable(request.sessionId, "closed")
          yield* update(request.sessionId, { ...state, running: request.cellId })
          const startedAt = yield* Clock.currentTimeMillis
          const outcome = script(request)
          const completedAt = yield* Clock.currentTimeMillis
          const durationMillis = completedAt - startedAt
          const events: Array<CellEvent> = [
            {
              _tag: "KernelReady",
              cellId: request.cellId,
              sequence: 0,
              sessionId: request.sessionId,
              epoch: state.epoch,
              profileDigest,
            },
          ]
          const stdout = outcome._tag === "Value" ? (outcome.stdout ?? "") : ""
          let stderr = ""
          if (outcome._tag === "Value" || outcome._tag === "Throw") stderr = outcome.stderr ?? ""
          if (stdout.length > 0) {
            events.push({ _tag: "Stdout", cellId: request.cellId, sequence: events.length, text: stdout })
          }
          if (stderr.length > 0) {
            events.push({ _tag: "Stderr", cellId: request.cellId, sequence: events.length, text: stderr })
          }
          if (outcome._tag === "Value") {
            events.push({
              _tag: "Result",
              cellId: request.cellId,
              sequence: events.length,
              value: outcome.value,
              durationMillis,
            })
          }
          let result: Effect.Effect<CellResult, CellFailure>
          if (outcome._tag === "Value") {
            result = Effect.succeed({
              cellId: request.cellId,
              epoch: state.epoch,
              sequence: events.length - 1,
              value: outcome.value,
              stdout,
              stderr,
              durationMillis,
            })
          } else if (outcome._tag === "Throw") {
            result = Effect.fail(
              CellExecutionFailed.make({
                cellId: request.cellId,
                epoch: state.epoch,
                sequence: events.length,
                name: outcome.name,
                message: outcome.message,
                stdout,
                stderr,
                durationMillis,
              }),
            )
          } else {
            result = Effect.fail(outcome.failure)
          }
          const settle = Effect.flatMap(stateOf(request.sessionId), (current) =>
            update(request.sessionId, { ...current, running: undefined }),
          )
          const execution: Execution = {
            events: Stream.fromIterable(events),
            result: Effect.ensuring(result, settle),
          }
          return execution
        }),
      inspect: (request) =>
        Effect.gen(function* () {
          const state = yield* stateOf(request.sessionId)
          if (state.closed) return yield* unavailable(request.sessionId, "closed")
          const selected = request.name === undefined ? bindings : bindings.filter((b) => b.name === request.name)
          const recovery =
            state.epoch > 0 && options.profile.checkpoints.namespace
              ? ("namespace" as const)
              : ("restart-only" as const)
          const inspection: Inspection = {
            sessionId: request.sessionId,
            epoch: state.epoch,
            profile: options.profile,
            recovery,
            bindings: selected,
          }
          return inspection
        }),
      interrupt: (sessionId, cellId) =>
        Effect.gen(function* () {
          const state = yield* stateOf(sessionId)
          if (state.closed) return yield* unavailable(sessionId, "closed")
          const interruption: Interruption = {
            sessionId,
            cellId,
            _tag: state.running === cellId ? "Interrupted" : "NotRunning",
          }
          return interruption
        }),
      restart: (sessionId, reason: RestartReason) =>
        Effect.gen(function* () {
          const state = yield* stateOf(sessionId)
          if (state.closed) return yield* unavailable(sessionId, "closed")
          const epoch = state.epoch + 1
          yield* update(sessionId, { epoch, running: undefined, closed: false })
          const restart: Restart = {
            sessionId,
            epoch,
            reason,
            recovery: options.profile.checkpoints.namespace ? "namespace" : "restart-only",
            restoredNames: bindings.filter((binding) => binding.snapshotable).map((binding) => binding.name),
            droppedNames: bindings.filter((binding) => !binding.snapshotable).map((binding) => binding.name),
          }
          return restart
        }),
      close: (sessionId) =>
        Effect.flatMap(stateOf(sessionId), (state) =>
          update(sessionId, { ...state, running: undefined, closed: true }),
        ),
    }
  })
export const layerTestPool = (options: TestPoolOptions): Layer.Layer<KernelPool> =>
  Layer.effect(KernelPool, makeTest(options))

const sandboxUnsupported = (operation: Unsupported["operation"]): Unsupported =>
  Unsupported.make({ operation, message: `TestKernel does not support ${operation}` })

/**
 * A process-local Sandbox fake backed by TestKernel. It does not model an independent
 * security boundary and must not be used to certify a production provider.
 */
export const layerTestSandbox = (options: TestPoolOptions): Layer.Layer<SandboxProvider> =>
  Layer.effect(
    SandboxProvider,
    Effect.gen(function* () {
      const pool = yield* makeTest(options)
      const nextId = yield* Ref.make(0)
      return SandboxProvider.of({
        defaultImage: options.profile.image.reference,
        acquire: (request = {}) => {
          if (request.image !== undefined && request.image !== options.profile.image.reference) {
            return Effect.fail(Unavailable.make({ message: `TestKernel image ${request.image} is unavailable` }))
          }
          let limit: Unsupported["operation"] | undefined
          if (request.limits?.cpuMs !== undefined) limit = "limit:cpu"
          else if (request.limits?.memoryMb !== undefined) limit = "limit:memory"
          else if (request.limits?.wallClock !== undefined) limit = "limit:wall-clock"
          if (limit !== undefined) return Effect.fail(sandboxUnsupported(limit))
          return Ref.updateAndGet(nextId, (value) => value + 1).pipe(
            Effect.map((id) => {
              const sessionId = request.key ?? `test-kernel-${id}`
              const unavailable = (operation: Unsupported["operation"]) => Effect.fail(sandboxUnsupported(operation))
              return makeSandbox({
                isolation: "process",
                limits: {},
                capabilities: {
                  commands: ["TypeScript"],
                  files: false,
                  pause: false,
                  resume: false,
                  snapshot: false,
                  fork: false,
                  limits: [],
                },
                start: (command) =>
                  command._tag !== "TypeScript"
                    ? unavailable(command._tag === "Process" ? "exec:process" : "exec:javascript-module")
                    : pool.execute({ sessionId, cellId: command.cellId, code: command.source }).pipe(
                        Effect.mapError((cause) => ExecutionFailed.make({ message: cause.message, cause })),
                        Effect.map((execution) => ({
                          events: execution.events.pipe(
                            Stream.map((value) => ({ _tag: "Metadata" as const, value })),
                            Stream.mapError((cause) => ExecutionFailed.make({ message: cause.message, cause })),
                          ),
                          result: execution.result.pipe(
                            Effect.map((value) => ({ stdout: value.stdout, stderr: value.stderr, exitCode: 0, value })),
                            Effect.mapError((cause) => ExecutionFailed.make({ message: cause.message, cause })),
                          ),
                        })),
                      ),
                files: unavailable("files"),
                pause: unavailable("pause"),
                resume: unavailable("resume"),
                snapshot: unavailable("snapshot"),
                fork: () => unavailable("fork"),
              })
            }),
          )
        },
      })
    }),
  )

/** An in-memory snapshot store keyed by Session identity. */
export const makeMemoryStore: Effect.Effect<KernelSnapshotStoreService> = Effect.gen(function* () {
  const snapshots = yield* Ref.make(new Map<string, Snapshot>())
  const immutable = yield* Ref.make(new Map<string, Snapshot>())
  return {
    load: (sessionId) => Ref.get(snapshots).pipe(Effect.map((all) => all.get(sessionId))),
    save: (snapshot) =>
      Schema.is(Manifest)(snapshot.manifest)
        ? Ref.update(snapshots, (all) => new Map(all).set(snapshot.manifest.sessionId, snapshot))
        : Effect.fail(
            KernelStateUnavailable.make({
              sessionId: "unknown",
              reason: "corrupt",
              message: "snapshot manifest does not satisfy the manifest contract",
            }),
          ),
    drop: (sessionId) =>
      Ref.update(snapshots, (all) => {
        const next = new Map(all)
        next.delete(sessionId)
        return next
      }),
    saveImmutable: (snapshot) => {
      const id = snapshotId(snapshot)
      return Ref.update(immutable, (all) => new Map(all).set(id, snapshot)).pipe(Effect.as(id))
    },
    loadImmutable: (id) => Ref.get(immutable).pipe(Effect.map((all) => all.get(id))),
  }
})
export const layerMemoryStore: Layer.Layer<KernelSnapshotStore> = Layer.effect(KernelSnapshotStore, makeMemoryStore)

export * from "./test-kernel-resource-authority.js"
