import { ReplayPolicy as DriverReplayPolicy } from "../../core/durable/driver.js"
import { Schema } from "effect"
import { OperationResolution } from "../operation/resolution.js"
import { decodeJson, decodeJsonValue } from "./codec/codecs.js"
import type { OperationRow } from "./codec/rows.js"

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
}

export const toOperationRecord = (row: OperationRow): OperationRecord => {
  const record = {
    runId: row.run_id,
    operationId: row.operation_id,
    operationKey: row.operation_key,
    kind: row.kind,
    status: row.status,
    inputDigest: row.input_digest,
    input: decodeJsonValue(row.input_json),
    replayPolicy: row.replay_policy,
    attempt: row.attempt,
  }
  const withResult = row.result_json === null ? record : { ...record, result: decodeJsonValue(row.result_json) }
  const withError = row.error_json === null ? withResult : { ...withResult, error: decodeJsonValue(row.error_json) }
  const withResolutionKey =
    row.resolution_idempotency_key === null
      ? withError
      : { ...withError, resolutionIdempotencyKey: row.resolution_idempotency_key }
  return row.resolution_json === null
    ? withResolutionKey
    : { ...withResolutionKey, resolution: decodeJson(OperationResolution, row.resolution_json) }
}

export const canBlindRetry = (policy: ReplayPolicy): boolean => policy === "pure" || policy === "provider-idempotent"
