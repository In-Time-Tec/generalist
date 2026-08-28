import { Effect, Schema } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  OperationResolutionConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "tenetkit/runtime/driver/errors"
import { OperationResolution, digest as resolutionDigest } from "tenetkit/runtime/driver/operation/resolution"
import { isTerminal } from "tenetkit/runtime/driver/run"
import { ExecutionCheckpoint } from "tenetkit/runtime/driver/execution/state"
import type { Interface as RunStoreInterface } from "tenetkit/runtime/driver/run/store"
import { decodeJson, encodeExecutableRef, encodeJson, encodeJsonValue } from "tenetkit/runtime/driver/sql/codec/codecs"
import { canBlindRetry } from "tenetkit/runtime/driver/sql/operations"
import type { DecodedRun, OperationRow } from "tenetkit/runtime/driver/sql/codec/rows"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { appendEvent, toOperationRecord } from "./runtime.js"
import { encodeContinuation } from "tenetkit/runtime/driver/run/steering"
import { checkpointRef } from "tenetkit/runtime/driver/executable/manifest"
import { getProgramOperation, resolveProgramOperation } from "tenetkit/runtime/driver/sql/store/program"
import { settleAdmittedCancellation } from "tenetkit/runtime/driver/sql/store/control"
import {
  acknowledgeOperationCancellation,
  operationCancellations,
} from "tenetkit/runtime/driver/sql/store/operation/operations"
import { postgresModelResponseOperations } from "./model-response.js"
import type { WithoutSqlError } from "tenetkit/runtime/driver/sql/effect"
import { appendHandoffSessionEntry, verifyHandoffSessionEntry } from "../sessions/session-store.js"
import {
  handoffSessionEntry,
  isHandoffCommit,
  sameHandoffCheckpoint,
  sameHandoffCommit,
} from "tenetkit/runtime/driver/session/handoff"
import { lockRunHierarchy } from "../runs/locks.js"

type SqlR = SqlClient.SqlClient | PgClient.PgClient
const isCompletedOperationStatus = (status: OperationRow["status"]): boolean =>
  status === "cancelling" ||
  status === "cancelled" ||
  status === "succeeded" ||
  status === "failed" ||
  status === "unknown"

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
    claim: import("tenetkit/runtime/driver/run/store").ExecutionClaim,
  ) => Effect.Effect<
    void,
    import("tenetkit/runtime/driver/sql/errors").StaleClaim | RunNotFound | RuntimeUnavailable | SqlError,
    SqlR
  >
  readonly nextId: (prefix: string) => Effect.Effect<string>
}): Pick<
  RunStoreInterface,
  | "recordOperation"
  | "startOperation"
  | "completeOperation"
  | "commitModelResponse"
  | "commitInterruptedModelResponse"
  | "expireRunningOperation"
  | "recoverRunningOperations"
  | "getOperation"
  | "getOperationByKey"
  | "operationCancellations"
  | "acknowledgeOperationCancellation"
  | "resolveOperation"
