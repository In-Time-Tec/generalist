import { Schema } from "effect"

/** @experimental Baton Session identity that owns exactly one kernel. */
export const SessionId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(256))
/** @experimental */
export type SessionId = typeof SessionId.Type

/** @experimental Identity of one authored cell execution. */
export const CellId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(256))
/** @experimental */
export type CellId = typeof CellId.Type

/** @experimental Kernel generation. A restart or profile change starts a new epoch. */
export const Epoch = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
/** @experimental */
export type Epoch = typeof Epoch.Type

/** @experimental Cell-local monotonic event ordinal. Starts at 0 and increases by one per emitted event. */
export const Sequence = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
/** @experimental */
export type Sequence = typeof Sequence.Type

const NonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** @experimental Bounded output channel of one cell. */
export const Channel = Schema.Literals(["stdout", "stderr", "result", "display"])
/** @experimental */
export type Channel = typeof Channel.Type

/** @experimental Exactly what a channel dropped when it hit its ingestion bound. */
export const Truncation = Schema.Struct({
  channel: Channel,
  droppedBytes: NonNegative,
  droppedEvents: NonNegative,
})
/** @experimental */
export type Truncation = typeof Truncation.Type

/** @experimental Why a kernel binding did not survive a snapshot restore. */
export const DropReason = Schema.Literals(["function", "class", "module", "live-handle", "oversized", "unserializable"])
/** @experimental */
export type DropReason = typeof DropReason.Type

/** @experimental Why the kernel started a new epoch. */
export const RestartReason = Schema.Literals(["requested", "killed", "crashed", "profile-changed"])
/** @experimental */
export type RestartReason = typeof RestartReason.Type

/** @experimental Terminal value of a cell that completed without throwing. */
export const CellResult = Schema.Struct({
  cellId: CellId,
  epoch: Epoch,
  sequence: Sequence,
  value: Schema.String,
  stdout: Schema.String,
  stderr: Schema.String,
  durationMillis: NonNegative,
  truncation: Schema.Array(Truncation),
})
/** @experimental */
export type CellResult = typeof CellResult.Type

/**
 * @experimental The cell threw. This is model input, not a framework failure: the namespace, the
 * kernel, and every prior binding survive.
 */
export class CellExecutionFailed extends Schema.TaggedErrorClass<CellExecutionFailed>()(
  "@batonfx/repl/CellExecutionFailed",
  {
    cellId: CellId,
    epoch: Epoch,
    sequence: Sequence,
    name: Schema.String,
    message: Schema.String,
    stack: Schema.optionalKey(Schema.String),
    stdout: Schema.String,
    stderr: Schema.String,
    durationMillis: NonNegative,
    truncation: Schema.Array(Truncation),
  },
) {}

/** @experimental Why no kernel could run the cell. */
export const UnavailableReason = Schema.Literals([
  "start-failed",
  "closed",
  "lease-lost",
  "profile-mismatch",
  "deadline-exceeded",
])
/** @experimental */
export type UnavailableReason = typeof UnavailableReason.Type

/** @experimental No kernel was available to run the cell. Nothing was evaluated. */
export class KernelUnavailable extends Schema.TaggedErrorClass<KernelUnavailable>()("@batonfx/repl/KernelUnavailable", {
  sessionId: SessionId,
  reason: UnavailableReason,
  message: Schema.String,
}) {}

/** @experimental The kernel broke the cell protocol: out-of-order sequence, unknown frame, or malformed payload. */
export class KernelProtocolViolation extends Schema.TaggedErrorClass<KernelProtocolViolation>()(
  "@batonfx/repl/KernelProtocolViolation",
  {
    sessionId: SessionId,
    cellId: Schema.optionalKey(CellId),
    message: Schema.String,
  },
) {}

/** @experimental Why the cell outcome is uncertain. */
export const UnknownReason = Schema.Literals(["host-terminated", "kernel-killed", "transport-lost"])
/** @experimental */
export type UnknownReason = typeof UnknownReason.Type

/**
 * @experimental The cell may or may not have committed its effects. It is never replayed; a host
 * resolves it explicitly.
 */
export class CellOutcomeUnknown extends Schema.TaggedErrorClass<CellOutcomeUnknown>()(
  "@batonfx/repl/CellOutcomeUnknown",
  {
    sessionId: SessionId,
    cellId: CellId,
    epoch: Epoch,
    reason: UnknownReason,
    message: Schema.String,
  },
) {}

/** @experimental Closed union of everything a cell call can fail with. */
export const CellFailure = Schema.Union([
  CellExecutionFailed,
  KernelUnavailable,
  KernelProtocolViolation,
  CellOutcomeUnknown,
])
/** @experimental */
export type CellFailure = typeof CellFailure.Type

