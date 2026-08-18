import { DurableDriver } from "tenetkit"
import { Schema } from "effect"
import { OperationResolution } from "../operation-resolution.js"
import { decodeJson, decodeJsonValue } from "./codecs.js"
import type { OperationRow } from "./rows.js"

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
])
export type OperationKind = typeof OperationKind.Type

export const OperationStatus = Schema.Literals(["requested", "running", "succeeded", "failed", "unknown"])
export type OperationStatus = typeof OperationStatus.Type

export const ReplayPolicy = DurableDriver.ReplayPolicy
export type ReplayPolicy = DurableDriver.ReplayPolicy

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

export const toOperationRecord = (row: OperationRow): OperationRecord => ({
  runId: row.run_id,
  operationId: row.operation_id,
  operationKey: row.operation_key,
  kind: row.kind,
  status: row.status,
  inputDigest: row.input_digest,
  input: decodeJsonValue(row.input_json),
  replayPolicy: row.replay_policy,
  attempt: Number(row.attempt),
  ...(row.result_json === null ? {} : { result: decodeJsonValue(row.result_json) }),
  ...(row.error_json === null ? {} : { error: decodeJsonValue(row.error_json) }),
  ...(row.resolution_idempotency_key === null ? {} : { resolutionIdempotencyKey: row.resolution_idempotency_key }),
  ...(row.resolution_json === null ? {} : { resolution: decodeJson(OperationResolution, row.resolution_json) }),
})

export const canBlindRetry = (policy: ReplayPolicy): boolean => policy === "pure" || policy === "provider-idempotent"
