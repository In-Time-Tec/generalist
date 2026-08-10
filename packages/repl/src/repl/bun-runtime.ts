import { Effect, Function } from "effect"
import {
  CellExecutionFailed,
  type CellEvent,
  type CellFailure,
  type CellResult,
  CellOutcomeUnknown,
  type Channel,
  KernelUnavailable,
  type Truncation,
} from "./cell.js"
import type { Manifest, Snapshot } from "./kernel-state-store.js"
import type { Interface as HostBindings } from "./host-binding-registry.js"
import type { WorkerFrame } from "./bun-protocol.js"
import type { Worker } from "./bun-session.js"

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
}

/** @experimental One request an executing cell raised against a mounted host module. */
export interface HostAsk {
  readonly requestId: string
  readonly module: string
  readonly operation: string
  readonly input?: unknown
}

/** @experimental Answer one host request from an executing cell without blocking the frame reader. */
export const answerHostRequest: {
  (request: HostAsk): (options: HostAnswerOptions) => Effect.Effect<void, KernelUnavailable>
  (options: HostAnswerOptions, request: HostAsk): Effect.Effect<void, KernelUnavailable>
} = Function.dual(
  2,
  (options: HostAnswerOptions, request: HostAsk): Effect.Effect<void, KernelUnavailable> =>
    options.registry === undefined
      ? options.worker.send({
          _tag: "HostResponse",
          requestId: request.requestId,
          outcome: { _tag: "Rejected", message: `no host module named ${request.module} is mounted` },
        })
      : options.registry
          .invoke({
            module: request.module,
            operation: request.operation,
            input: request.input,
            ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
            ...(options.cellId === undefined ? {} : { cellId: options.cellId }),
          })
          .pipe(
            Effect.matchEffect({
              onSuccess: (response) =>
                options.worker.send({
                  _tag: "HostResponse",
                  requestId: request.requestId,
                  outcome:
                    response._tag === "Success"
                      ? { _tag: "Success", output: response.output }
                      : { _tag: "Failure", failure: response.failure },
                }),
              onFailure: (failure) =>
                options.worker.send({
                  _tag: "HostResponse",
                  requestId: request.requestId,
                  /**
                   * A boundary failure names why it happened, and reporting only the operation left
                   * a cell to guess which field was wrong. A model that cannot see the reason spends
                   * turns re-shaping a call that was one field away.
                   */
                  outcome: {
                    _tag: "Rejected",
                    message: `${failure._tag}: ${request.module}.${request.operation}${
                      "message" in failure && typeof failure.message === "string" && failure.message.length > 0
                        ? `: ${failure.message}`
                        : ""
                    }`,
                  },
                }),
            }),
          ),
)

/** @experimental One bounded channel of one cell: what it kept, and exactly what it dropped. */
export interface ChannelState {
  readonly text: string
  readonly bytes: number
  readonly droppedBytes: number
  readonly droppedEvents: number
}

/** @experimental Every bounded channel one cell has produced so far. */
export interface Accumulator {
  readonly stdout: ChannelState
  readonly stderr: ChannelState
  readonly display: ChannelState
}

const emptyChannel: ChannelState = { text: "", bytes: 0, droppedBytes: 0, droppedEvents: 0 }

/** @experimental The empty channel accumulator one cell starts from. */
export const emptyAccumulator: Accumulator = { stdout: emptyChannel, stderr: emptyChannel, display: emptyChannel }

/** @experimental One write offered to one bounded channel. */
export interface IngestRequest {
  readonly channel: Exclude<Channel, "result">
  readonly text: string
  readonly limit: number
}

/** @experimental A metered channel: what the bound admitted, and whether this write hit it. */
export interface Ingested {
  readonly channels: Accumulator
  readonly kept: string
  readonly truncated: boolean
}

/**
 * The largest prefix of `text` that fits in `budget` bytes without splitting a character. Slicing by
 * code unit would admit up to four bytes per unit against a byte bound and could cut a surrogate
 * pair in half, so the prefix is measured in the encoding the bound is stated in.
 */
const keptWithinBytes = (text: string, budget: number): string => {
  const encoder = new TextEncoder()
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (encoder.encode(text.slice(0, middle)).byteLength <= budget) low = middle
    else high = middle - 1
  }
  const candidate = text.slice(0, low)
  const lastUnit = candidate.charCodeAt(candidate.length - 1)
  return lastUnit >= 0xd800 && lastUnit <= 0xdbff ? candidate.slice(0, -1) : candidate
}

