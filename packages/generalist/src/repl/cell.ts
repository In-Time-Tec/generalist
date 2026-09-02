import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"

/** Generalist Session identity that owns exactly one kernel. */
export const SessionId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(256))
export type SessionId = typeof SessionId.Type

/** Identity of one authored cell execution. */
export const CellId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(256))
export type CellId = typeof CellId.Type

/** Kernel generation. A restart or profile change starts a new epoch. */
export const Epoch = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export type Epoch = typeof Epoch.Type

/** Cell-local monotonic event ordinal. Starts at 0 and increases by one per emitted event. */
export const Sequence = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export type Sequence = typeof Sequence.Type

const NonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** Output channel of one cell. */
export const Channel = Schema.Literals(["stdout", "stderr", "result", "display"])
export type Channel = typeof Channel.Type

/** Why a kernel binding did not survive a snapshot restore. */
export const DropReason = Schema.Literals(["function", "class", "module", "live-handle", "oversized", "unserializable"])
export type DropReason = typeof DropReason.Type

/** Why the kernel started a new epoch. */
export const RestartReason = Schema.Literals(["requested", "killed", "crashed", "profile-changed"])
export type RestartReason = typeof RestartReason.Type

/** Terminal value of a cell that completed without throwing. */
export const CellResult = Schema.Struct({
  cellId: CellId,
  epoch: Epoch,
  sequence: Sequence,
  value: Schema.String,
  stdout: Schema.String,
  stderr: Schema.String,
  durationMillis: NonNegative,
})
export type CellResult = typeof CellResult.Type

/**
 * The cell threw. This is model input, not a framework failure: the namespace, the
 * kernel, and every prior binding survive.
 */
export class CellExecutionFailed extends ActionableTaggedError<CellExecutionFailed>()(
  "generalist/repl/CellExecutionFailed",
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
    hint: errorHint("Inspect the cell message, stack, stdout, and stderr; correct the cell and submit a new one."),
  },
) {}

/** Why no kernel could run the cell. */
export const UnavailableReason = Schema.Literals([
  "start-failed",
  "closed",
  "lease-lost",
  "profile-mismatch",
  "deadline-exceeded",
])
export type UnavailableReason = typeof UnavailableReason.Type

/** No kernel was available to run the cell. Nothing was evaluated. */
export class KernelUnavailable extends ActionableTaggedError<KernelUnavailable>()("generalist/repl/KernelUnavailable", {
  sessionId: SessionId,
  reason: UnavailableReason,
  message: Schema.String,
  hint: errorHint("Restore or recreate the session kernel, then submit the cell again."),
}) {}

/** The kernel broke the cell protocol: out-of-order sequence, unknown frame, or malformed payload. */
export class KernelProtocolViolation extends ActionableTaggedError<KernelProtocolViolation>()(
  "generalist/repl/KernelProtocolViolation",
  {
    sessionId: SessionId,
    cellId: Schema.optionalKey(CellId),
    message: Schema.String,
    hint: errorHint("Restart the kernel and inspect the host/kernel protocol implementation before retrying."),
  },
) {}

/** Why the cell outcome is uncertain. */
export const UnknownReason = Schema.Literals(["host-terminated", "kernel-killed", "transport-lost"])
export type UnknownReason = typeof UnknownReason.Type

/**
 * The cell may or may not have committed its effects. It is never replayed; a host
 * resolves it explicitly.
 */
export class CellOutcomeUnknown extends ActionableTaggedError<CellOutcomeUnknown>()(
  "generalist/repl/CellOutcomeUnknown",
  {
    sessionId: SessionId,
    cellId: CellId,
    epoch: Epoch,
    reason: UnknownReason,
    message: Schema.String,
    hint: errorHint(
      "Reconcile external effects before choosing to submit a new cell; never replay this cell automatically.",
    ),
  },
) {}

/** Closed union of everything a cell call can fail with. */
export const CellFailure = Schema.Union([
  CellExecutionFailed,
  KernelUnavailable,
  KernelProtocolViolation,
  CellOutcomeUnknown,
])
export type CellFailure = typeof CellFailure.Type

