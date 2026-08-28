import { Clock, Effect, Function, Option, Schema } from "effect"
import {
  CellExecutionFailed,
  type CellEvent,
  type CellFailure,
  type CellResult,
  CellOutcomeUnknown,
  type Channel,
  KernelUnavailable,
} from "../cell.js"
import type { Manifest, Snapshot } from "../kernel-state-store.js"
import type { Interface as HostBindings, Request as HostRequest } from "../host-binding-registry.js"
import type { WorkerFrame } from "./protocol.js"
import type { Worker } from "./session.js"

/** @experimental One cell's frames folded into cell events and one terminal outcome. */
export interface CellOutcome {
  readonly result: CellResult | undefined
  readonly failure: CellFailure | undefined
}

/** @experimental Everything a session needs to answer host requests raised by a running cell. */
export interface HostAnswerOptions {
  readonly registry: HostBindings | undefined
  readonly worker: Worker
  readonly sessionId?: string
  readonly cellId?: string
  readonly emitHostCall?: (event: HostCallUpdate) => Effect.Effect<void>
}

/** @experimental One request an executing cell raised against a mounted host module. */
export interface HostAsk {
  readonly requestId: string
  readonly module: string
  readonly operation: string
  readonly input?: unknown
}

/** @experimental Host call data before the kernel assigns its cell identity and sequence. */
export interface HostCallUpdate {
  readonly requestId: string
  readonly module: string
  readonly operation: string
  readonly inputSummary: string
  readonly status: "started" | "returned" | "failed"
  readonly durationMillis?: number
  readonly message?: string
}

const hostSummaryLimit = 2_048
const JsonString = Schema.fromJsonString(Schema.Unknown)
const Message = Schema.Struct({ message: Schema.String })
const HostValue = Schema.Unknown
type HostValue = typeof HostValue.Type

const hostSummary = (value: HostValue): string => {
  let rendered: string
  try {
    rendered = Schema.encodeSync(JsonString)(value)
  } catch {
    rendered = String(value)
  }
  return rendered.length <= hostSummaryLimit ? rendered : `${rendered.slice(0, hostSummaryLimit - 1)}…`
}

const failureMessage = (failure: HostValue): string => {
  const decoded = Schema.decodeUnknownOption(Message)(failure)
  return Option.isSome(decoded) ? decoded.value.message : hostSummary(failure)
}

const hostRequest = (options: HostAnswerOptions, request: HostAsk): HostRequest => {
  const base = { module: request.module, operation: request.operation, input: request.input }
  if (options.sessionId === undefined) {
    return options.cellId === undefined ? base : { ...base, cellId: options.cellId }
  }
  return options.cellId === undefined
    ? { ...base, sessionId: options.sessionId }
    : { ...base, sessionId: options.sessionId, cellId: options.cellId }
}

/** @experimental Answer one host request from an executing cell without blocking the frame reader. */
export const answerHostRequest: {
  (request: HostAsk): (options: HostAnswerOptions) => Effect.Effect<void, KernelUnavailable>
  (options: HostAnswerOptions, request: HostAsk): Effect.Effect<void, KernelUnavailable>
} = Function.dual(
  2,
  (options: HostAnswerOptions, request: HostAsk): Effect.Effect<void, KernelUnavailable> =>
    Effect.gen(function* () {
      const inputSummary = hostSummary(request.input)
      const startedAt = yield* Clock.currentTimeMillis
      const emit = (update: Omit<HostCallUpdate, "requestId" | "module" | "operation" | "inputSummary">) =>
        options.emitHostCall?.({
          requestId: request.requestId,
          module: request.module,
          operation: request.operation,
          inputSummary,
          ...update,
        }) ?? Effect.void
      yield* emit({ status: "started" })
      if (options.registry === undefined) {
        const message = `no host module named ${request.module} is mounted`
        yield* emit({ status: "failed", durationMillis: (yield* Clock.currentTimeMillis) - startedAt, message })
        return yield* options.worker.send({
          _tag: "HostResponse",
          requestId: request.requestId,
          outcome: { _tag: "Rejected", message },
        })
      }
      return yield* options.registry.invoke(hostRequest(options, request)).pipe(
        Effect.matchEffect({
          onSuccess: (response) =>
            Effect.gen(function* () {
              const durationMillis = (yield* Clock.currentTimeMillis) - startedAt
              yield* emit(
                response._tag === "Success"
                  ? { status: "returned", durationMillis, message: hostSummary(response.output) }
                  : { status: "failed", durationMillis, message: failureMessage(response.failure) },
              )
              yield* options.worker.send({
                _tag: "HostResponse",
                requestId: request.requestId,
                outcome:
                  response._tag === "Success"
                    ? { _tag: "Success", output: response.output }
                    : { _tag: "Failure", failure: response.failure },
              })
            }),
          onFailure: (failure) =>
            Effect.gen(function* () {
              const detail = failureMessage(failure)
              const message = `${failure._tag}: ${request.module}.${request.operation}${
                detail.length > 0 ? `: ${detail}` : ""
              }`
              yield* emit({
                status: "failed",
                durationMillis: (yield* Clock.currentTimeMillis) - startedAt,
                message,
              })
              yield* options.worker.send({
                _tag: "HostResponse",
                requestId: request.requestId,
                outcome: { _tag: "Rejected", message },
              })
            }),
        }),
      )
    }),
)

/** @experimental One accumulated output channel of one cell. */
export interface ChannelState {
  readonly text: string
}