/** @experimental A kernel process is starting for this cell. */
export const KernelStarting = Schema.TaggedStruct("KernelStarting", {
  cellId: CellId,
  sequence: Sequence,
  sessionId: SessionId,
  epoch: Epoch,
})

/** @experimental The kernel is bootstrapped and the cell is about to evaluate. */
export const KernelReady = Schema.TaggedStruct("KernelReady", {
  cellId: CellId,
  sequence: Sequence,
  sessionId: SessionId,
  epoch: Epoch,
  profileDigest: Schema.String,
})

/** @experimental Bounded stdout produced by the running cell. */
export const Stdout = Schema.TaggedStruct("Stdout", {
  cellId: CellId,
  sequence: Sequence,
  text: Schema.String,
})

/** @experimental Bounded stderr produced by the running cell. */
export const Stderr = Schema.TaggedStruct("Stderr", {
  cellId: CellId,
  sequence: Sequence,
  text: Schema.String,
})

/** @experimental The cell's terminal value. */
export const Result = Schema.TaggedStruct("Result", {
  cellId: CellId,
  sequence: Sequence,
  value: Schema.String,
  durationMillis: NonNegative,
})

/** @experimental A host-rendered artifact emitted by the cell. */
export const Display = Schema.TaggedStruct("Display", {
  cellId: CellId,
  sequence: Sequence,
  mediaType: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  data: Schema.String,
  name: Schema.optionalKey(Schema.String),
})

/** @experimental A channel hit its ingestion bound and dropped output. */
export const OutputTruncated = Schema.TaggedStruct("OutputTruncated", {
  cellId: CellId,
  sequence: Sequence,
  channel: Channel,
  droppedBytes: NonNegative,
  droppedEvents: NonNegative,
})

/** @experimental Snapshot restore put these bindings back into the namespace. */
export const StateRestored = Schema.TaggedStruct("StateRestored", {
  cellId: CellId,
  sequence: Sequence,
  epoch: Epoch,
  names: Schema.Array(Schema.String),
  restoredBySource: Schema.Array(Schema.String),
})

/** @experimental These bindings did not survive and will not come back. */
export const StateLost = Schema.TaggedStruct("StateLost", {
  cellId: CellId,
  sequence: Sequence,
  epoch: Epoch,
  droppedNames: Schema.Array(Schema.String),
  reason: DropReason,
})

/** @experimental The kernel started a new epoch. */
export const KernelRestarted = Schema.TaggedStruct("KernelRestarted", {
  cellId: CellId,
  sequence: Sequence,
  sessionId: SessionId,
  epoch: Epoch,
  reason: RestartReason,
})

/** @experimental Closed union of cell lifecycle events, ordered by a cell-local monotonic sequence. */
export const CellEvent = Schema.Union([
  KernelStarting,
  KernelReady,
  Stdout,
  Stderr,
  Result,
  Display,
  OutputTruncated,
  StateRestored,
  StateLost,
  KernelRestarted,
])
/** @experimental */
export type CellEvent = typeof CellEvent.Type

/** @experimental Every event tag in the closed cell event union. */
export const eventTags: ReadonlyArray<CellEvent["_tag"]> = [
  "KernelStarting",
  "KernelReady",
  "Stdout",
  "Stderr",
  "Result",
  "Display",
  "OutputTruncated",
  "StateRestored",
  "StateLost",
  "KernelRestarted",
]

/** @experimental Every failure tag in the closed cell failure union. */
export const failureTags: ReadonlyArray<CellFailure["_tag"]> = [
  "@batonfx/repl/CellExecutionFailed",
  "@batonfx/repl/KernelUnavailable",
  "@batonfx/repl/KernelProtocolViolation",
  "@batonfx/repl/CellOutcomeUnknown",
]

/** @experimental The cell-local ordinal carried by any cell event. */
export const sequenceOf = (event: CellEvent): number => event.sequence

/** @experimental */
export interface SequenceRun {
  readonly sessionId: string
  readonly events: ReadonlyArray<CellEvent>
}

/**
 * @experimental Verify one cell's event order. A kernel must emit strictly increasing sequences
 * starting at 0 for exactly one cell; anything else is a protocol violation.
 */
export const validateSequence = (run: SequenceRun): KernelProtocolViolation | undefined => {
  const { events, sessionId } = run
  let previous = -1
  for (const event of events) {
    const cellId = event.cellId
    if (event.sequence !== previous + 1) {
      return KernelProtocolViolation.make({
        sessionId,
        cellId,
        message: `expected sequence ${previous + 1} but received ${event.sequence}`,
      })
    }
    const first = events[0]
    if (first !== undefined && cellId !== first.cellId) {
      return KernelProtocolViolation.make({
        sessionId,
        cellId,
        message: `expected cell ${first.cellId} but received ${cellId}`,
      })
    }
    previous = event.sequence
  }
  return undefined
}
