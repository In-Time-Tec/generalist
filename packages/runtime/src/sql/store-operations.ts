import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { RecordOperationInput } from "../run-store.js"
import { encodeJson } from "./codecs.js"
import { canBlindRetry } from "./operations.js"
import type { OperationRow } from "./rows.js"
import { appendEvent, loadRun, nowIso, toOperationRecord } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"

const nextId = (prefix: string): Effect.Effect<string> =>
  Effect.sync(() => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`)

const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((run) => (run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run))),
  )

export const recordOperation = (input: RecordOperationInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    const existing = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations
      WHERE run_id = ${input.runId} AND operation_key = ${input.operationKey}
    `
    const prior = existing[0]
    if (prior !== undefined) return toOperationRecord(prior)
    const operationId = yield* nextId("op")
    yield* sql`
      INSERT INTO baton_run_operations (
        run_id, operation_id, operation_key, kind, status, input_digest, input_json,
        result_json, error_json, replay_policy, attempt, started_at, finished_at
      ) VALUES (
        ${input.runId}, ${operationId}, ${input.operationKey}, ${input.kind}, 'requested',
        ${input.inputDigest}, ${encodeJson(input.input)}, NULL, NULL, ${input.replayPolicy},
        ${input.attempt}, NULL, NULL
      )
    `
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${operationId}
    `
    return toOperationRecord(rows[0]!)
  })

export const startOperation = (input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    const started = yield* nowIso
    yield* sql`
      UPDATE baton_run_operations
      SET status = 'running', started_at = ${started}
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'requested'
    `
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return toOperationRecord(row)
  })

export const succeedOperation = (input: {
  readonly runId: string
  readonly operationId: string
  readonly result: unknown
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireRun(input.runId)
    const finished = yield* nowIso
    yield* sql`
      UPDATE baton_run_operations
      SET status = 'succeeded', result_json = ${encodeJson(input.result)}, finished_at = ${finished}
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
        AND status IN ('requested', 'running')
    `
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return toOperationRecord(row)
  })

export const failOperation = (input: {
  readonly runId: string
  readonly operationId: string
  readonly error: unknown
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireRun(input.runId)
    const finished = yield* nowIso
    yield* sql`
      UPDATE baton_run_operations
      SET status = 'failed', error_json = ${encodeJson(input.error)}, finished_at = ${finished}
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
        AND status IN ('requested', 'running')
    `
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return toOperationRecord(row)
  })

export const expireRunningOperation = (
  hub: EventHub,
  input: { readonly runId: string; readonly operationId: string },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (row.status !== "running") {
      return { record: toOperationRecord(row), outcome: row.status }
    }
    if (canBlindRetry(row.replay_policy)) {
      yield* sql`
        UPDATE baton_run_operations
        SET status = 'requested', started_at = NULL, finished_at = NULL
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'running'
      `
      const next = yield* sql<OperationRow>`
        SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
      `
      return { record: toOperationRecord(next[0]!), outcome: "retried" as const }
    }
    const finished = yield* nowIso
    yield* sql`
      UPDATE baton_run_operations SET status = 'unknown', finished_at = ${finished}
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'running'
    `
    yield* appendEvent(hub, run, { _tag: "OperationUnknown", operationId: input.operationId }, "needs-resolution")
    const next = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    return { record: toOperationRecord(next[0]!), outcome: "unknown" as const }
  })

export const getOperation = (input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireRun(input.runId)
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return toOperationRecord(row)
  })

export const getOperationByKey = (input: { readonly runId: string; readonly operationKey: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireRun(input.runId)
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_key = ${input.operationKey}
    `
    return rows[0] === undefined ? undefined : toOperationRecord(rows[0])
  })
