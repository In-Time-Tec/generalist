import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

/** How many queued inputs to drain at a boundary. */
export type DrainMode = "all" | "one-at-a-time"

/** How a process-local producer behaves while its Run inbox is full. */
export type OverflowStrategy = "fail" | "backpressure"

/** Policy for one steering queue. */
export interface QueuePolicy {
  readonly mode?: DrainMode
  readonly capacity?: number
  readonly onFull?: OverflowStrategy
}

/** Queue identity for typed steering errors. */
export type QueueName = "steering" | "followUp"

/** Prompt injected into a live agent run. */
export interface Input {
  readonly prompt: Prompt.RawInput
}

/** Per-Run process-local steering policy. */
export interface Options {
  readonly steering?: QueuePolicy
  readonly followUp?: QueuePolicy
  readonly maxPendingBytes?: number
}

/** Default maximum queued entries in each process-local or durable steering lane. */
export const defaultCapacity = 64

/** Default aggregate encoded prompt bytes pending for one Run. */
export const defaultMaxPendingBytes = 1_048_576

/** Stable receipt for one process-local Run input. */
export const Receipt = Schema.Struct({
  runId: Schema.String,
  queue: Schema.Literals(["steering", "followUp"]),
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

/** Stable receipt for one process-local Run input. */
export type Receipt = typeof Receipt.Type

/** A finite Run inbox rejected an input without admitting it. */
export class InboxFull extends Schema.TaggedError<InboxFull>()("generalist/core/InboxFull", {
  runId: Schema.String,
  queue: Schema.Literals(["steering", "followUp"]),
  dimension: Schema.Literals(["entries", "bytes"]),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
}) {}

/** A producer attempted to address a Run after its inbox closed. */
export class RunClosed extends Schema.TaggedError<RunClosed>()("generalist/core/RunClosed", {
  runId: Schema.String,
}) {}

/** A process-local Run inbox policy is not finite and positive. */
export class PolicyInvalid extends Schema.TaggedError<PolicyInvalid>()("generalist/core/PolicyInvalid", {
  field: Schema.String,
  value: Schema.String,
}) {}

/** Producer-only process-local control capability for one Run. */
export interface Producer {
  readonly steer: (input: Input) => Effect.Effect<Receipt, InboxFull | RunClosed>
  readonly followUp: (input: Input) => Effect.Effect<Receipt, InboxFull | RunClosed>
}

/** Encoded size charged against the aggregate Run inbox byte bound. */
export const promptBytes = (prompt: Prompt.Prompt): number =>
  new TextEncoder().encode(JSON.stringify(Schema.encodeSync(Prompt.Prompt)(prompt))).byteLength
