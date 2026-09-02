import { Schema } from "effect"
import { CellId } from "../cell.js"

/** Wire version of the JSONL cell protocol spoken over the kernel child process stdio. */
export const wireVersion = 1

const NonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const RequestId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))

/**
 * Run one authored cell in the kernel namespace. The worker carries no output bound:
 * every byte a cell produces is metered by the host, which is the only place that sees all of them.
 */
export const Execute = Schema.TaggedStruct("Execute", {
  cellId: CellId,
  code: Schema.String,
  deadlineMillis: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
})

/** Abort the running cell's signal without killing the kernel. */
export const Interrupt = Schema.TaggedStruct("Interrupt", { cellId: CellId })

/** Settle one pending host request awaited inside a cell. */
export const HostResponse = Schema.TaggedStruct("HostResponse", {
  requestId: RequestId,
  outcome: Schema.Union([
    Schema.TaggedStruct("Success", { output: Schema.Unknown }),
    Schema.TaggedStruct("Failure", { failure: Schema.Unknown }),
    Schema.TaggedStruct("Rejected", { message: Schema.String }),
  ]),
})

/** Mount the host binding surface a cell can address. */
export const Mount = Schema.TaggedStruct("Mount", {
  modules: Schema.Array(Schema.Struct({ module: Schema.String, operations: Schema.Array(Schema.String) })),
})

/** Put a previously captured namespace back before the first cell of an epoch. */
export const Restore = Schema.TaggedStruct("Restore", { requestId: RequestId, payload: Schema.String })

/** Capture the current namespace. */
export const Capture = Schema.TaggedStruct("Capture", { requestId: RequestId })

/** Read the live namespace without evaluating model-authored source. */
export const Inspect = Schema.TaggedStruct("Inspect", { requestId: RequestId })

/** Close the kernel gracefully. */
export const Shutdown = Schema.TaggedStruct("Shutdown", {})

/** Everything a host sends to a kernel worker. */
export const HostFrame = Schema.Union([Execute, Interrupt, HostResponse, Mount, Restore, Capture, Inspect, Shutdown])
export type HostFrame = typeof HostFrame.Type

/** The worker bootstrapped its context and can accept cells. */
export const Ready = Schema.TaggedStruct("Ready", { wireVersion: Schema.Int })

/** Console output produced by the running cell, bounded by the host on arrival. */
export const Output = Schema.TaggedStruct("Output", {
  cellId: CellId,
  channel: Schema.Literals(["stdout", "stderr"]),
  text: Schema.String,
})

/** A host-rendered artifact emitted by the running cell. */
export const DisplayFrame = Schema.TaggedStruct("Display", {
  cellId: CellId,
  mediaType: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  data: Schema.String,
  name: Schema.optionalKey(Schema.String),
})

/** The cell asked a mounted host module for something. */
export const HostRequest = Schema.TaggedStruct("HostRequest", {
  cellId: Schema.optionalKey(CellId),
  requestId: RequestId,
  module: Schema.String,
  operation: Schema.String,
  /**
   * A binding called with no argument sends nothing, because JSON has no way to carry `undefined`.
   * A required field would fail to decode and the cell would wait for an answer that never comes.
   */
  input: Schema.optionalKey(Schema.Unknown),
})

/** The cell completed with a value. */
export const Completed = Schema.TaggedStruct("Completed", {
  cellId: CellId,
  value: Schema.String,
  durationMillis: NonNegative,
})

/** Why an evaluation stopped short of its own terminal value. */
export const StopKind = Schema.Literals(["threw", "timed-out", "interrupted", "aborted"])
export type StopKind = typeof StopKind.Type

/** The cell threw, timed out, or was interrupted in place. */
export const Stopped = Schema.TaggedStruct("Stopped", {
  cellId: CellId,
  kind: StopKind,
  name: Schema.String,
  message: Schema.String,
  stack: Schema.optionalKey(Schema.String),
  durationMillis: NonNegative,
})

/** One binding named in a capture or restore account. */
export const NamedBinding = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(["value", "source", "import"]),
})

/** One binding a capture or restore could not carry. */
export const DroppedName = Schema.Struct({
  name: Schema.String,
  reason: Schema.Literals(["function", "class", "module", "live-handle", "oversized", "unserializable"]),
})

/** The captured namespace and its honest saved/dropped account. */
export const Captured = Schema.TaggedStruct("Captured", {
  requestId: RequestId,
  payload: Schema.String,
  restored: Schema.Array(NamedBinding),
  dropped: Schema.Array(DroppedName),
})

/** What a restore actually put back, and what it could not. */
export const Restored = Schema.TaggedStruct("Restored", {
  requestId: RequestId,
  restored: Schema.Array(NamedBinding),
  dropped: Schema.Array(DroppedName),
  failure: Schema.optionalKey(Schema.String),
})

/** The live namespace of the current epoch. */
export const Inspected = Schema.TaggedStruct("Inspected", {
  requestId: RequestId,
  bindings: Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String, snapshotable: Schema.Boolean })),
})

/** Everything a kernel worker sends to its host. */
export const WorkerFrame = Schema.Union([
  Ready,
  Output,
  DisplayFrame,
  HostRequest,
  Completed,
  Stopped,
  Captured,
  Restored,
  Inspected,
])
export type WorkerFrame = typeof WorkerFrame.Type
export type Captured = typeof Captured.Type
export type Restored = typeof Restored.Type
export type Inspected = typeof Inspected.Type
export type Completed = typeof Completed.Type
export type Stopped = typeof Stopped.Type
export type HostRequest = typeof HostRequest.Type
