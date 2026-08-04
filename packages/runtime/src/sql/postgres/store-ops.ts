import { Effect } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { isTerminal } from "../../run.js"
import type { Interface as RunStoreInterface } from "../../run-store.js"
import { encodeJson } from "../codecs.js"
import { canBlindRetry } from "../operations.js"
import type { DecodedRun, OperationRow } from "../rows.js"
import type { EventHub } from "../subscribers.js"
import { appendEvent, toOperationRecord } from "./pg-helpers.js"

type SqlR = SqlClient.SqlClient | PgClient.PgClient
type RunFn = <A, E>(
  effect: Effect.Effect<A, E, SqlR>,
) => Effect.Effect<A, Exclude<E, { readonly _tag: "SqlError" }> | RuntimeUnavailable>

export const postgresOperations = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: RunFn
  readonly runNoTxn: RunFn
  readonly requireRun: (runId: string) => Effect.Effect<DecodedRun, RunNotFound | SqlError, SqlR>
  readonly requireClaim: (
    claim: import("../../run-store.js").ExecutionClaim,
  ) => Effect.Effect<void, import("../errors.js").StaleClaim | RunNotFound | SqlError, SqlR>
  readonly nextId: (prefix: string) => Effect.Effect<string>
}): Pick<
  RunStoreInterface,
  | "markOperationUnknown"
  | "recordOperation"
  | "startOperation"
  | "succeedOperation"
  | "failOperation"
  | "expireRunningOperation"
  | "getOperation"
  | "getOperationByKey"
> => {
  const { sql, hub, run, runNoTxn, requireRun, requireClaim, nextId } = input
  return {
    markOperationUnknown: (op) =>
      run(
        Effect.gen(function* () {
          yield* requireClaim(op)
          const loaded = yield* requireRun(op.runId)
          if (isTerminal(loaded.status)) {
            return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
          }
          yield* sql`
            UPDATE baton_run_operations SET status = 'unknown', finished_at = NOW()
            WHERE run_id = ${loaded.runId} AND operation_id = ${op.operationId}
          `
          yield* appendEvent(hub, loaded, { _tag: "OperationUnknown", operationId: op.operationId }, "needs-resolution")
        }),
      ),
    recordOperation: (op) =>
      run(
        Effect.gen(function* () {
          yield* requireClaim(op)
          const loaded = yield* requireRun(op.runId)
          if (isTerminal(loaded.status)) {
            return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
          }
          const existing = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations
            WHERE run_id = ${op.runId} AND operation_key = ${op.operationKey}
          `
          const prior = existing[0]
          if (prior !== undefined) return toOperationRecord(prior)
          const operationId = yield* nextId("op")
          yield* sql`
            INSERT INTO baton_run_operations (
              run_id, operation_id, operation_key, kind, status, input_digest, input_json,
              result_json, error_json, replay_policy, attempt, owner_worker_id, lease_expires_at, started_at, finished_at
            ) VALUES (
              ${op.runId}, ${operationId}, ${op.operationKey}, ${op.kind}, 'requested',
              ${op.inputDigest}, ${encodeJson(op.input)}, NULL, NULL, ${op.replayPolicy},
              ${op.attempt}, NULL, NULL, NULL, NULL
            )
          `
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${operationId}
          `
          return toOperationRecord(rows[0]!)
        }),
      ),
    startOperation: (op) =>
      run(
        Effect.gen(function* () {
          yield* requireClaim(op)
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
    succeedOperation: (op) =>
      run(
        Effect.gen(function* () {
          yield* requireClaim(op)
          yield* requireRun(op.runId)
          yield* sql`
            UPDATE baton_run_operations
            SET status = 'succeeded', result_json = ${encodeJson(op.result)}, finished_at = NOW()
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
              AND status IN ('requested', 'running')
          `
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          return toOperationRecord(rows[0]!)
        }),
      ),
    failOperation: (op) =>
      run(
        Effect.gen(function* () {
          yield* requireClaim(op)
          yield* requireRun(op.runId)
          yield* sql`
            UPDATE baton_run_operations
            SET status = 'failed', error_json = ${encodeJson(op.error)}, finished_at = NOW()
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
              AND status IN ('requested', 'running')
          `
          const rows = yield* sql<OperationRow>`
            SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          return toOperationRecord(rows[0]!)
        }),
      ),
    expireRunningOperation: (op) =>
      run(
        Effect.gen(function* () {
          yield* requireClaim(op)
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
  }
}
