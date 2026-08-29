import { Effect } from "effect"
import { checkpointRef } from "../../executable/manifest.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../../execution/state.js"
import { RuntimeUnavailable } from "../../errors.js"
import { PendingRunOutcome } from "../../run/store.js"
import { decodeContinuation } from "../../run/steering.js"
import { decodeJson, decodeMessage, decodePinnedExecutable } from "../codec/codecs.js"
import type { DecodedRun, RunRow } from "../codec/rows.js"

const asBool = (value: number | boolean | string): boolean => value === true || value === "true" || Number(value) === 1

const asIso = (value: string | Date | null | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined
  return value instanceof Date ? value.toISOString() : value
}

const assignRunOptionals = (result: DecodedRun, row: RunRow, checkpoint: ExecutionCheckpoint | undefined): void => {
  Object.assign(result, row.parent_run_id === null ? {} : { parentRunId: row.parent_run_id })
  Object.assign(result, row.invocation_id === null ? {} : { invocationId: row.invocation_id })
  Object.assign(result, row.cancel_reason === null ? {} : { cancelReason: row.cancel_reason })
  Object.assign(result, row.terminal_event_id === null ? {} : { terminalEventId: row.terminal_event_id })
  Object.assign(result, row.owner_worker_id == null ? {} : { ownerWorkerId: row.owner_worker_id })
  Object.assign(result, checkpoint === undefined ? {} : { driverCheckpoint: checkpoint })
  Object.assign(
    result,
    row.suspension_json === null ? {} : { suspension: decodeJson(ExecutionSuspension, row.suspension_json) },
  )
  Object.assign(
    result,
    row.continuation_json === null ? {} : { continuation: decodeContinuation(row.continuation_json) },
  )
  Object.assign(
    result,
    row.pending_outcome_json === null
      ? {}
      : { pendingOutcome: decodeJson(PendingRunOutcome, row.pending_outcome_json) },
  )
  const leaseExpiresAt = asIso(row.lease_expires_at)
  Object.assign(result, leaseExpiresAt === undefined ? {} : { leaseExpiresAt })
}

export const decodeRun = (row: RunRow): DecodedRun => {
  const executable = decodePinnedExecutable(row.executable_ref_json, row.executable_manifest_json)
  const checkpoint =
    row.driver_checkpoint_json === null || row.driver_checkpoint_json === undefined
      ? undefined
      : decodeJson(ExecutionCheckpoint, row.driver_checkpoint_json)
  const checkpointExecutable = checkpointRef(executable.ref, executable.manifest, checkpoint)
  if (
    checkpointExecutable.executable !== executable.ref.executable ||
    checkpointExecutable.active !== executable.ref.active
  ) {
    throw new TypeError("Persisted checkpoint executable does not match Run executable")
  }
  const admittedAt = asIso(row.created_at)
  if (admittedAt === undefined) throw new TypeError("Persisted Run is missing its admission time")
  const result: DecodedRun = {
    runId: row.run_id,
    status: row.status,
    address: row.address,
    sessionId: row.session_id,
    message: decodeMessage(row.message_json),
    messageDigest: row.message_digest,
    executableRef: executable.ref,
    executableManifest: executable.manifest,
    rootRunId: row.root_run_id,
    depth: row.depth,
    treePolicy: { maxDepth: row.max_depth, maxSubagents: row.max_subagents },
    admittedAt,
    attempt: row.attempt,
    attemptFence: row.attempt_fence,
    lastSequence: row.last_sequence,
    cancellationRequested: asBool(row.cancellation_requested),
    acceptedSequence: row.accepted_sequence,
  }
  assignRunOptionals(result, row, checkpoint)
  return result
}

export const decodeRunEffect = (row: RunRow): Effect.Effect<DecodedRun, RuntimeUnavailable> =>
  Effect.try({
    try: () => decodeRun(row),
    catch: (error) => RuntimeUnavailable.make({ message: `invalid persisted Run ${row.run_id}: ${String(error)}` }),
  })

export const isoFromSql = asIso
