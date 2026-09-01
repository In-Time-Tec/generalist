import { Deferred, Effect, Option, Queue, Random, Schema, Scope, Semaphore } from "effect"
import { KernelUnavailable, type SessionId } from "../cell.js"
import { HostFrame, WorkerFrame, wireVersion } from "./protocol.js"

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
export interface RawChunk {
  readonly _tag: "Chunk"
  readonly channel: "stdout" | "stderr"
  readonly text: string
}

/** @experimental The end of one cell's writes to one raw output channel. */
export interface RawBarrier {
  readonly _tag: "Barrier"
  readonly channel: "stdout" | "stderr"
  readonly cellId: string
}

/** @experimental Raw output and its cell-settlement boundary. */
export type RawOutput = RawChunk | RawBarrier

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

/**
 * The kernel is spawned through `Bun.spawn` rather than the `node:child_process` compatibility
 * layer. Bun guards the descriptors it hands a child, and its Node shim closes an extra-descriptor
 * pipe twice when a kernel is killed while its readers are still attached: on macOS that raises
 * EXC_GUARD and kills the host, and on Linux the second close lands on whatever descriptor number
 * has since been reused — a live SQLite handle in practice. Bun's own spawn owns those descriptors
 * for the process lifetime and closes each exactly once.
 */
const idlePollMillis = 2

/**
 * The pump waits on wall time rather than `Effect.sleep`. A kernel is a real process on the real
 * clock, and tests drive product time with a `TestClock`: a fiber that slept on the Effect clock
 * would never wake unless a test happened to advance it, which would wedge the handshake and every
 * frame behind it.
 */
const realDelay = (millis: number): Effect.Effect<void> => Effect.promise(() => Bun.sleep(millis))

const frameSecret: Effect.Effect<string> = Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER).pipe(
  Effect.map((value) => `generalist-frame-${value.toString(36)}:`),
)

const decodeFrame = Schema.decodeUnknownEffect(Schema.fromJsonString(WorkerFrame))
const encodeFrame = Schema.encodeEffect(Schema.fromJsonString(HostFrame))

const ErrorCode = Schema.Struct({ code: Schema.Unknown })
const errorCode = <ErrorValue>(error: ErrorValue): string | undefined =>
  Option.match(Schema.decodeUnknownOption(ErrorCode)(error), {
    onNone: () => undefined,
    onSome: ({ code }) => String(code),
  })

/**
 * A descriptor Bun hands back for an extra pipe is non-blocking, so an empty pipe answers `EAGAIN`
 * rather than parking the thread. Polling keeps the read interruptible — a blocking read would hold
 * the only JavaScript thread and no fiber could cancel it — and yields immediately while bytes keep
 * arriving so a burst of frames is drained in one pass.
 */
const pumpDescriptor = (
  fd: number,
  isFinished: Effect.Effect<boolean>,
  onChunk: (bytes: Uint8Array) => Effect.Effect<void>,
): Effect.Effect<void> =>
  Effect.suspend(() => {
    const open: Effect.Effect<void> = Effect.suspend(() =>
      Effect.acquireUseRelease(
        Effect.sync(() => Bun.file(fd).stream().getReader()),
        (reader) => {
          const read: Effect.Effect<void> = Effect.suspend(() =>
            Effect.tryPromise(() => reader.read()).pipe(
              Effect.flatMap((result) =>
                result.done ? Effect.void : onChunk(result.value).pipe(Effect.andThen(read)),
              ),
              Effect.ignore,
            ),
          )
          return read
        },
        (reader) => Effect.sync(() => reader.releaseLock()).pipe(Effect.ignore),
      ).pipe(
        Effect.andThen(
          Effect.flatMap(isFinished, (finished) =>
            finished ? Effect.void : realDelay(idlePollMillis).pipe(Effect.andThen(open)),
          ),
        ),
      ),
    )
    return open
  })

const lineReader = (onLine: (line: string) => Effect.Effect<void>) => {
  const decoder = new TextDecoder()
  let pending = ""
  return (bytes: Uint8Array): Effect.Effect<void> =>
    Effect.suspend(() => {
      pending += decoder.decode(bytes, { stream: true })
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      return Effect.forEach(lines, onLine, { discard: true })
    })
}

