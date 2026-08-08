import { Effect } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { OperationResolutionConflict, RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { OperationResolution, digest as resolutionDigest } from "../../operation-resolution.js"
import { isTerminal } from "../../run.js"
import { ExecutionCheckpoint } from "../../execution-state.js"
import type { Interface as RunStoreInterface } from "../../run-store.js"
import { decodeJson, encodeExecutableRef, encodeJson, encodeJsonValue } from "../codecs.js"
import { canBlindRetry, toOperationRecord } from "../operations.js"
import type { DecodedRun, OperationRow } from "../rows.js"
import type { EventHub } from "../subscribers.js"
import { appendEvent } from "./pg-helpers.js"
import { encodeContinuation } from "../../steering.js"
import { checkpointRef } from "../../executable-manifest.js"
import { getProgramOperation, resolveProgramOperation } from "../store-program.js"
import { settleAdmittedCancellation } from "../store-control.js"
import { Prompt } from "effect/unstable/ai"
import type { WithoutSqlError } from "../sql-effect.js"

type SqlR = SqlClient.SqlClient | PgClient.PgClient
export type RunFn = <A, E>(
  effect: Effect.Effect<A, E | SqlError, SqlR>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | RuntimeUnavailable>

export const postgresOperations = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: RunFn
  readonly runNoTxn: RunFn
  readonly requireRun: (runId: string) => Effect.Effect<DecodedRun, RunNotFound | RuntimeUnavailable | SqlError, SqlR>
  readonly requireClaim: (
    claim: import("../../run-store.js").ExecutionClaim,
  ) => Effect.Effect<void, import("../errors.js").StaleClaim | RunNotFound | RuntimeUnavailable | SqlError, SqlR>
  readonly nextId: (prefix: string) => Effect.Effect<string>
}): Pick<
  RunStoreInterface,
  | "recordOperation"
  | "startOperation"
  | "completeOperation"
  | "expireRunningOperation"
  | "getOperation"
  | "getOperationByKey"
  | "resolveOperation"
