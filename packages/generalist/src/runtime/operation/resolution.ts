import { digest as pinDigest } from "../../core/durable/pin.js"
import { Schema } from "effect"

export const OperationResolution = Schema.Union([
  Schema.TaggedStruct("Succeeded", { value: Schema.Unknown }),
  Schema.TaggedStruct("Failed", { error: Schema.Unknown }),
  Schema.TaggedStruct("Retry", {}),
])
export type OperationResolution = typeof OperationResolution.Type

/** @experimental Stable digest used for operation-resolution idempotency. */
export const digest = (resolution: OperationResolution): string => pinDigest(resolution)

export const ResolveOperationInput = Schema.Struct({
  runId: Schema.String,
  operationId: Schema.String,
  idempotencyKey: Schema.String,
  resolution: OperationResolution,
})
export type ResolveOperationInput = typeof ResolveOperationInput.Type
