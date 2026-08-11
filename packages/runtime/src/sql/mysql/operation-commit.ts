import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, RuntimeUnavailable } from "../../errors.js"
import { ExecutionCheckpoint } from "../../execution-state.js"
import { checkpointRef } from "../../executable-manifest.js"
import type { Interface as RunStoreInterface } from "../../run-store.js"
import { encodeExecutableRef, encodeJson, encodeJsonValue } from "../codecs.js"
import type { OperationRow } from "../rows.js"
import { appendEvent, loadRun, toOperationRecord } from "../store-helpers.js"
import type { EventHub } from "../subscribers.js"
import { encodeContinuation } from "../../steering.js"
import { appendHandoffSessionEntry, verifyHandoffSessionEntry } from "./session-store.js"
import {
  handoffSessionEntry,
  isHandoffCommit,
  sameHandoffCheckpoint,
  sameHandoffCommit,
} from "../../handoff-session.js"

const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((run) => (run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run))),
  )

type CompleteInput = Parameters<RunStoreInterface["completeOperation"]>[0]

/** Complete an operation, importing an exact handoff projection in the same MySQL transaction. */
const completeMysqlOperation = (
  hub: EventHub,
  op: CompleteInput,
): Effect.Effect<
  import("../operations.js").OperationRecord,
  RunNotFound | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const loaded = yield* requireRun(op.runId)
    const existing = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations
      WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
      FOR UPDATE
    `
    const row = existing[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    const current = toOperationRecord(row)
    if (row.status === "succeeded" || row.status === "failed" || row.status === "unknown") {
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
    }
    for (const entryId of new Set(op.steeringEntryIds ?? [])) {
      const rows = yield* sql<{ readonly consumed_operation_id: string | null }>`
        SELECT consumed_operation_id FROM baton_run_steering
        WHERE run_id = ${op.runId} AND entry_id = ${entryId}
      `
      if (rows[0]?.consumed_operation_id !== op.operationId) {
        return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} does not belong to operation` })
      }
    }
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
    if (op.outcome._tag === "Succeeded") {
      yield* sql`
        UPDATE baton_run_operations
        SET status = 'succeeded', result_json = ${encodeJsonValue(op.outcome.value)}, finished_at = NOW(3)
        WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          AND status IN ('requested', 'running')
      `
    } else if (op.outcome._tag === "Failed") {
      yield* sql`
        UPDATE baton_run_operations
        SET status = 'failed', error_json = ${encodeJsonValue(op.outcome.error)}, finished_at = NOW(3)
        WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          AND status IN ('requested', 'running')
      `
    } else {
      yield* sql`
        UPDATE baton_run_operations SET status = 'unknown', finished_at = NOW(3)
        WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          AND status IN ('requested', 'running')
      `
    }
    yield* sql`
      UPDATE baton_runs SET
        driver_checkpoint_json = COALESCE(${op.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, op.checkpoint)}, driver_checkpoint_json),
        executable_ref_json = ${encodeExecutableRef(executableRef)},
        continuation_json = CASE WHEN ${op.continuation === undefined ? 0 : 1} = 1
          THEN ${op.continuation === null || op.continuation === undefined ? null : encodeContinuation(op.continuation)}
          ELSE continuation_json END,
        updated_at = NOW(3)
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
    const completed = yield* sql<OperationRow>`
      SELECT * FROM baton_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
    `
    return toOperationRecord(completed[0]!)
  })

export const MysqlOperationCommit = { complete: completeMysqlOperation } as const
