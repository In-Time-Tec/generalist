import { Pins } from "@batonfx/core"
import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

/** @experimental Durable steering accepted for a Run. */
export interface SteeringEntry {
  readonly entryId: string
  readonly runId: string
  readonly sequence: number
  readonly idempotencyKey: string
  readonly digest: string
  readonly prompt: Prompt.Prompt
}

/** @experimental Durable reconstruction data for a steering-driven turn. */
export const ExecutionContinuation = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  prompt: Prompt.Prompt,
  nextTurn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  steeringEntryIds: Schema.Array(Schema.String),
})

/** @experimental Durable reconstruction data for a steering-driven turn. */
export type ExecutionContinuation = typeof ExecutionContinuation.Type

export const encodeContinuation = (continuation: ExecutionContinuation): string =>
  JSON.stringify(Schema.encodeSync(ExecutionContinuation)(continuation))

export const decodeContinuation = (encoded: string): ExecutionContinuation =>
  Schema.decodeUnknownSync(ExecutionContinuation)(JSON.parse(encoded) as unknown)

/** @experimental Stable digest used for steering idempotency. */
export const digest = (prompt: Prompt.Prompt): string => Pins.digest(Schema.encodeSync(Prompt.Prompt)(prompt))