const metered = (previous: ChannelState, text: string, limit: number): { state: ChannelState; kept: string } => {
  const size = new TextEncoder().encode(text).byteLength
  const remaining = limit - previous.bytes
  if (remaining <= 0) {
    return {
      state: { ...previous, droppedBytes: previous.droppedBytes + size, droppedEvents: previous.droppedEvents + 1 },
      kept: "",
    }
  }
  if (size <= remaining) {
    return { state: { ...previous, text: previous.text + text, bytes: previous.bytes + size }, kept: text }
  }
  const kept = keptWithinBytes(text, remaining)
  const keptBytes = new TextEncoder().encode(kept).byteLength
  return {
    state: {
      text: previous.text + kept,
      bytes: previous.bytes + keptBytes,
      droppedBytes: previous.droppedBytes + (size - keptBytes),
      droppedEvents: previous.droppedEvents + 1,
    },
    kept,
  }
}

/**
 * @experimental Admit one write to one bounded channel. The host meters every byte a cell produces,
 * whatever wrote it: the kernel's own `console`, a direct write to the process's stdout, a native
 * addon, or a subprocess that inherited the descriptor. Metering in the worker could only ever see
 * the first of those, so the bound the profile advertises is enforced here, where every byte
 * actually arrives.
 */
export const ingest: {
  (input: IngestRequest): (previous: Accumulator) => Ingested
  (previous: Accumulator, input: IngestRequest): Ingested
} = Function.dual(2, (previous: Accumulator, input: IngestRequest): Ingested => {
  const before = previous[input.channel]
  const { state, kept } = metered(before, input.text, input.limit)
  return {
    channels: { ...previous, [input.channel]: state },
    kept,
    truncated: state.droppedEvents > before.droppedEvents,
  }
})

/** @experimental What every channel of one cell dropped, reported per channel that dropped anything. */
export const truncationOf = (channels: Accumulator): ReadonlyArray<Truncation> =>
  (["stdout", "stderr", "display"] as const)
    .map((channel) => ({
      channel,
      droppedBytes: channels[channel].droppedBytes,
      droppedEvents: channels[channel].droppedEvents,
    }))
    .filter((entry) => entry.droppedBytes > 0 || entry.droppedEvents > 0)

/** @experimental One metered write folded into the events a host streams for it. */
export const outputEvents = (input: {
  readonly cellId: string
  readonly channel: Exclude<Channel, "result">
  readonly ingested: Ingested
  readonly sequence: number
}): ReadonlyArray<CellEvent> => {
  const { cellId, channel, ingested } = input
  const state = ingested.channels[channel]
  const kept: ReadonlyArray<CellEvent> =
    ingested.kept.length === 0
      ? []
      : channel === "stderr"
        ? [{ _tag: "Stderr", cellId, sequence: input.sequence, text: ingested.kept }]
        : channel === "stdout"
          ? [{ _tag: "Stdout", cellId, sequence: input.sequence, text: ingested.kept }]
          : []
  return ingested.truncated
    ? [
        ...kept,
        {
          _tag: "OutputTruncated",
          cellId,
          sequence: input.sequence + kept.length,
          channel,
          droppedBytes: state.droppedBytes,
          droppedEvents: state.droppedEvents,
        },
      ]
    : kept
}

/**
 * @experimental Largest formatted result value carried into a cell's terminal events. A cell's
 * result enters the model's context whole, so it is bounded like every other channel; the bytes
 * past the bound are named, and the value itself still lives in the kernel namespace.
 */
export const maxResultBytes = 16_384

const boundResult = (value: string): { readonly value: string; readonly droppedBytes: number } => {
  const bytes = new TextEncoder().encode(value).byteLength
  if (bytes <= maxResultBytes) return { value, droppedBytes: 0 }
  const kept = keptWithinBytes(value, maxResultBytes)
  const keptBytes = new TextEncoder().encode(kept).byteLength
  return {
    value: `${kept}\n[result truncated: showing ${keptBytes} of ${bytes} bytes. The full value is still in the kernel — bind it to a variable and slice it, or write it to a file, instead of returning it whole]`,
    droppedBytes: bytes - keptBytes,
  }
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
      value: boundResult(frame.value).value,
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
    const bounded = boundResult(frame.value)
    return {
      result: {
        cellId: frame.cellId,
        epoch: input.epoch,
        sequence: input.sequence,
        value: bounded.value,
        stdout: input.channels.stdout.text,
        stderr: input.channels.stderr.text,
        durationMillis: frame.durationMillis,
        truncation:
          bounded.droppedBytes === 0
            ? truncationOf(input.channels)
            : [
                ...truncationOf(input.channels),
                { channel: "result", droppedBytes: bounded.droppedBytes, droppedEvents: 0 },
              ],
      },
      failure: undefined,
    }
  }
  if (frame._tag === "Stopped") {
    return {
      result: undefined,
      failure: CellExecutionFailed.make({
        cellId: frame.cellId,
        epoch: input.epoch,
        sequence: input.sequence,
        name: frame.kind === "threw" ? frame.name : `Cell${frame.kind}`,
        message: frame.message,
        ...(frame.stack === undefined ? {} : { stack: frame.stack }),
        stdout: input.channels.stdout.text,
        stderr: input.channels.stderr.text,
        durationMillis: frame.durationMillis,
        truncation: truncationOf(input.channels),
      }),
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
