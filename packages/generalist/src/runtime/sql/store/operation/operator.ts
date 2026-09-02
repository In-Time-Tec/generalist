/* oxlint-disable effecttsgo/missing-pipeable-signature -- these transaction-internal operations are wired in direct style by the SQL RunStore. */
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { digest } from "../../../../core/durable/pin.js"
import { IllegalOperatorAction, RunNotFound } from "../../../errors.js"
import {
  explain,
  type Action,
  ActionRecord,
  type Journal,
  type ResolveUnknownInput,
  type RetryInput,
  type WakeInput,
} from "../../../execution/recovery/operator.js"
import { canBlindRetry } from "../../operations.js"
import type { OperationRow } from "../../codec/rows.js"
import { decodeJson, encodeJsonValue } from "../../codec/codecs.js"
import { loadEventsAfter, loadRun, loadRunWaitsByStatus, nowIso } from "../statements.js"
import { nextOperationId } from "./operations.js"
import { resolveOperation } from "./resolution.js"
import { getProgramOperation, resolveProgramOperation } from "../program.js"
import { revokeRunSessionWriteClaim } from "../../session/claim.js"
import { signal } from "../control.js"
import type { EventHub } from "../../subscribers.js"

interface ProgramOperationRow {
  readonly operation_name: string
  readonly status: Journal["operations"][number]["status"]
  readonly replay_policy: string
}

export const journal = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const operationRows = yield* sql<OperationRow>`
      SELECT * FROM generalist_run_operations
      WHERE run_id = ${runId}
      ORDER BY operation_id
    `
    const programRows = yield* sql<ProgramOperationRow>`
      SELECT operation_name, status, replay_policy FROM generalist_program_operations
      WHERE run_id = ${runId}
      ORDER BY operation_name
    `
    const operations: Array<Journal["operations"][number]> = [
      ...operationRows
        .filter((operation) => operation.kind !== "operator")
        .map((operation) => ({
          operationId: operation.operation_id,
          status: operation.status,
          replay: canBlindRetry(operation.replay_policy) ? ("safe" as const) : ("never" as const),
          attempt: operation.attempt,
        })),
      ...programRows.map((operation) => ({
        operationId: operation.operation_name,
        status: operation.status,
        replay: operation.replay_policy === "idempotent" ? ("safe" as const) : ("never" as const),
        attempt: run.attempt,
      })),
    ]
    const result: Journal = {
      runId,
      status: run.status,
      lastSequence: run.lastSequence,
      waits: yield* loadRunWaitsByStatus(runId, "open"),
      operations,
      actions: operationRows
        .filter((operation) => operation.kind === "operator")
        .map((operation) => ({
          operationId: operation.operation_id,
          ...decodeJson(ActionRecord, operation.input_json),
        })),
    }
    if (run.suspension !== undefined) Object.assign(result, { suspension: run.suspension })
    if (run.status === "failed") {
      const failed = (yield* loadEventsAfter(runId, -1)).findLast((event) => event._tag === "RunFailed")
      if (failed?._tag === "RunFailed") Object.assign(result, { failure: failed.error })
    }
    return result
  })

export const appendAction = (runId: string, operator: string, action: Action) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    const operationId = yield* nextOperationId
    const now = yield* nowIso
    const input: ActionRecord = { operator, action }
    const decision = explain(yield* journal(runId)).decision
    yield* sql`
      INSERT INTO generalist_run_operations (
        run_id, operation_id, operation_key, kind, status, input_digest, input_json,
        result_json, error_json, replay_policy, attempt, started_at, finished_at
      ) VALUES (
        ${runId}, ${operationId}, ${`operator:${operationId}`}, 'operator', 'succeeded',
        ${digest({ operator, action: action._tag })}, ${encodeJsonValue(input)},
        ${encodeJsonValue({ decision })}, NULL, 'pure', ${run.attempt}, ${now}, ${now}
      )
    `
  })

const illegal = (source: Journal, action: string) =>
  IllegalOperatorAction.make({ runId: source.runId, decision: explain(source).decision, action })