> => {
  const { sql, hub, run, runNoTxn, requireRun, requireClaim, nextId } = input
  const fenced = <A, E>(claim: import("../../run-store.js").ExecutionClaim, effect: Effect.Effect<A, E, SqlR>) =>
    run(
      sql`SELECT run_id FROM baton_runs WHERE run_id = ${claim.runId} FOR UPDATE`.pipe(
        Effect.andThen(requireClaim(claim)),
        Effect.andThen(effect),
      ),
    )
  return {
    recordOperation: (op) =>
      fenced(
        op,
        Effect.gen(function* () {
          const loaded = yield* requireRun(op.runId)
          if (isTerminal(loaded.status)) {
            return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
          }
          const existing = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations
            WHERE run_id = ${op.runId} AND operation_key = ${op.operationKey}
          `
          const prior = existing[0]
          if (prior !== undefined) {
            for (const entryId of new Set(op.steeringEntryIds ?? [])) {
              const rows = yield* sql<{ readonly consumed_operation_id: string | null }>`
                SELECT consumed_operation_id FROM baton_run_steering
                WHERE run_id = ${op.runId} AND entry_id = ${entryId}
              `
              if (rows[0]?.consumed_operation_id !== prior.operation_id) {
                return yield* RuntimeUnavailable.make({
                  message: `steering entry ${entryId} does not belong to operation`,
                })
              }
            }
            return toOperationRecord(prior)
          }
          for (const entryId of new Set(op.steeringEntryIds ?? [])) {
            const rows = yield* sql<{ readonly consumed_operation_id: string | null }>`
              SELECT consumed_operation_id FROM baton_run_steering
              WHERE run_id = ${op.runId} AND entry_id = ${entryId}
            `
            if (rows[0] === undefined || rows[0].consumed_operation_id !== null) {
              return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} is not pending` })
            }
          }
          const operationId = yield* nextId("op")
          const executableRef = yield* Effect.try({
            try: () => checkpointRef(loaded.executableRef, loaded.executableManifest, op.checkpoint),
            catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
          })
          yield* sql`
            INSERT INTO baton_run_operations (
              run_id, operation_id, operation_key, kind, status, input_digest, input_json,
              result_json, error_json, replay_policy, attempt, owner_worker_id, lease_expires_at, started_at, finished_at
            ) VALUES (
              ${op.runId}, ${operationId}, ${op.operationKey}, ${op.kind}, 'requested',
              ${op.inputDigest}, ${encodeJsonValue(op.input)}, NULL, NULL, ${op.replayPolicy},
              ${op.attempt}, NULL, NULL, NULL, NULL
            )
          `
          if (op.checkpoint !== undefined || op.transcript !== undefined || op.continuation !== undefined) {
            yield* sql`
              UPDATE baton_runs SET
                driver_checkpoint_json = COALESCE(${op.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, op.checkpoint)}, driver_checkpoint_json),
                executable_ref_json = ${encodeExecutableRef(executableRef)},
                transcript_json = COALESCE(${op.transcript === undefined ? null : encodeJson(Prompt.Prompt, op.transcript)}, transcript_json),
                continuation_json = CASE WHEN ${op.continuation === undefined ? 0 : 1} = 1
                  THEN ${op.continuation === null || op.continuation === undefined ? null : encodeContinuation(op.continuation)}
                  ELSE continuation_json END
              WHERE run_id = ${op.runId}
            `
          }
          for (const entryId of op.steeringEntryIds ?? []) {
            yield* sql`
              UPDATE baton_run_steering SET consumed_operation_id = ${operationId}
              WHERE run_id = ${op.runId} AND entry_id = ${entryId} AND consumed_operation_id IS NULL
            `
          }
          for (const event of op.steeringEvents ?? []) {
            yield* appendEvent(
              hub,
              yield* requireRun(op.runId),
              event as { readonly _tag: string } & Record<string, unknown>,
            )
          }
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${operationId}
          `
          return toOperationRecord(rows[0]!)
        }),
      ),
    startOperation: (op) =>
      fenced(
        op,
        Effect.gen(function* () {
          yield* requireRun(op.runId)
          yield* sql`
            UPDATE baton_run_operations
            SET status = 'running', started_at = NOW()
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'requested'
          `
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          const row = rows[0]
          if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
          return toOperationRecord(row)
        }),
      ),
    completeOperation: (op) =>
      fenced(
        op,
        Effect.gen(function* () {
          const loaded = yield* requireRun(op.runId)
          const existing = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          if (existing[0] === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
          if (
            existing[0].status === "succeeded" ||
            existing[0].status === "failed" ||
            existing[0].status === "unknown"
          ) {
            return toOperationRecord(existing[0])
          }
          for (const entryId of new Set(op.steeringEntryIds ?? [])) {
            const rows = yield* sql<{ readonly consumed_operation_id: string | null }>`
              SELECT consumed_operation_id FROM baton_run_steering
              WHERE run_id = ${op.runId} AND entry_id = ${entryId}
            `
            if (rows[0]?.consumed_operation_id !== op.operationId) {
              return yield* RuntimeUnavailable.make({
                message: `steering entry ${entryId} does not belong to operation`,
              })
            }
          }
          const executableRef = yield* Effect.try({
            try: () => checkpointRef(loaded.executableRef, loaded.executableManifest, op.checkpoint),
            catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
          })
          if (op.outcome._tag === "Succeeded") {
            yield* sql`
              UPDATE baton_run_operations
              SET status = 'succeeded', result_json = ${encodeJsonValue(op.outcome.value)}, finished_at = NOW()
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
                AND status IN ('requested', 'running')
            `
          } else if (op.outcome._tag === "Failed") {
            yield* sql`
              UPDATE baton_run_operations
              SET status = 'failed', error_json = ${encodeJsonValue(op.outcome.error)}, finished_at = NOW()
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
                AND status IN ('requested', 'running')
            `
          } else {
            yield* sql`
              UPDATE baton_run_operations SET status = 'unknown', finished_at = NOW()
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
                AND status IN ('requested', 'running')
            `
          }
          yield* sql`
            UPDATE baton_runs SET
              driver_checkpoint_json = ${encodeJson(ExecutionCheckpoint, op.checkpoint)},
              executable_ref_json = ${encodeExecutableRef(executableRef)},
              transcript_json = COALESCE(${op.transcript === undefined ? null : encodeJson(Prompt.Prompt, op.transcript)}, transcript_json),
              continuation_json = CASE WHEN ${op.continuation === undefined ? 0 : 1} = 1
                THEN ${op.continuation === null || op.continuation === undefined ? null : encodeContinuation(op.continuation)}
                ELSE continuation_json END,
              updated_at = NOW()
            WHERE run_id = ${op.runId}
          `
          if (op.outcome._tag === "Unknown") {
            yield* appendEvent(
              hub,
              yield* requireRun(op.runId),
              { _tag: "OperationUnknown", operationId: op.operationId },
              "needs-resolution",
            )
          }
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          return toOperationRecord(rows[0]!)
        }),
      ),
    expireRunningOperation: (op) =>
      fenced(
        op,
        Effect.gen(function* () {
          const loaded = yield* requireRun(op.runId)
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          const row = rows[0]
          if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
          if (row.status !== "running") {
            return { record: toOperationRecord(row), outcome: row.status }
          }
          if (canBlindRetry(row.replay_policy)) {
            yield* sql`
              UPDATE baton_run_operations
              SET status = 'requested', started_at = NULL, finished_at = NULL, owner_worker_id = NULL, lease_expires_at = NULL
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'running'
            `
            const next = yield* sql<OperationRow>`
              SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
            `
            return { record: toOperationRecord(next[0]!), outcome: "retried" as const }
          }
          yield* sql`
            UPDATE baton_run_operations SET status = 'unknown', finished_at = NOW()
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'running'
          `
          yield* appendEvent(hub, loaded, { _tag: "OperationUnknown", operationId: op.operationId }, "needs-resolution")
          const next = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          return { record: toOperationRecord(next[0]!), outcome: "unknown" as const }
        }),
      ),
    getOperation: (op) =>
      runNoTxn(
        Effect.gen(function* () {
          yield* requireRun(op.runId)
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          const row = rows[0]
          if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
          return toOperationRecord(row)
        }),
      ),
    getOperationByKey: (op) =>
      runNoTxn(
        Effect.gen(function* () {
          yield* requireRun(op.runId)
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_key = ${op.operationKey}
          `
          return rows[0] === undefined ? undefined : toOperationRecord(rows[0])
        }),
      ),
    resolveOperation: (op) =>
      run(
        Effect.gen(function* () {
          yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${op.runId} FOR UPDATE`
          const loaded = yield* requireRun(op.runId)
          const program = yield* getProgramOperation({ runId: op.runId, operation: op.operationId })
          if (program !== undefined) return yield* resolveProgramOperation(op, "queued", true)
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
            FOR UPDATE
          `
          const row = rows[0]
          const resolutionJson = encodeJsonValue(op.resolution)
          const conflict = () =>
            OperationResolutionConflict.make({
              runId: op.runId,
              operationId: op.operationId,
              idempotencyKey: op.idempotencyKey,
            })
          if (row === undefined) return yield* conflict()
          if (row.resolution_idempotency_key !== null) {
            const priorResolution =
              row.resolution_json === null ? undefined : decodeJson(OperationResolution, row.resolution_json)
            if (
              row.resolution_idempotency_key === op.idempotencyKey &&
              priorResolution !== undefined &&
              resolutionDigest(priorResolution) === resolutionDigest(op.resolution)
            )
              return
            return yield* conflict()
          }
          if (loaded.status !== "needs-resolution" || row.status !== "unknown") return yield* conflict()
          if (op.resolution._tag === "Succeeded") {
            yield* sql`
              UPDATE baton_run_operations SET status = 'succeeded', result_json = ${encodeJsonValue(op.resolution.value)},
                resolution_idempotency_key = ${op.idempotencyKey}, resolution_json = ${resolutionJson},
                owner_worker_id = NULL, lease_expires_at = NULL, finished_at = NOW()
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'unknown'
            `
          } else if (op.resolution._tag === "Failed") {
            yield* sql`
              UPDATE baton_run_operations SET status = 'failed', error_json = ${encodeJsonValue(op.resolution.error)},
                resolution_idempotency_key = ${op.idempotencyKey}, resolution_json = ${resolutionJson},
                owner_worker_id = NULL, lease_expires_at = NULL, finished_at = NOW()
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'unknown'
            `
          } else {
            yield* sql`
              UPDATE baton_run_operations SET status = 'requested', result_json = NULL, error_json = NULL,
                resolution_idempotency_key = ${op.idempotencyKey}, resolution_json = ${resolutionJson},
                owner_worker_id = NULL, lease_expires_at = NULL, started_at = NULL, finished_at = NULL
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'unknown'
            `
          }
          yield* sql`
            UPDATE baton_runs SET status = 'queued', owner_worker_id = NULL, lease_expires_at = NULL, updated_at = NOW()
            WHERE run_id = ${op.runId} AND status = 'needs-resolution'
          `
          yield* settleAdmittedCancellation(hub, op.runId)
        }),
      ),
  }
}