> => {
  const { sql, hub, run, runNoTxn, requireRun, requireClaim, nextId } = input
  const fenced = <A, E>(
    claim: import("tenetkit/runtime/driver/run/store").ExecutionClaim,
    effect: Effect.Effect<A, E, SqlR>,
  ) =>
    run(
      sql`SELECT run_id FROM tenetkit_runs WHERE run_id = ${claim.runId} FOR UPDATE`.pipe(
        Effect.andThen(requireClaim(claim)),
        Effect.andThen(effect),
      ),
    )
  const expire = (op: { readonly runId: string; readonly operationId: string }) =>
    Effect.gen(function* () {
      const loaded = yield* requireRun(op.runId)
      const rows = yield* sql<OperationRow>`
        SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
      `
      const row = rows[0]
      if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
      if (row.status !== "running") {
        return { record: toOperationRecord(row), outcome: row.status }
      }
      if (canBlindRetry(row.replay_policy)) {
        yield* sql`
          UPDATE tenetkit_run_operations
          SET status = 'requested', started_at = NULL, finished_at = NULL, owner_worker_id = NULL, lease_expires_at = NULL
          WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'running'
        `
        const next = yield* sql<OperationRow>`
          SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
        `
        return { record: toOperationRecord(next[0]!), outcome: "retried" as const }
      }
      yield* sql`
        UPDATE tenetkit_run_operations SET status = 'unknown', finished_at = NOW()
        WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'running'
      `
      yield* appendEvent(
        hub,
        loaded,
        { _tag: "OperationUnknown", operationId: op.operationId },
        loaded.cancellationRequested ? "cancelling" : "needs-resolution",
      )
      const next = yield* sql<OperationRow>`
        SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
      `
      return { record: toOperationRecord(next[0]!), outcome: "unknown" as const }
    })
  const existingOperation = (op: Parameters<RunStoreInterface["recordOperation"]>[0], prior: OperationRow) =>
    Effect.gen(function* () {
      const consumed = yield* sql<{ readonly entry_id: string }>`
        SELECT entry_id FROM tenetkit_run_steering
        WHERE run_id = ${op.runId} AND consumed_operation_id = ${prior.operation_id}
        ORDER BY sequence
      `
      const retried = op.steeringEntryIds ?? []
      if (consumed.length !== retried.length || consumed.some((entry, index) => entry.entry_id !== retried[index])) {
        return yield* RuntimeUnavailable.make({ message: "steering consumption does not match operation" })
      }
      return toOperationRecord(prior)
    })
  const verifyPendingSteering = (op: Parameters<RunStoreInterface["recordOperation"]>[0]) =>
    Effect.gen(function* () {
      const steeringEntryIds = op.steeringEntryIds ?? []
      const pending = yield* sql<{ readonly entry_id: string }>`
        SELECT entry_id FROM tenetkit_run_steering
        WHERE run_id = ${op.runId} AND consumed_operation_id IS NULL AND discarded_reason IS NULL
        ORDER BY sequence
      `
      const selected = pending.slice(0, steeringEntryIds.length)
      if (
        selected.length !== steeringEntryIds.length ||
        selected.some((entry, index) => entry.entry_id !== steeringEntryIds[index])
      ) {
        return yield* RuntimeUnavailable.make({ message: "steering entries are not the pending prefix" })
      }
      return steeringEntryIds
    })
  const verifyCompletedOperation = (
    op: Parameters<RunStoreInterface["completeOperation"]>[0],
    loaded: DecodedRun,
    row: OperationRow,
  ) =>
    Effect.gen(function* () {
      const current = toOperationRecord(row)
      if (current.kind === "handoff" && current.status === "succeeded" && isHandoffCommit(current.result)) {
        if (
          op.outcome._tag !== "Succeeded" ||
          !sameHandoffCommit(current.result, op.outcome.value) ||
          !sameHandoffCheckpoint(loaded.driverCheckpoint, op.checkpoint)
        ) {
          return yield* RuntimeUnavailable.make({ message: "handoff operation has a divergent completion retry" })
        }
        const entry = handoffSessionEntry({
          sessionId: loaded.message.sessionId,
          operationKey: current.operationKey,
          value: op.outcome.value,
        })
        if (Schema.is(RuntimeUnavailable)(entry)) return yield* entry
        yield* verifyHandoffSessionEntry(entry).pipe(
          Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
        )
      }
      return current
    })
  const verifyOperationSteering = (op: Parameters<RunStoreInterface["completeOperation"]>[0]) =>
    Effect.gen(function* () {
      for (const entryId of new Set(op.steeringEntryIds ?? [])) {
        const rows = yield* sql<{ readonly consumed_operation_id: string | null }>`
          SELECT consumed_operation_id FROM tenetkit_run_steering
          WHERE run_id = ${op.runId} AND entry_id = ${entryId}
        `
        if (rows[0]?.consumed_operation_id !== op.operationId) {
          return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} does not belong to operation` })
        }
      }
    })
  const persistOperationOutcome = (op: Parameters<RunStoreInterface["completeOperation"]>[0]) => {
    if (op.outcome._tag === "Succeeded") {
      return sql`
        UPDATE tenetkit_run_operations
        SET status = 'succeeded', result_json = ${encodeJsonValue(op.outcome.value)}, finished_at = NOW()
        WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status IN ('requested', 'running')
      `
    }
    if (op.outcome._tag === "Failed") {
      return sql`
        UPDATE tenetkit_run_operations
        SET status = 'failed', error_json = ${encodeJsonValue(op.outcome.error)}, finished_at = NOW()
        WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status IN ('requested', 'running')
      `
    }
    return sql`
      UPDATE tenetkit_run_operations SET status = 'unknown', finished_at = NOW()
      WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status IN ('requested', 'running')
    `
  }
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
            SELECT * FROM tenetkit_run_operations
            WHERE run_id = ${op.runId} AND operation_key = ${op.operationKey}
          `
          const prior = existing[0]
          if (prior !== undefined) return yield* existingOperation(op, prior)
          if (loaded.cancellationRequested) {
            return yield* RuntimeUnavailable.make({ message: `run ${loaded.runId} is cancelling` })
          }
          const steeringEntryIds = yield* verifyPendingSteering(op)
          const operationId = yield* nextId("op")
          const executableRef = yield* Effect.try({
            try: () => checkpointRef(loaded.executableRef, loaded.executableManifest, op.checkpoint),
            catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
          })
          yield* sql`
            INSERT INTO tenetkit_run_operations (
              run_id, operation_id, operation_key, kind, status, input_digest, input_json,
              result_json, error_json, replay_policy, attempt, owner_worker_id, lease_expires_at, started_at, finished_at
            ) VALUES (
              ${op.runId}, ${operationId}, ${op.operationKey}, ${op.kind}, 'requested',
              ${op.inputDigest}, ${encodeJsonValue(op.input)}, NULL, NULL, ${op.replayPolicy},
              ${op.attempt}, NULL, NULL, NULL, NULL
            )
          `
          if (op.checkpoint !== undefined || op.continuation !== undefined) {
            yield* sql`
              UPDATE tenetkit_runs SET
                driver_checkpoint_json = COALESCE(${op.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, op.checkpoint)}, driver_checkpoint_json),
                executable_ref_json = ${encodeExecutableRef(executableRef)},
                continuation_json = CASE WHEN ${op.continuation === undefined ? 0 : 1} = 1
                  THEN ${op.continuation === null || op.continuation === undefined ? null : encodeContinuation(op.continuation)}
                  ELSE continuation_json END
              WHERE run_id = ${op.runId}
            `
          }
          for (const entryId of steeringEntryIds) {
            yield* sql`
              UPDATE tenetkit_run_steering SET consumed_operation_id = ${operationId}
              WHERE run_id = ${op.runId} AND entry_id = ${entryId}
                AND consumed_operation_id IS NULL AND discarded_reason IS NULL
            `
          }
          if (steeringEntryIds.length > 0) {
            yield* appendEvent(hub, yield* requireRun(op.runId), {
              _tag: "SteeringConsumed",
              entryIds: steeringEntryIds,
              operationId,
            })
          }
          for (const event of op.steeringEvents ?? []) {
            yield* appendEvent(hub, yield* requireRun(op.runId), event)
          }
          const rows = yield* sql<OperationRow>`
            SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${operationId}
          `
          return toOperationRecord(rows[0]!)
        }),
      ),
    startOperation: (op) =>
      fenced(
        op,
        Effect.gen(function* () {
          const loaded = yield* requireRun(op.runId)
          if (loaded.cancellationRequested) {
            return yield* RuntimeUnavailable.make({ message: `run ${loaded.runId} is cancelling` })
          }
          yield* sql`
            UPDATE tenetkit_run_operations
            SET status = 'running', started_at = NOW()
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'requested'
          `
          const rows = yield* sql<OperationRow>`
            SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
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
            SELECT * FROM tenetkit_run_operations
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
            FOR UPDATE
          `
          const row = existing[0]
          if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
          if (isCompletedOperationStatus(row.status)) {
            return yield* verifyCompletedOperation(op, loaded, row)
          }
          yield* verifyOperationSteering(op)
          const executableRef = yield* Effect.try({
            try: () => checkpointRef(loaded.executableRef, loaded.executableManifest, op.checkpoint),
            catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
          })
          if (row.kind === "handoff" && op.outcome._tag === "Succeeded" && isHandoffCommit(op.outcome.value)) {
            const entry = handoffSessionEntry({
              sessionId: loaded.message.sessionId,
              operationKey: row.operation_key,
              value: op.outcome.value,
            })
            if (Schema.is(RuntimeUnavailable)(entry)) return yield* entry
            yield* appendHandoffSessionEntry(entry).pipe(
              Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
            )
          }
          yield* persistOperationOutcome(op)
          yield* sql`
            UPDATE tenetkit_runs SET
              driver_checkpoint_json = COALESCE(${op.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, op.checkpoint)}, driver_checkpoint_json),
              executable_ref_json = ${encodeExecutableRef(executableRef)},
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
              loaded.cancellationRequested ? "cancelling" : "needs-resolution",
            )
          }
          const rows = yield* sql<OperationRow>`
            SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          return toOperationRecord(rows[0]!)
        }),
      ),
    ...postgresModelResponseOperations(input),
    expireRunningOperation: (op) => fenced(op, expire(op)),
    recoverRunningOperations: (claim) =>
      fenced(
        claim,
        Effect.gen(function* () {
          const operations = yield* sql<{ readonly operation_id: string }>`
            SELECT operation_id FROM tenetkit_run_operations
            WHERE run_id = ${claim.runId} AND status = 'running'
            ORDER BY operation_id
          `
          for (const operation of operations) {
            yield* expire({ runId: claim.runId, operationId: operation.operation_id })
          }
          const loaded = yield* requireRun(claim.runId)
          return loaded.status === "needs-resolution" ? "blocked" : "ready"
        }),
      ),
    getOperation: (op) =>
      runNoTxn(
        Effect.gen(function* () {
          yield* requireRun(op.runId)
          const rows = yield* sql<OperationRow>`
            SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
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
            SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_key = ${op.operationKey}
          `
          return rows[0] === undefined ? undefined : toOperationRecord(rows[0])
        }),
      ),
    operationCancellations: (claim) => fenced(claim, operationCancellations(claim)),
    acknowledgeOperationCancellation: (op) => fenced(op, acknowledgeOperationCancellation(op)),
    resolveOperation: (op) =>
      run(
        Effect.gen(function* () {
          yield* lockRunHierarchy(op.runId)
          const loaded = yield* requireRun(op.runId)
          const program = yield* getProgramOperation({ runId: op.runId, operation: op.operationId })
          if (program !== undefined) {
            yield* resolveProgramOperation(op, "queued", true)
            yield* settleAdmittedCancellation(hub, op.runId)
            return
          }
          const rows = yield* sql<OperationRow>`
            SELECT * FROM tenetkit_run_operations
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
              UPDATE tenetkit_run_operations SET status = 'succeeded', result_json = ${encodeJsonValue(op.resolution.value)},
                resolution_idempotency_key = ${op.idempotencyKey}, resolution_json = ${resolutionJson},
                owner_worker_id = NULL, lease_expires_at = NULL, finished_at = NOW()
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'unknown'
            `
          } else if (op.resolution._tag === "Failed") {
            yield* sql`
              UPDATE tenetkit_run_operations SET status = 'failed', error_json = ${encodeJsonValue(op.resolution.error)},
                resolution_idempotency_key = ${op.idempotencyKey}, resolution_json = ${resolutionJson},
                owner_worker_id = NULL, lease_expires_at = NULL, finished_at = NOW()
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'unknown'
            `
          } else {
            yield* sql`
              UPDATE tenetkit_run_operations SET status = 'requested', result_json = NULL, error_json = NULL,
                resolution_idempotency_key = ${op.idempotencyKey}, resolution_json = ${resolutionJson},
                owner_worker_id = NULL, lease_expires_at = NULL, started_at = NULL, finished_at = NULL
              WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'unknown'
            `
          }
          const unresolved = yield* sql<{ readonly unresolved: number }>`
            SELECT COUNT(*)::int AS unresolved FROM tenetkit_run_operations
            WHERE run_id = ${op.runId} AND status = 'unknown'
          `
          const runStatus =
            (unresolved[0]?.unresolved ?? 0) > 0
              ? sql`'needs-resolution'`
              : sql`CASE WHEN cancellation_requested THEN 'cancelling' ELSE 'queued' END`
          yield* sql`
            UPDATE tenetkit_runs SET status = ${runStatus}, owner_worker_id = NULL, lease_expires_at = NULL, updated_at = NOW()
            WHERE run_id = ${op.runId} AND status = 'needs-resolution'
          `
          yield* settleAdmittedCancellation(hub, op.runId)
        }),
      ),
  }
}