/** A kernel process is starting for this cell. */
export const KernelStarting = Schema.TaggedStruct("KernelStarting", {
  cellId: CellId,
  sequence: Sequence,
  sessionId: SessionId,
  epoch: Epoch,
})

/** The kernel is bootstrapped and the cell is about to evaluate. */
export const KernelReady = Schema.TaggedStruct("KernelReady", {
  cellId: CellId,
  sequence: Sequence,
  sessionId: SessionId,
  epoch: Epoch,
  profileDigest: Schema.String,
})

/** Stdout produced by the running cell. */
export const Stdout = Schema.TaggedStruct("Stdout", {
  cellId: CellId,
  sequence: Sequence,
  text: Schema.String,
})

/** Stderr produced by the running cell. */
export const Stderr = Schema.TaggedStruct("Stderr", {
  cellId: CellId,
  sequence: Sequence,
  text: Schema.String,
})

/** The cell's terminal value. */
export const Result = Schema.TaggedStruct("Result", {
  cellId: CellId,
  sequence: Sequence,
  value: Schema.String,
  durationMillis: NonNegative,
})

/** One lifecycle transition for a host binding invoked by the cell. */
export const HostCall = Schema.TaggedStruct("HostCall", {
  cellId: CellId,
  sequence: Sequence,
  requestId: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),
  module: Schema.String,
  operation: Schema.String,
  inputSummary: Schema.String.check(Schema.isMaxLength(2_048)),
  status: Schema.Literals(["started", "returned", "failed"]),
  durationMillis: Schema.optionalKey(NonNegative),
  message: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2_048))),
})

/** A host-rendered artifact emitted by the cell. */
export const Display = Schema.TaggedStruct("Display", {
  cellId: CellId,
  sequence: Sequence,
  mediaType: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  data: Schema.String,
  name: Schema.optionalKey(Schema.String),
})

/** Snapshot restore put these bindings back into the namespace. */
export const StateRestored = Schema.TaggedStruct("StateRestored", {
  cellId: CellId,
  sequence: Sequence,
  epoch: Epoch,
  names: Schema.Array(Schema.String),
  restoredBySource: Schema.Array(Schema.String),
})

/** These bindings did not survive and will not come back. */
export const StateLost = Schema.TaggedStruct("StateLost", {
  cellId: CellId,
  sequence: Sequence,
  epoch: Epoch,
  droppedNames: Schema.Array(Schema.String),
  reason: DropReason,
})

/** The kernel started a new epoch. */
export const KernelRestarted = Schema.TaggedStruct("KernelRestarted", {
  cellId: CellId,
  sequence: Sequence,
  sessionId: SessionId,
  epoch: Epoch,
  reason: RestartReason,
})

/** Closed union of cell lifecycle events, ordered by a cell-local monotonic sequence. */
export const CellEvent = Schema.Union([
  KernelStarting,
  KernelReady,
  Stdout,
  Stderr,
  HostCall,
  Result,
  Display,
  StateRestored,
  StateLost,
  KernelRestarted,
])
export type CellEvent = typeof CellEvent.Type

/** Every event tag in the closed cell event union. */
export const eventTags: ReadonlyArray<CellEvent["_tag"]> = [
  "KernelStarting",
  "KernelReady",
  "Stdout",
  "Stderr",
  "HostCall",
  "Result",
  "Display",
  "StateRestored",
  "StateLost",
  "KernelRestarted",
]

/** Every failure tag in the closed cell failure union. */
export const failureTags: ReadonlyArray<CellFailure["_tag"]> = [
  "generalist/repl/CellExecutionFailed",
  "generalist/repl/KernelUnavailable",
  "generalist/repl/KernelProtocolViolation",
  "generalist/repl/CellOutcomeUnknown",
]

/** The cell-local ordinal carried by any cell event. */
export const sequenceOf = (event: CellEvent): number => event.sequence
export interface SequenceRun {
  readonly sessionId: string
  readonly events: ReadonlyArray<CellEvent>
}

/**
 * Verify one cell's event order. A kernel must emit strictly increasing sequences
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
