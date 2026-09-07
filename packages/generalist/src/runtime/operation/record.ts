import { ReplayPolicy as DriverReplayPolicy } from "../../core/durable/driver.js"
import { Schema } from "effect"
import { OperationResolution } from "./resolution.js"
import { ExecutionCheckpoint } from "../execution/state.js"

export const OperationKind = Schema.Literals([
  "model",
  "tool",
  "memory",
  "compaction",
  "handoff",
  "send",
  "wait",
  "structured-output",
  "log",
  "nested",
  "operator",
])
export type OperationKind = typeof OperationKind.Type

export const OperationStatus = Schema.Literals([
  "requested",
  "running",
  "cancelling",
  "cancelled",
  "succeeded",
  "failed",
  "unknown",
])
export type OperationStatus = typeof OperationStatus.Type

export const ReplayPolicy = DriverReplayPolicy
export type ReplayPolicy = DriverReplayPolicy

export interface OperationRecord {
  readonly runId: string
  readonly operationId: string
  readonly operationKey: string
  readonly kind: OperationKind
  readonly status: OperationStatus
  readonly inputDigest: string
  readonly input: unknown
  readonly result?: unknown
  readonly error?: unknown
  readonly replayPolicy: ReplayPolicy
  readonly attempt: number
  readonly resolutionIdempotencyKey?: string
  readonly resolution?: OperationResolution
  readonly checkpoint?: ExecutionCheckpoint
  readonly completedSequence?: number
}


export const canBlindRetry = (policy: ReplayPolicy): boolean => policy === "pure" || policy === "provider-idempotent"