const readStream = (
  stream: ReadableStream<Uint8Array>,
  onChunk: (bytes: Uint8Array) => Effect.Effect<void>,
): Effect.Effect<void> =>
  Effect.suspend(() => {
    const reader = stream.getReader()
    const pump: Effect.Effect<void> = Effect.suspend(() =>
      Effect.tryPromise(() => reader.read()).pipe(
        Effect.flatMap((result) => (result.done ? Effect.void : onChunk(result.value).pipe(Effect.andThen(pump)))),
        Effect.ignoreCause,
      ),
    )
    return pump.pipe(Effect.ensuring(Effect.sync(() => reader.releaseLock()).pipe(Effect.ignore)))
  })

/**
 * `detached` puts the worker in its own process group, so killing the group reaches whatever the
 * cell itself spawned. Signalling the group of a process that already exited answers `ESRCH`, which
 * is the same outcome the caller asked for.
 */
const signalGroup = (pid: number, signal: "SIGINT" | "SIGKILL"): Effect.Effect<void, string> =>
  Effect.try({
    try: () => {
      process.kill(-pid, signal)
    },
    catch: (error) => errorCode(error) ?? String(error),
  }).pipe(Effect.catch((code) => (code === "ESRCH" ? Effect.void : Effect.fail(code))))

/**
 * @experimental Start one kernel child process and frame its stdio. The reader fiber only moves
 * frames onto a queue, so it is never blocked behind an executing cell and a host reply always
 * reaches the cell awaiting it.
 */
