import { Clock, Effect, Random } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { OperationResolutionConflict, RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { RecordOperationInput } from "../run-store.js"
import { decodeJson, encodeJson } from "./codecs.js"
import { canBlindRetry } from "./operations.js"
import type { OperationRow } from "./rows.js"
import { appendEvent, loadRun, nowIso, toOperationRecord } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"
import { encodeContinuation } from "../steering.js"
import { checkpointRef } from "../executable-manifest.js"
import { encodeExecutableRef } from "./codecs.js"
import { OperationResolution, digest as resolutionDigest, type ResolveOperationInput } from "../operation-resolution.js"

const nextId = (prefix: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    const random = yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER)
    return `${prefix}_${now.toString(36)}_${random.toString(36)}`
  })

interface SteeringConsumptionRow {
  readonly entry_id: string
  readonly consumed_operation_id: string | null
}

const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((run) => (run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run))),
  )

export const recordOperation = (hub: EventHub, input: RecordOperationInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    const existing = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations
      WHERE run_id = ${input.runId} AND operation_key = ${input.operationKey}
    `
    const prior = existing[0]
    if (prior !== undefined) {
      for (const entryId of new Set(input.steeringEntryIds ?? [])) {
        const rows = yield* sql<SteeringConsumptionRow>`
          SELECT entry_id, consumed_operation_id FROM baton_run_steering
          WHERE run_id = ${input.runId} AND entry_id = ${entryId}
        `
        if (rows[0]?.consumed_operation_id !== prior.operation_id) {
          return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} does not belong to operation` })
        }
      }
      return toOperationRecord(prior)
    }
    for (const entryId of new Set(input.steeringEntryIds ?? [])) {
      const rows = yield* sql<SteeringConsumptionRow>`
        SELECT entry_id, consumed_operation_id FROM baton_run_steering
        WHERE run_id = ${input.runId} AND entry_id = ${entryId}
      `
      if (rows[0] === undefined || rows[0].consumed_operation_id !== null) {
        return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} is not pending` })
      }
    }
    const operationId = yield* nextId("op")
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
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
    if (input.checkpoint !== undefined || input.transcript !== undefined || input.continuation !== undefined) {
      yield* sql`
        UPDATE baton_runs SET
          driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : JSON.stringify(input.checkpoint)}, driver_checkpoint_json),
          executable_ref_json = ${encodeExecutableRef(executableRef)},
          transcript_json = COALESCE(${input.transcript === undefined ? null : JSON.stringify(input.transcript)}, transcript_json),
          continuation_json = CASE WHEN ${input.continuation === undefined ? 0 : 1} = 1
            THEN ${input.continuation === null || input.continuation === undefined ? null : encodeContinuation(input.continuation)}
            ELSE continuation_json END
        WHERE run_id = ${input.runId}
      `
    }
    for (const entryId of input.steeringEntryIds ?? []) {
      yield* sql`
        UPDATE baton_run_steering SET consumed_operation_id = ${operationId}
        WHERE run_id = ${input.runId} AND entry_id = ${entryId} AND consumed_operation_id IS NULL
      `
    }
    for (const event of input.steeringEvents ?? []) {
      const current = yield* requireRun(input.runId)
      yield* appendEvent(hub, current, event as { readonly _tag: string } & Record<string, unknown>)
    }
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

export const completeOperation = (
  hub: EventHub,
  input: {
    readonly runId: string
    readonly operationId: string
    readonly outcome: import("../run-store.js").OperationCompletionOutcome
    readonly checkpoint: import("../execution-state.js").ExecutionCheckpoint
    readonly transcript?: import("effect/unstable/ai").Prompt.Prompt
    readonly continuation?: import("../steering.js").ExecutionContinuation | null
    readonly steeringEntryIds?: ReadonlyArray<string>
  },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const existing = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    if (existing[0] === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (existing[0].status === "succeeded" || existing[0].status === "failed" || existing[0].status === "unknown") {
      return toOperationRecord(existing[0])
    }
    for (const entryId of new Set(input.steeringEntryIds ?? [])) {
      const rows = yield* sql<SteeringConsumptionRow>`
        SELECT entry_id, consumed_operation_id FROM baton_run_steering
        WHERE run_id = ${input.runId} AND entry_id = ${entryId}
      `
      if (rows[0]?.consumed_operation_id !== input.operationId) {
        return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} does not belong to operation` })
      }
    }
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const finished = yield* nowIso
    if (input.outcome._tag === "Succeeded") {
      yield* sql`
        UPDATE baton_run_operations
        SET status = 'succeeded', result_json = ${encodeJson(input.outcome.value)}, finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
          AND status IN ('requested', 'running')
      `
    } else if (input.outcome._tag === "Failed") {
      yield* sql`
        UPDATE baton_run_operations
        SET status = 'failed', error_json = ${encodeJson(input.outcome.error)}, finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
          AND status IN ('requested', 'running')
      `
    } else {
      yield* sql`
        UPDATE baton_run_operations SET status = 'unknown', finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
          AND status IN ('requested', 'running')
      `
    }
    yield* sql`
      UPDATE baton_runs SET
        driver_checkpoint_json = ${JSON.stringify(input.checkpoint)},
        executable_ref_json = ${encodeExecutableRef(executableRef)},
        transcript_json = COALESCE(${input.transcript === undefined ? null : JSON.stringify(input.transcript)}, transcript_json),
        continuation_json = CASE WHEN ${input.continuation === undefined ? 0 : 1} = 1
          THEN ${input.continuation === null || input.continuation === undefined ? null : encodeContinuation(input.continuation)}
          ELSE continuation_json END,
        updated_at = ${finished}
      WHERE run_id = ${input.runId}
    `
    if (input.outcome._tag === "Unknown") {
      yield* appendEvent(
        hub,
        yield* requireRun(input.runId),
        { _tag: "OperationUnknown", operationId: input.operationId },
        "needs-resolution",
      )
    }
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

export const resolveOperation = (
  input: ResolveOperationInput,
  claimableStatus: "queued" | "running" = "queued",
  clearLease = false,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const rows = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    const resolutionJson = encodeJson(input.resolution)
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
        UPDATE baton_run_operations SET status = 'succeeded', result_json = ${encodeJson(input.resolution.value)},
          resolution_idempotency_key = ${input.idempotencyKey}, resolution_json = ${resolutionJson}, finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'unknown'
      `
    } else if (input.resolution._tag === "Failed") {
      yield* sql`
        UPDATE baton_run_operations SET status = 'failed', error_json = ${encodeJson(input.resolution.error)},
          resolution_idempotency_key = ${input.idempotencyKey}, resolution_json = ${resolutionJson}, finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'unknown'
      `
    } else {
      yield* sql`
        UPDATE baton_run_operations SET status = 'requested', result_json = NULL, error_json = NULL,
          resolution_idempotency_key = ${input.idempotencyKey}, resolution_json = ${resolutionJson},
          started_at = NULL, finished_at = NULL
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'unknown'
      `
    }
    if (clearLease) {
      yield* sql`
        UPDATE baton_runs SET status = ${claimableStatus}, owner_worker_id = NULL, lease_expires_at = NULL,
          updated_at = ${finished}
        WHERE run_id = ${input.runId} AND status = 'needs-resolution'
      `
    } else {
      yield* sql`
        UPDATE baton_runs SET status = ${claimableStatus}, owner_worker_id = NULL, updated_at = ${finished}
        WHERE run_id = ${input.runId} AND status = 'needs-resolution'
      `
    }
  })
