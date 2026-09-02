import { Effect, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

/** When one message may enter its target Run. */
export const AdmissionPolicy = Schema.Literals(["steer", "enqueue", "interrupt", "rollback", "reject"])
export type AdmissionPolicy = typeof AdmissionPolicy.Type

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
export class InboxFull extends ActionableTaggedError<InboxFull>()("generalist/core/InboxFull", {
  runId: Schema.String,
  queue: Schema.Literals(["steering", "followUp"]),
  dimension: Schema.Literals(["entries", "bytes"]),
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
  hint: errorHint("Drain the queue, reduce the prompt, or increase the finite inbox bound before retrying."),
}) {}

/** A producer attempted to address a Run after its inbox closed. */
export class RunClosed extends ActionableTaggedError<RunClosed>()("generalist/core/RunClosed", {
  runId: Schema.String,
  hint: errorHint("Start a new Run; this process-local Run no longer accepts steering or follow-up input."),
}) {}

/** A process-local Run inbox policy is not finite and positive. */
export class PolicyInvalid extends ActionableTaggedError<PolicyInvalid>()("generalist/core/PolicyInvalid", {
  field: Schema.String,
  value: Schema.String,
  hint: errorHint("Set the named inbox policy field to a positive safe integer."),
}) {}

/** Rollback needs a durable journal and is unavailable for a process-local Run. */
export class RollbackRequiresRuntime extends ActionableTaggedError<RollbackRequiresRuntime>()(
  "generalist/core/RollbackRequiresRuntime",
  {
    runId: Schema.String,
    hint: errorHint("Start the Agent through Runtime before sending with the rollback policy."),
  },
) {}

/** A reject-policy message arrived while its process-local Run was executing. */
export class RunBusy extends ActionableTaggedError<RunBusy>()("generalist/core/RunBusy", {
  runId: Schema.String,
  hint: errorHint("Retry after the current turn completes or choose a policy that queues the message."),
}) {}

/** Producer-only process-local control capability for one Run. */
export interface Producer {
  readonly steer: (input: Input) => Effect.Effect<Receipt, InboxFull | RunClosed>
  readonly followUp: (input: Input) => Effect.Effect<Receipt, InboxFull | RunClosed>
}

/** Encoded size charged against the aggregate Run inbox byte bound. */
export const promptBytes = (prompt: Prompt.Prompt): number =>
  new TextEncoder().encode(JSON.stringify(Schema.encodeSync(Prompt.Prompt)(prompt))).byteLength