export const start = (options: WorkerOptions): Effect.Effect<Worker, KernelUnavailable, Scope.Scope> =>
  Effect.gen(function* () {
    const frameNonce = yield* frameSecret
    const frames = yield* Queue.unbounded<WorkerFrame>()
    const raw = yield* Queue.unbounded<RawOutput>()
    const ready = yield* Deferred.make<void>()
    const exit = yield* Deferred.make<void>()
    const commands = yield* Semaphore.make(1)
    const kernelProcess = yield* Effect.try({
      try: () =>
        Bun.spawn([options.runtimeCommand, options.workerModule], {
          cwd: options.workspaceRoot,
          env: { ...process.env, ...options.environment },
          detached: true,
          stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
        }),
      catch: (error) =>
        unavailable(options.sessionId, "start-failed", `the kernel process did not start: ${String(error)}`),
    })
    /**
     * Bun keeps a reference to every subprocess it spawns, so a host that finishes its work would
     * still wait for a kernel the pool is deliberately holding open for reuse. The pool owns the
     * kernel lifetime — it kills the process when the Session retires or its scope closes — so the
     * reference is dropped here and shutdown never waits on an idle kernel.
     */
    kernelProcess.unref()
    const frameOut = yield* Schema.decodeUnknownEffect(Schema.Finite)(kernelProcess.stdio[frameOutFd]).pipe(
      Effect.mapError(() =>
        unavailable(options.sessionId, "start-failed", "the kernel frame output is not a descriptor"),
      ),
    )
    const frameIn = yield* Schema.decodeUnknownEffect(Schema.Finite)(kernelProcess.stdio[frameInFd]).pipe(
      Effect.mapError(() =>
        unavailable(options.sessionId, "start-failed", "the kernel frame input is not a descriptor"),
      ),
    )
    const writeLine = (line: string): Effect.Effect<void, KernelUnavailable> =>
      commands.withPermits(1)(
        Effect.suspend(() => {
          const bytes = encoder.encode(`${line}\n`)
          const writer = Bun.file(frameIn).writer()
          return Effect.tryPromise({
            try: () =>
              Promise.resolve(writer.write(bytes))
                .then(() => writer.flush())
                .then(() => undefined),
            catch: (error) =>
              unavailable(options.sessionId, "closed", `the kernel command channel is closed: ${String(error)}`),
          })
        }),
      )
    yield* writeLine(frameNonce).pipe(Effect.ignore)
    yield* pumpDescriptor(
      frameOut,
      Deferred.isDone(exit),
      lineReader((line) => {
        if (!line.startsWith(frameNonce))
          return Effect.logWarning("kernel-session.frame-dropped").pipe(
            Effect.annotateLogs({
              "generalist.drop.reason": "nonce-mismatch",
              "generalist.line.bytes": line.length,
              "generalist.line.preview": line.slice(0, 160),
            }),
            Effect.asVoid,
          )
        return decodeFrame(line.slice(frameNonce.length)).pipe(
          Effect.flatMap((frame) =>
            frame._tag === "Ready"
              ? Deferred.succeed(ready, undefined).pipe(Effect.asVoid)
              : Queue.offer(frames, frame).pipe(Effect.asVoid),
          ),
          Effect.catch((error: Schema.SchemaError) =>
            Effect.logWarning("kernel-session.frame-decode-failed").pipe(
              Effect.annotateLogs({
                "generalist.line.bytes": line.length,
                "generalist.line.preview": line.slice(frameNonce.length, frameNonce.length + 160),
                "generalist.failure": String(error).slice(0, 300),
              }),
            ),
          ),
        )
      }),
    ).pipe(Effect.forkScoped)
    const rawReader = (channel: RawOutput["channel"], stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder()
      const barrierPrefix = `\n${frameNonce}raw-barrier:`
      let pending = ""
      const flush = (): Effect.Effect<void> => {
        const text = pending + decoder.decode()
        pending = ""
        return text.length === 0 ? Effect.void : Queue.offer(raw, { _tag: "Chunk", channel, text }).pipe(Effect.asVoid)
      }
      return readStream(stream, (bytes) =>
        Effect.suspend(() => {
          pending += decoder.decode(bytes, { stream: true })
          const output: Array<RawOutput> = []
          while (true) {
            const markerStart = pending.indexOf(barrierPrefix)
            if (markerStart < 0) {
              const safeLength = Math.max(0, pending.length - barrierPrefix.length + 1)
              if (safeLength > 0) {
                output.push({ _tag: "Chunk", channel, text: pending.slice(0, safeLength) })
                pending = pending.slice(safeLength)
              }
              break
            }
            if (markerStart > 0) output.push({ _tag: "Chunk", channel, text: pending.slice(0, markerStart) })
            pending = pending.slice(markerStart)
            const end = pending.indexOf("\n", barrierPrefix.length)
            if (end < 0) break
            const encodedCellId = pending.slice(barrierPrefix.length, end)
            let cellId: string | undefined
            try {
              cellId = decodeURIComponent(encodedCellId)
            } catch {
              cellId = undefined
            }
            if (cellId !== undefined) output.push({ _tag: "Barrier", channel, cellId })
            else output.push({ _tag: "Chunk", channel, text: pending.slice(0, end + 1) })
            pending = pending.slice(end + 1)
          }
          return Effect.forEach(output, (item) => Queue.offer(raw, item), { discard: true })
        }),
      ).pipe(Effect.ensuring(Effect.suspend(flush)), Effect.forkScoped)
    }
    yield* rawReader("stdout", kernelProcess.stdout)
    yield* rawReader("stderr", kernelProcess.stderr)
    yield* Effect.promise(() => kernelProcess.exited).pipe(
      Effect.andThen(Deferred.succeed(exit, undefined)),
      Effect.andThen(Queue.shutdown(frames)),
      Effect.asVoid,
      Effect.forkScoped,
    )
    yield* Effect.addFinalizer(() =>
      signalGroup(kernelProcess.pid, "SIGKILL").pipe(
        Effect.ignore,
        Effect.andThen(Deferred.await(exit).pipe(Effect.timeout("2 seconds"), Effect.ignore)),
        Effect.andThen(Queue.shutdown(frames)),
        Effect.andThen(Queue.shutdown(raw)),
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
          Effect.flatMap(writeLine),
        ),
      signal: (signal) =>
        signalGroup(kernelProcess.pid, signal).pipe(
          Effect.mapError(() => unavailable(options.sessionId, "closed", `the kernel could not be sent ${signal}`)),
        ),
      exited: Deferred.await(exit),
      isAlive: Deferred.isDone(exit).pipe(Effect.map((done) => !done)),
    }
  })
