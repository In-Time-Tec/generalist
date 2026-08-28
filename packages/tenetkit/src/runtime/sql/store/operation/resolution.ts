import { Effect, Function, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { OperationResolutionConflict, RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import {
  OperationResolution,
  ResolveOperationInput,
  digest as resolutionDigest,
} from "../../../operation/resolution.js"
import { decodeJson, encodeJsonValue } from "../../codec/codecs.js"
import type { OperationRow } from "../../codec/rows.js"
import { loadRun, nowIso } from "../statements.js"

type ResolveOperationEffect = Effect.Effect<
  undefined,
  OperationResolutionConflict | RunNotFound | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>

const resolvedRunStatus = (
  sql: SqlClient.SqlClient,
  unresolved: number,
  claimableStatus: "queued" | "running" | undefined,
) => {
  if (unresolved > 0) return sql`'needs-resolution'`
  const cancellationRequested = sql.onDialectOrElse({
    pg: () => sql`cancellation_requested`,
    mysql: () => sql`cancellation_requested = 1`,
    orElse: () => sql`cancellation_requested IN (1, 'true')`,
  })
  return sql`CASE WHEN ${cancellationRequested} THEN 'cancelling' ELSE ${claimableStatus} END`
}

/** @experimental Resolve one unknown operation without making its Run claimable while another remains unknown. */
export const resolveOperation: {
  (
    claimableStatus?: "queued" | "running",
    clearLease?: boolean,
  ): (input: ResolveOperationInput) => ResolveOperationEffect
  (input: ResolveOperationInput, claimableStatus?: "queued" | "running", clearLease?: boolean): ResolveOperationEffect
} = Function.dual(
  (args) => Schema.is(ResolveOperationInput)(args[0]),
  (input: ResolveOperationInput, claimableStatus?: "queued" | "running", clearLease = false) =>
    resolveOperationEffect(input, claimableStatus, clearLease === true),
)

const resolveOperationEffect = (
  input: ResolveOperationInput,
  claimableStatus: "queued" | "running" | undefined,
  clearLease: boolean,
): ResolveOperationEffect =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const rows = yield* sql<OperationRow>`
      SELECT * FROM tenetkit_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    const resolutionJson = encodeJsonValue(input.resolution)
    const conflict = () =>
      OperationResolutionConflict.make({
        runId: input.runId,
        operationId: input.operationId,
        idempotencyKey: input.idempotencyKey,
      })
    if (row === undefined) return yield* conflict()
    if (row.resolution_idempotency_key !== null) {
      const priorResolution =
        row.resolution_json === null ? undefined : decodeJson(OperationResolution, row.resolution_json)
      if (
        row.resolution_idempotency_key === input.idempotencyKey &&
        priorResolution !== undefined &&
        resolutionDigest(priorResolution) === resolutionDigest(input.resolution)
      )
        return
      return yield* conflict()
    }
    if (run.status !== "needs-resolution" || row.status !== "unknown") return yield* conflict()
    const finished = yield* nowIso
    if (input.resolution._tag === "Succeeded") {
      yield* sql`
        UPDATE tenetkit_run_operations SET status = 'succeeded', result_json = ${encodeJsonValue(input.resolution.value)},
          resolution_idempotency_key = ${input.idempotencyKey}, resolution_json = ${resolutionJson}, finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'unknown'
      `
    } else if (input.resolution._tag === "Failed") {
      yield* sql`
        UPDATE tenetkit_run_operations SET status = 'failed', error_json = ${encodeJsonValue(input.resolution.error)},
          resolution_idempotency_key = ${input.idempotencyKey}, resolution_json = ${resolutionJson}, finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'unknown'
      `
    } else {
      yield* sql`
        UPDATE tenetkit_run_operations SET status = 'requested', result_json = NULL, error_json = NULL,
          resolution_idempotency_key = ${input.idempotencyKey}, resolution_json = ${resolutionJson},
          started_at = NULL, finished_at = NULL
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'unknown'
      `
    }
    const unresolved = yield* sql<{ readonly unresolved: number }>`
      SELECT COUNT(*) AS unresolved FROM tenetkit_run_operations
      WHERE run_id = ${input.runId} AND status = 'unknown'
    `
    const runStatus = resolvedRunStatus(sql, unresolved[0]?.unresolved ?? 0, claimableStatus)
    if (clearLease) {
      yield* sql`
        UPDATE tenetkit_runs SET status = ${runStatus}, owner_worker_id = NULL, lease_expires_at = NULL,
          updated_at = ${finished}
        WHERE run_id = ${input.runId} AND status = 'needs-resolution'
      `
    } else {
      yield* sql`
        UPDATE tenetkit_runs SET status = ${runStatus}, owner_worker_id = NULL, updated_at = ${finished}
        WHERE run_id = ${input.runId} AND status = 'needs-resolution'
      `
    }
  })
