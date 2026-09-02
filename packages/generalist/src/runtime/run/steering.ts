import { digest as pinDigest } from "../../core/durable/pin.js"
export { InboxFull, defaultCapacity, defaultMaxPendingBytes, promptBytes } from "../../core/turn/steering.js"
import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

/** Stable identity returned for durable steering admission and every identical retry. */
export const SteeringReceipt = Schema.Struct({
  entryId: Schema.String,
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

/** Stable identity returned for durable steering admission and every identical retry. */
export type SteeringReceipt = typeof SteeringReceipt.Type

/** Durable steering accepted for a Run. */
export interface SteeringEntry {
  readonly entryId: string
  readonly runId: string
  readonly sequence: number
  readonly idempotencyKey: string
  readonly digest: string
  readonly prompt: Prompt.Prompt
}

/** Durable reconstruction data for a steering-driven turn. */
export const ExecutionContinuation = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  prompt: Prompt.Prompt,
  nextTurn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  steeringEntryIds: Schema.Array(Schema.String),
})

/** Durable reconstruction data for a steering-driven turn. */
export type ExecutionContinuation = typeof ExecutionContinuation.Type

export const encodeContinuation = (continuation: ExecutionContinuation): string =>
  JSON.stringify(Schema.encodeSync(ExecutionContinuation)(continuation))

export const decodeContinuation = (encoded: string): ExecutionContinuation =>
  Schema.decodeUnknownSync(ExecutionContinuation)(JSON.parse(encoded))

/** Stable digest used for steering idempotency. */
export const digest = (prompt: Prompt.Prompt): string => prompt.pipe(Schema.encodeSync(Prompt.Prompt), pinDigest)
