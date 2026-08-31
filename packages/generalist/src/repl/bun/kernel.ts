import { type Cause, Deferred, Effect, Fiber, Queue, Ref, Scope } from "effect"
import type { CellEvent, CellFailure, CellId, CellResult, KernelUnavailable, RestartReason } from "../cell.js"
import type { Binding, Interruption } from "../kernel-pool.js"
import type { Service as HostBindingsService } from "../host-bindings.js"
import type { Captured, Inspected, Restored, WorkerFrame } from "./protocol.js"
import { start, type Worker, type WorkerOptions } from "./session.js"
import {
  type Accumulator,
  answerHostRequest,
  emptyAccumulator,
  ingest,
  outcomeUnknown,
  outputEvents,
  terminal,
  toCellEvent,
  unavailable,
} from "./runtime.js"

/** @experimental One cell in flight inside a kernel: its event sink, its channels, and its outcome. */
interface ActiveCell {
  readonly cellId: CellId
  readonly events: Queue.Queue<CellEvent, Cause.Done<void>>
  readonly outcome: Deferred.Deferred<CellResult, CellFailure>
  readonly sequence: Ref.Ref<number>
  readonly channels: Ref.Ref<Accumulator>
  readonly settled: Ref.Ref<boolean>
  readonly rawBarriers: {
    readonly stdout: Deferred.Deferred<void>
    readonly stderr: Deferred.Deferred<void>
  }
}

type DisplayEvent = Extract<CellEvent, { readonly _tag: "Display" }>
type MutableDisplayEvent = { -readonly [Key in keyof DisplayEvent]: DisplayEvent[Key] }
type HostRequestInput = Parameters<typeof answerHostRequest>[0]
type MutableHostRequestInput = { -readonly [Key in keyof HostRequestInput]: HostRequestInput[Key] }

/** @experimental A live kernel for one Session: one child process, one namespace, one epoch. */
export interface Kernel {
  readonly epoch: number
  readonly worker: Worker
  readonly execute: (input: {
    readonly cellId: CellId
    readonly code: string
    readonly deadlineMillis: number
    readonly sequenceStart: number
  }) => Effect.Effect<
    {
      readonly events: Queue.Dequeue<CellEvent, Cause.Done<void>>
      readonly outcome: Effect.Effect<CellResult, CellFailure>
    },
    KernelUnavailable
  >
  readonly interrupt: (cellId: CellId, graceMillis: number) => Effect.Effect<Interruption["_tag"], KernelUnavailable>
  readonly capture: Effect.Effect<Captured, KernelUnavailable>
  readonly restore: (payload: string) => Effect.Effect<Restored, KernelUnavailable>
  readonly inspect: Effect.Effect<ReadonlyArray<Binding>, KernelUnavailable>
  readonly mount: Effect.Effect<void, KernelUnavailable>
  readonly kill: Effect.Effect<void, KernelUnavailable>
}

/** @experimental Everything a kernel needs to boot and to answer an executing cell. */
export interface KernelOptions extends WorkerOptions {
  readonly bindings: HostBindingsService | undefined
  readonly controlTimeoutMillis: number
}

const controlReply = (frame: WorkerFrame): string | undefined =>
  frame._tag === "Captured" || frame._tag === "Restored" || frame._tag === "Inspected" ? frame.requestId : undefined

/**
 * @experimental Boot one kernel child process and run its frame router. The router owns the frame
 * queue for the process lifetime: it never blocks on an executing cell, so a host reply always
 * reaches the cell awaiting it, and control replies never race a cell's own frames.
 */
