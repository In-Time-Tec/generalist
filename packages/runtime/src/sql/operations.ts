import { Schema } from "effect"
import type { OperationResolution } from "../operation-resolution.js"

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
])
export type OperationKind = typeof OperationKind.Type

export const OperationStatus = Schema.Literals(["requested", "running", "succeeded", "failed", "unknown"])
export type OperationStatus = typeof OperationStatus.Type

export const ReplayPolicy = Schema.Literals(["pure", "provider-idempotent", "never"])
export type ReplayPolicy = typeof ReplayPolicy.Type

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
}

export const canBlindRetry = (policy: ReplayPolicy): boolean => policy === "pure" || policy === "provider-idempotent"