export const retry = (input: RetryInput, claimableStatus: "queued" | "running", clearLease: boolean) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const source = yield* journal(input.runId)
    const decision = explain(source).decision
    if (decision._tag !== "RetryOperation" || decision.operationId !== input.operationId) {
      return yield* illegal(source, "retry")
    }
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const runtime = yield* sql<OperationRow>`
      SELECT * FROM generalist_run_operations
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    if (runtime[0]?.status === "running" && runtime[0].kind !== "operator" && canBlindRetry(runtime[0].replay_policy)) {
      yield* sql`
        UPDATE generalist_run_operations SET status = 'requested', started_at = NULL, finished_at = NULL
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'running'
      `
    } else {
      const program = yield* getProgramOperation({ runId: input.runId, operation: input.operationId })
      if (program?.status !== "running" || program.replay !== "idempotent") return yield* illegal(source, "retry")
      yield* sql`
        UPDATE generalist_program_operations SET status = 'reserved'
        WHERE run_id = ${input.runId} AND operation_name = ${input.operationId} AND status = 'running'
      `
    }
    yield* revokeRunSessionWriteClaim({
      sessionId: run.sessionId,
      runId: run.runId,
      ownerId: run.ownerWorkerId,
      runAttemptFence: run.attemptFence,
    })
    if (clearLease) {
      yield* sql`
        UPDATE generalist_runs SET status = ${claimableStatus}, owner_worker_id = NULL, lease_expires_at = NULL
        WHERE run_id = ${input.runId}
      `
    } else {
      yield* sql`
        UPDATE generalist_runs SET status = ${claimableStatus}, owner_worker_id = NULL
        WHERE run_id = ${input.runId}
      `
    }
    yield* appendAction(input.runId, input.operator, { _tag: "Retry", operationId: input.operationId })
  })

export const wake = (hub: EventHub, input: WakeInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const source = yield* journal(input.runId)
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    const decision = explain(source).decision
    const waits = source.waits.filter((wait) => wait.status === "open")
    if (
      run.status !== "waiting" ||
      run.suspension === undefined ||
      decision._tag !== "Resume" ||
      waits.some((wait) => wait.reason._tag !== "External")
    ) {
      return yield* illegal(source, "wake")
    }
    for (const wait of waits) {
      yield* signal(hub, { runId: input.runId, name: wait.waitId }).pipe(
        Effect.catchTag("generalist/runtime/RunTerminal", () => Effect.fail(illegal(source, "wake"))),
      )
      yield* sql`
        UPDATE generalist_program_operations SET status = 'reserved'
        WHERE run_id = ${input.runId} AND wait_id = ${wait.waitId} AND status = 'waiting'
      `
    }
    if (waits.length === 0) {
      yield* sql`
        UPDATE generalist_runs SET status = 'running', owner_worker_id = NULL
        WHERE run_id = ${input.runId} AND status = 'waiting'
      `
      yield* revokeRunSessionWriteClaim({
        sessionId: run.sessionId,
        runId: run.runId,
        ownerId: run.ownerWorkerId,
        runAttemptFence: run.attemptFence,
      })
    }
    yield* appendAction(input.runId, input.operator, { _tag: "Wake" })
  })

export const resolveUnknown = (
  input: ResolveUnknownInput,
  claimableStatus: "queued" | "running",
  clearLease: boolean,
) =>
  Effect.gen(function* () {
    const source = yield* journal(input.runId)
    const legal = explain(source).obligations.some(
      (decision) => decision._tag === "Unknown" && decision.operationId === input.operationId,
    )
    if (!legal) return yield* illegal(source, "resolveUnknown")
    const resolutionInput = {
      runId: input.runId,
      operationId: input.operationId,
      idempotencyKey: `operator:${input.operator}:resolve:${input.operationId}`,
      resolution: input.resolution,
    }
    const program = yield* getProgramOperation({ runId: input.runId, operation: input.operationId })
    if (program === undefined) {
      yield* resolveOperation(resolutionInput, claimableStatus, clearLease).pipe(
        Effect.catchTag("generalist/runtime/OperationResolutionConflict", () =>
          Effect.fail(illegal(source, "resolveUnknown")),
        ),
      )
    } else {
      yield* resolveProgramOperation(resolutionInput, claimableStatus, clearLease).pipe(
        Effect.catchTag("generalist/runtime/OperationResolutionConflict", () =>
          Effect.fail(illegal(source, "resolveUnknown")),
        ),
      )
    }
    yield* appendAction(input.runId, input.operator, {
      _tag: "ResolveUnknown",
      operationId: input.operationId,
      resolution: input.resolution,
    })
  })