export const make = (options: KernelOptions): Effect.Effect<Kernel, KernelUnavailable, Scope.Scope> =>
  Effect.gen(function* () {
    const worker = yield* start(options)
    const active = yield* Ref.make<ActiveCell | undefined>(undefined)
    const control = yield* Ref.make(new Map<string, Deferred.Deferred<WorkerFrame>>())
    const requestSeq = yield* Ref.make(0)

    const settle = (cell: ActiveCell, outcome: Effect.Effect<CellResult, CellFailure>): Effect.Effect<void> =>
      Ref.set(cell.settled, true).pipe(
        Effect.andThen(Queue.end(cell.events)),
        Effect.andThen(Ref.set(active, undefined)),
        Effect.andThen(Deferred.completeWith(cell.outcome, outcome)),
        Effect.asVoid,
      )

    const onOutput = (
      cell: ActiveCell,
      input: { readonly channel: "stdout" | "stderr" | "display"; readonly text: string },
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const ingested = ingest(yield* Ref.get(cell.channels), {
          channel: input.channel,
          text: input.text,
        })
        yield* Ref.set(cell.channels, ingested.channels)
        const sequence = yield* Ref.get(cell.sequence)
        const events = outputEvents({ cellId: cell.cellId, channel: input.channel, ingested, sequence })
        yield* Ref.set(cell.sequence, sequence + events.length)
        for (const event of events) yield* Queue.offer(cell.events, event).pipe(Effect.ignore)
      })

    const onCellFrame = (cell: ActiveCell, frame: WorkerFrame): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (frame._tag === "Output") return yield* onOutput(cell, { channel: frame.channel, text: frame.text })
        if (frame._tag === "Display") {
          const ingested = ingest(yield* Ref.get(cell.channels), {
            channel: "display",
            text: frame.data,
          })
          yield* Ref.set(cell.channels, ingested.channels)
          const sequence = yield* Ref.get(cell.sequence)
          const event: MutableDisplayEvent = {
            _tag: "Display",
            cellId: frame.cellId,
            sequence,
            mediaType: frame.mediaType,
            data: frame.data,
          }
          if (frame.name !== undefined) event.name = frame.name
          yield* Queue.offer(cell.events, event).pipe(Effect.ignore)
          yield* Ref.set(cell.sequence, sequence + 1)
          return
        }
        if (frame._tag === "Completed" || frame._tag === "Stopped") {
          yield* Deferred.await(cell.rawBarriers.stdout)
          yield* Deferred.await(cell.rawBarriers.stderr)
        }
        const channels = yield* Ref.get(cell.channels)
        const sequence = yield* Ref.getAndUpdate(cell.sequence, (value) => value + 1)
        const event = toCellEvent(frame, sequence)
        if (event === undefined) yield* Ref.update(cell.sequence, (value) => value - 1)
        else yield* Queue.offer(cell.events, event).pipe(Effect.ignore)
        const outcome = terminal(frame, {
          sessionId: options.sessionId,
          epoch: options.epoch,
          sequence,
          channels,
        })
        if (outcome === undefined) return
        yield* settle(
          cell,
          outcome.result === undefined ? Effect.fail(outcome.failure!) : Effect.succeed(outcome.result),
        )
      })

    const router = yield* Queue.take(worker.frames).pipe(
      Effect.flatMap((frame) =>
        Effect.gen(function* () {
          const replyTo = controlReply(frame)
          if (replyTo !== undefined) {
            const pending = yield* Ref.get(control)
            const waiter = pending.get(replyTo)
            if (waiter !== undefined) yield* Deferred.succeed(waiter, frame).pipe(Effect.asVoid)
            return
          }
          if (frame._tag === "HostRequest") {
            const running = yield* Ref.get(active)
            const input: MutableHostRequestInput = {
              bindings: options.bindings,
              worker,
              sessionId: options.sessionId,
            }
            if (running !== undefined) {
              input.cellId = running.cellId
              input.emitHostCall = (event) =>
                Effect.gen(function* () {
                  const sequence = yield* Ref.getAndUpdate(running.sequence, (value) => value + 1)
                  yield* Queue.offer(running.events, {
                    _tag: "HostCall",
                    cellId: running.cellId,
                    sequence,
                    ...event,
                  }).pipe(Effect.ignore)
                })
            }
            yield* answerHostRequest(input, frame).pipe(Effect.ignore, Effect.forkScoped)
            return
          }
          const cell = yield* Ref.get(active)
          if (cell !== undefined && "cellId" in frame && frame.cellId === cell.cellId) {
            yield* onCellFrame(cell, frame)
          }
        }),
      ),
      Effect.forever,
      Effect.ignore,
      Effect.forkScoped,
    )

    const rawReader = yield* Queue.take(worker.raw).pipe(
      Effect.flatMap((output) =>
        Ref.get(active).pipe(
          Effect.flatMap((cell) => {
            if (cell === undefined) return Effect.void
            const barrier = cell.rawBarriers[output.channel]
            if (output._tag === "Barrier")
              return output.cellId === cell.cellId
                ? Deferred.succeed(barrier, undefined).pipe(Effect.asVoid)
                : Effect.void
            return Deferred.isDone(barrier).pipe(
              Effect.flatMap((done) =>
                done ? Effect.void : onOutput(cell, { channel: output.channel, text: output.text }),
              ),
            )
          }),
        ),
      ),
      Effect.forever,
      Effect.ignore,
      Effect.forkScoped,
    )

    const onExit = yield* worker.exited.pipe(
      Effect.andThen(Ref.get(active)),
      Effect.flatMap((cell) =>
        cell === undefined
          ? Effect.void
          : settle(
              cell,
              Effect.fail(
                outcomeUnknown({
                  sessionId: options.sessionId,
                  cellId: cell.cellId,
                  epoch: options.epoch,
                  reason: "kernel-killed",
                  message: "the kernel process exited while the cell was running",
                }),
              ),
            ),
      ),
      Effect.forkScoped,
    )

    yield* Effect.addFinalizer(() =>
      Ref.get(active).pipe(
        Effect.flatMap((cell) =>
          cell === undefined
            ? Effect.void
            : settle(
                cell,
                Effect.fail(
                  outcomeUnknown({
                    sessionId: options.sessionId,
                    cellId: cell.cellId,
                    epoch: options.epoch,
                    reason: "kernel-killed",
                    message: "the kernel was released while the cell was running",
                  }),
                ),
              ),
        ),
        Effect.andThen(Fiber.interrupt(router)),
        Effect.andThen(Fiber.interrupt(rawReader)),
        Effect.andThen(Fiber.interrupt(onExit)),
      ),
    )

    const ask = <A extends WorkerFrame>(
      frame: (requestId: string) => Parameters<Worker["send"]>[0],
      refine: (reply: WorkerFrame) => A | undefined,
    ): Effect.Effect<A, KernelUnavailable> =>
      Effect.gen(function* () {
        const ordinal = yield* Ref.updateAndGet(requestSeq, (value) => value + 1)
        const requestId = `ctl-${ordinal}`
        const reply = yield* Deferred.make<WorkerFrame>()
        yield* Ref.update(control, (pending) => new Map(pending).set(requestId, reply))
        yield* worker.send(frame(requestId))
        const received = yield* Deferred.await(reply).pipe(
          Effect.raceFirst(
            worker.exited.pipe(
              Effect.andThen(
                unavailable({
                  sessionId: options.sessionId,
                  reason: "closed",
                  message: "the kernel exited before it replied",
                }),
              ),
            ),
          ),
          Effect.timeoutOrElse({
            duration: options.controlTimeoutMillis,
            orElse: () =>
              unavailable({
                sessionId: options.sessionId,
                reason: "deadline-exceeded",
                message: `the kernel did not answer ${frame("")._tag} before its control deadline`,
              }),
          }),
          Effect.ensuring(
            Ref.update(control, (pending) => {
              const next = new Map(pending)
              next.delete(requestId)
              return next
            }),
          ),
        )
        const refined = refine(received)
        return refined === undefined
          ? yield* unavailable({
              sessionId: options.sessionId,
              reason: "closed",
              message: `unexpected reply ${received._tag}`,
            })
          : refined
      })

    return {
      epoch: options.epoch,
      worker,
      mount:
        options.bindings === undefined
          ? Effect.void
          : worker.send({
              _tag: "Mount",
              modules: options.bindings.descriptors.map((descriptor) => ({
                module: descriptor.module,
                operations: descriptor.operations,
              })),
            }),
      execute: (input) =>
        Effect.gen(function* () {
          const running = yield* Ref.get(active)
          if (running !== undefined) {
            return yield* unavailable({
              sessionId: options.sessionId,
              reason: "lease-lost",
              message: `cell ${running.cellId} is still running`,
            })
          }
          const cell: ActiveCell = {
            cellId: input.cellId,
            events: yield* Queue.unbounded<CellEvent, Cause.Done<void>>(),
            outcome: yield* Deferred.make<CellResult, CellFailure>(),
            sequence: yield* Ref.make(input.sequenceStart),
            channels: yield* Ref.make(emptyAccumulator),
            settled: yield* Ref.make(false),
            rawBarriers: {
              stdout: yield* Deferred.make<void>(),
              stderr: yield* Deferred.make<void>(),
            },
          }
          yield* Ref.set(active, cell)
          yield* worker
            .send({
              _tag: "Execute",
              cellId: input.cellId,
              code: input.code,
              deadlineMillis: input.deadlineMillis,
            })
            .pipe(Effect.tapError(() => Ref.set(active, undefined)))
          return { events: cell.events, outcome: Deferred.await(cell.outcome) }
        }),
      interrupt: (cellId, graceMillis) =>
        Effect.gen(function* () {
          const cell = yield* Ref.get(active)
          if (cell === undefined || cell.cellId !== cellId) return "NotRunning" as const
          yield* worker.send({ _tag: "Interrupt", cellId })
          yield* Effect.sleep(graceMillis)
          if (yield* Ref.get(cell.settled)) return "Interrupted" as const
          yield* worker.signal("SIGINT")
          yield* Effect.sleep(graceMillis)
          return (yield* Ref.get(cell.settled)) ? ("Interrupted" as const) : ("Unresponsive" as const)
        }),
      capture: ask(
        (requestId) => ({ _tag: "Capture", requestId }),
        (reply) => (reply._tag === "Captured" ? reply : undefined),
      ),
      restore: (payload) =>
        ask(
          (requestId) => ({ _tag: "Restore", requestId, payload }),
          (reply) => (reply._tag === "Restored" ? reply : undefined),
        ),
      inspect: ask(
        (requestId) => ({ _tag: "Inspect", requestId }),
        (reply): Inspected | undefined => (reply._tag === "Inspected" ? reply : undefined),
      ).pipe(Effect.map((inspected) => inspected.bindings.map((binding) => ({ ...binding })))),
      kill: worker.signal("SIGKILL").pipe(Effect.andThen(worker.exited)),
    }
  })

/** @experimental Why a kernel that already exists cannot serve the next cell. */
export const restartReasonOf = (input: {
  readonly killed: boolean
  readonly profileChanged: boolean
}): RestartReason => {
  if (input.profileChanged) return "profile-changed"
  return input.killed ? "killed" : "requested"
}
