import { Deferred, Effect, Fiber, Queue, Random, Schema, Scope, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { KernelUnavailable, type SessionId } from "./cell.js"
import { HostFrame, WorkerFrame, wireVersion } from "./bun-protocol.js"

/** @experimental Where the kernel worker module lives, and how its child process is started. */
export interface WorkerOptions {
  readonly sessionId: SessionId
  readonly epoch: number
  readonly workspaceRoot: string
  readonly runtimeCommand: string
  readonly workerModule: string
  readonly startTimeoutMillis: number
  readonly environment: Readonly<Record<string, string>>
}

/** @experimental Bytes a cell wrote straight to the process's own stdout or stderr. */
export interface RawOutput {
  readonly channel: "stdout" | "stderr"
  readonly text: string
}

/** @experimental One live kernel child process, its private frame channel, and its raw output. */
export interface Worker {
  readonly epoch: number
  readonly frames: Queue.Dequeue<WorkerFrame>
  readonly raw: Queue.Dequeue<RawOutput>
  readonly send: (frame: HostFrame) => Effect.Effect<void, KernelUnavailable>
  readonly signal: (signal: "SIGINT" | "SIGKILL") => Effect.Effect<void, KernelUnavailable>
  readonly exited: Effect.Effect<void>
  readonly isAlive: Effect.Effect<boolean>
}

const unavailable = (sessionId: string, reason: KernelUnavailable["reason"], message: string): KernelUnavailable =>
  KernelUnavailable.make({ sessionId, reason, message })

const encoder = new TextEncoder()

/**
 * The kernel's control plane runs on descriptors the cell namespace never receives: the worker
 * writes frames to `frameOutFd` and reads commands from `frameInFd`. Stdout, stderr, and stdin
 * belong to cell code, so nothing a cell writes — directly, from a native addon, or from a
 * subprocess that inherited them — is read as a frame, and nothing a cell reads consumes a command.
 *
 * Cell code shares the worker's process and can therefore name descriptor 3 itself, so the
 * descriptor is a channel rather than a proof of authorship. Every frame also carries a secret sent
 * once over the private descriptor at boot and held in the worker's module scope, out of reach of
 * the evaluation context. A line that does not carry it is not a frame, whoever wrote it.
 */
const frameOutFd = 3
const frameInFd = 4

const frameSecret: Effect.Effect<string> = Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER).pipe(
  Effect.map((value) => `baton-frame-${value.toString(36)}:`),
)

const decodeFrame = Schema.decodeUnknownEffect(Schema.fromJsonString(WorkerFrame))
const encodeFrame = Schema.encodeEffect(Schema.fromJsonString(HostFrame))

/**
 * @experimental Start one kernel child process and frame its stdio. The reader fiber only moves
 * frames onto a queue, so it is never blocked behind an executing cell and a host reply always
 * reaches the cell awaiting it.
 */
export const start = (
  options: WorkerOptions,
): Effect.Effect<Worker, KernelUnavailable, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> =>
  Effect.gen(function* () {
    const frameNonce = yield* frameSecret
    const outbox = yield* Queue.unbounded<Uint8Array>()
    const frames = yield* Queue.unbounded<WorkerFrame>()
    const raw = yield* Queue.unbounded<RawOutput>()
    const ready = yield* Deferred.make<void>()
    const exit = yield* Deferred.make<void>()
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner
      .spawn(
        ChildProcess.make(options.runtimeCommand, [options.workerModule], {
          cwd: options.workspaceRoot,
          env: options.environment,
          extendEnv: true,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          additionalFds: {
            [`fd${frameOutFd}`]: { type: "output" },
            [`fd${frameInFd}`]: { type: "input", stream: Stream.fromQueue(outbox) },
          },
        }),
      )
      .pipe(
        Effect.mapError((error) =>
          unavailable(options.sessionId, "start-failed", `the kernel process did not start: ${error.message}`),
        ),
      )
    yield* Queue.offer(outbox, encoder.encode(`${frameNonce}\n`))
    const reader = yield* handle.getOutputFd(frameOutFd).pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.runForEach((line) =>
        !line.startsWith(frameNonce)
          ? Effect.void
          : decodeFrame(line.slice(frameNonce.length)).pipe(
              Effect.flatMap((frame) =>
                frame._tag === "Ready"
                  ? Deferred.succeed(ready, undefined).pipe(Effect.asVoid)
                  : Queue.offer(frames, frame).pipe(Effect.asVoid),
              ),
              Effect.ignore,
            ),
      ),
      Effect.ignore,
      Effect.forkScoped,
    )
    const rawReader = (channel: RawOutput["channel"], bytes: Stream.Stream<Uint8Array, unknown>) =>
      bytes.pipe(
        Stream.decodeText(),
        Stream.runForEach((text) => Queue.offer(raw, { channel, text }).pipe(Effect.asVoid)),
        Effect.ignore,
        Effect.forkScoped,
      )
    const outReader = yield* rawReader("stdout", handle.stdout)
    const errReader = yield* rawReader("stderr", handle.stderr)
    const watcher = yield* handle.exitCode.pipe(
      Effect.ignore,
      Effect.andThen(Deferred.succeed(exit, undefined)),
      Effect.andThen(Queue.shutdown(frames)),
      Effect.asVoid,
      Effect.forkScoped,
    )
    yield* Effect.addFinalizer(() =>
      handle
        .kill({ killSignal: "SIGKILL" })
        .pipe(
          Effect.ignore,
          Effect.andThen(Fiber.interrupt(reader)),
          Effect.andThen(Fiber.interrupt(outReader)),
          Effect.andThen(Fiber.interrupt(errReader)),
          Effect.andThen(Fiber.interrupt(watcher)),
          Effect.andThen(Queue.shutdown(outbox)),
          Effect.andThen(Queue.shutdown(frames)),
          Effect.andThen(Queue.shutdown(raw)),
          Effect.asVoid,
        ),
    )
    yield* Deferred.await(ready).pipe(
      Effect.timeoutOrElse({
        duration: options.startTimeoutMillis,
        orElse: () =>
          Effect.fail(
            unavailable(options.sessionId, "start-failed", `the kernel did not report wire version ${wireVersion}`),
          ),
      }),
    )
    return {
      epoch: options.epoch,
      frames,
      raw,
      send: (frame) =>
        encodeFrame(frame).pipe(
          Effect.mapError(() =>
            unavailable(options.sessionId, "closed", `frame ${frame._tag} does not satisfy the wire contract`),
          ),
          Effect.flatMap((line) => Queue.offer(outbox, encoder.encode(`${line}\n`))),
          Effect.asVoid,
        ),
      signal: (signal) =>
        handle
          .kill({ killSignal: signal })
          .pipe(
            Effect.mapError(() => unavailable(options.sessionId, "closed", `the kernel could not be sent ${signal}`)),
          ),
      exited: Deferred.await(exit),
      isAlive: handle.isRunning.pipe(Effect.orElseSucceed(() => false)),
    }
  })