/** @experimental Every channel one cell has produced so far. */
export interface Accumulator {
  readonly stdout: ChannelState
  readonly stderr: ChannelState
  readonly display: ChannelState
}

const emptyChannel: ChannelState = { text: "" }

/** @experimental The empty channel accumulator one cell starts from. */
export const emptyAccumulator: Accumulator = { stdout: emptyChannel, stderr: emptyChannel, display: emptyChannel }

/** @experimental One write offered to one channel. */
export interface IngestRequest {
  readonly channel: Exclude<Channel, "result">
  readonly text: string
}

/** @experimental One accumulated channel write. */
export interface Ingested {
  readonly channels: Accumulator
  readonly text: string
}

/** @experimental Accumulate one output write without altering it. */
export const ingest: {
  (input: IngestRequest): (previous: Accumulator) => Ingested
  (previous: Accumulator, input: IngestRequest): Ingested
} = Function.dual(2, (previous: Accumulator, input: IngestRequest): Ingested => {
  const before = previous[input.channel]
  return {
    channels: { ...previous, [input.channel]: { text: before.text + input.text } },
    text: input.text,
  }
})

/** @experimental One output write folded into the events a host streams for it. */
export const outputEvents = (input: {
  readonly cellId: string
  readonly channel: Exclude<Channel, "result">
  readonly ingested: Ingested
  readonly sequence: number
}): ReadonlyArray<CellEvent> => {
  const { cellId, channel, ingested } = input
  if (ingested.text.length > 0 && channel === "stderr") {
    return [{ _tag: "Stderr", cellId, sequence: input.sequence, text: ingested.text }]
  }
  if (ingested.text.length > 0 && channel === "stdout") {
    return [{ _tag: "Stdout", cellId, sequence: input.sequence, text: ingested.text }]
  }
  return []
}

/** @experimental Fold one worker frame into the cell event a host streams, if it produces one. */
export const toCellEvent: {
  (sequence: number): (frame: WorkerFrame) => CellEvent | undefined
  (frame: WorkerFrame, sequence: number): CellEvent | undefined
} = Function.dual(2, (frame: WorkerFrame, sequence: number): CellEvent | undefined => {
  if (frame._tag === "Completed") {
    return {
      _tag: "Result",
      cellId: frame.cellId,
      sequence,
      value: frame.value,
      durationMillis: frame.durationMillis,
    }
  }
  return undefined
})

/** @experimental Everything a terminal frame needs to become one cell outcome. */
export interface TerminalContext {
  readonly sessionId: string
  readonly epoch: number
  readonly sequence: number
  readonly channels: Accumulator
}

/** @experimental Turn a terminal worker frame into the cell's success or typed domain failure. */
export const terminal: {
  (input: TerminalContext): (frame: WorkerFrame) => CellOutcome | undefined
  (frame: WorkerFrame, input: TerminalContext): CellOutcome | undefined
} = Function.dual(2, (frame: WorkerFrame, input: TerminalContext): CellOutcome | undefined => {
  if (frame._tag === "Completed") {
    return {
      result: {
        cellId: frame.cellId,
        epoch: input.epoch,
        sequence: input.sequence,
        value: frame.value,
        stdout: input.channels.stdout.text,
        stderr: input.channels.stderr.text,
        durationMillis: frame.durationMillis,
      },
      failure: undefined,
    }
  }
  if (frame._tag === "Stopped") {
    const failure = {
      cellId: frame.cellId,
      epoch: input.epoch,
      sequence: input.sequence,
      name: frame.kind === "threw" ? frame.name : `Cell${frame.kind}`,
      message: frame.message,
      stdout: input.channels.stdout.text,
      stderr: input.channels.stderr.text,
      durationMillis: frame.durationMillis,
    }
    return {
      result: undefined,
      failure:
        frame.stack === undefined
          ? CellExecutionFailed.make(failure)
          : CellExecutionFailed.make({ ...failure, stack: frame.stack }),
    }
  }
  return undefined
})

/** @experimental The cell outcome when a kernel dies mid-cell: uncertain, and never replayed. */
export const outcomeUnknown = (input: {
  readonly sessionId: string
  readonly cellId: string
  readonly epoch: number
  readonly reason: CellOutcomeUnknown["reason"]
  readonly message: string
}): CellOutcomeUnknown => CellOutcomeUnknown.make(input)

/** @experimental Encode one captured namespace as a snapshot the KernelStateStore can persist. */
export const toSnapshot = (input: {
  readonly sessionId: string
  readonly epoch: number
  readonly profileDigest: string
  readonly savedAtMillis: number
  readonly payload: string
  readonly restored: ReadonlyArray<{ readonly name: string; readonly kind: "value" | "source" | "import" }>
  readonly dropped: ReadonlyArray<{ readonly name: string; readonly reason: Manifest["dropped"][number]["reason"] }>
}): Snapshot => ({
  manifest: {
    sessionId: input.sessionId,
    epoch: input.epoch,
    profileDigest: input.profileDigest,
    savedAtMillis: input.savedAtMillis,
    restored: input.restored,
    dropped: input.dropped,
  },
  payload: new TextEncoder().encode(input.payload),
})

/** @experimental A session that has no live kernel and cannot get one. */
export const unavailable = (input: {
  readonly sessionId: string
  readonly reason: KernelUnavailable["reason"]
  readonly message: string
}): KernelUnavailable => KernelUnavailable.make(input)
