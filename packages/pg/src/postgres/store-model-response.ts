import { Effect, Schema } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RuntimeUnavailable, type RunNotFound } from "tenetkit/runtime/driver/errors"
import type { Interface as RunStoreInterface } from "tenetkit/runtime/driver/run-store"
import type { DecodedRun, OperationRow } from "tenetkit/runtime/driver/sql/rows"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { appendEvent, loadEventsAfter, toOperationRecord } from "./pg-helpers.js"
import type { RunFn } from "./store-ops.js"
import { encodeExecutableRef, encodeJson, encodeJsonValue } from "tenetkit/runtime/driver/sql/codecs"
import { ExecutionCheckpoint } from "tenetkit/runtime/driver/execution-state"
import { encodeContinuation } from "tenetkit/runtime/driver/steering"
import { checkpointRef } from "tenetkit/runtime/driver/executable-manifest"
import { sameModelResponseEvent, validateModelResponseCommit } from "tenetkit/runtime/driver/model-response-commit"
import {
  sameInterruptedModelOutcome,
  sameInterruptedModelResponse,
  validateInterruptedModelResponse,
} from "tenetkit/runtime/driver/model-response-interrupted"
import {
  appendCompletedSessionEntry,
  appendInterruptedSessionEntry,
  verifyCompletedSessionEntry,
  verifyInterruptedSessionEntry,
} from "./session-store.js"

type SqlR = SqlClient.SqlClient | PgClient.PgClient

export const postgresModelResponseOperations = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: RunFn
  readonly requireRun: (runId: string) => Effect.Effect<DecodedRun, RunNotFound | RuntimeUnavailable | SqlError, SqlR>
  readonly requireClaim: (
    claim: import("tenetkit/runtime/driver/run-store").ExecutionClaim,
  ) => Effect.Effect<
    void,
    import("tenetkit/runtime/driver/sql/errors").StaleClaim | RunNotFound | RuntimeUnavailable | SqlError,
    SqlR
  >
}): Pick<RunStoreInterface, "commitModelResponse" | "commitInterruptedModelResponse"> => {
  const { sql, hub, run, requireRun, requireClaim } = input
  const fenced = <A, E>(
    claim: import("tenetkit/runtime/driver/run-store").ExecutionClaim,
    effect: Effect.Effect<A, E, SqlR>,
  ) =>
    run(
      sql`SELECT run_id FROM tenetkit_runs WHERE run_id = ${claim.runId} FOR UPDATE`.pipe(
        Effect.andThen(requireClaim(claim)),
        Effect.andThen(effect),
      ),
    )
  return {
    commitInterruptedModelResponse: (op) =>
      fenced(
        op,
        Effect.gen(function* () {
          const loaded = yield* requireRun(op.runId)
          const rows = yield* sql<OperationRow>`
            SELECT * FROM tenetkit_run_operations
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
            FOR UPDATE
          `
          const row = rows[0]
          if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
          const current = toOperationRecord(row)
          const validated = validateInterruptedModelResponse({
            runId: op.runId,
            sessionId: loaded.message.sessionId,
            record: current,
            outcome: op.outcome,
            event: op.event,
          })
          if (Schema.is(RuntimeUnavailable)(validated)) return yield* validated
          const sessionEntry = validated.entry
          if (current.status === "failed") {
            if (!sameInterruptedModelOutcome({ left: { _tag: "Failed", error: current.error }, right: op.outcome })) {
              return yield* RuntimeUnavailable.make({
                message: `model operation ${op.operationId} has a divergent interrupted outcome retry`,
              })
            }
            const prior = (yield* loadEventsAfter(op.runId, -1)).filter(
              (event) => event._tag === "ModelResponseInterrupted" && event.operationKey === op.event.operationKey,
            )
            if (
              prior.length !== 1 ||
              prior[0]?._tag !== "ModelResponseInterrupted" ||
              !sameInterruptedModelResponse({ left: prior[0], right: validated.event })
            ) {
              return yield* RuntimeUnavailable.make({
                message: `model operation ${op.operationId} has a divergent interrupted outbox retry`,
              })
            }
            yield* verifyInterruptedSessionEntry(sessionEntry).pipe(
              Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
            )
            return current
          }
          if (current.status !== "running") {
            return yield* RuntimeUnavailable.make({
              message: `model operation ${op.operationId} cannot commit an interruption from ${current.status}`,
            })
          }
          yield* appendInterruptedSessionEntry(sessionEntry).pipe(
            Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
          )
          yield* sql`
            UPDATE tenetkit_run_operations
            SET status = 'failed', error_json = ${encodeJsonValue(op.outcome.error)}, finished_at = NOW()
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId} AND status = 'running'
          `
          yield* appendEvent(
            hub,
            yield* requireRun(op.runId),
            validated.event as unknown as { readonly _tag: string } & Record<string, unknown>,
          )
          const completed = yield* sql<OperationRow>`
            SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          return toOperationRecord(completed[0]!)
        }),
      ),
    commitModelResponse: (op) =>
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
          const current = toOperationRecord(row)
          const validated = validateModelResponseCommit({
            record: current,
            input: op,
            sessionId: loaded.message.sessionId,
          })
          if (Schema.is(RuntimeUnavailable)(validated)) return yield* validated
          const sessionEntry = validated.entry
          if (current.status === "succeeded") {
            const priorValidation = validateModelResponseCommit({
              record: current,
              input: {
                ...op,
                outcome: { _tag: "Succeeded", value: current.result },
              },
              sessionId: loaded.message.sessionId,
            })
            if (Schema.is(RuntimeUnavailable)(priorValidation)) return yield* priorValidation
            const prior = (yield* loadEventsAfter(op.runId, -1)).filter(
              (event) => event._tag === "ModelResponseCommitted" && event.operationKey === op.event.operationKey,
            )
            if (
              prior.length !== 1 ||
              prior[0]?._tag !== "ModelResponseCommitted" ||
              !sameModelResponseEvent({ left: prior[0], right: validated.event })
            ) {
              return yield* RuntimeUnavailable.make({
                message: `model operation ${op.operationId} has a divergent outbox retry`,
              })
            }
            yield* verifyCompletedSessionEntry(sessionEntry).pipe(
              Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
            )
            return current
          }
          if (current.status === "failed" || current.status === "unknown") {
            return yield* RuntimeUnavailable.make({
              message: `model operation ${op.operationId} already completed as ${current.status}`,
            })
          }
          for (const entryId of new Set(op.steeringEntryIds ?? [])) {
            const rows = yield* sql<{ readonly consumed_operation_id: string | null }>`
              SELECT consumed_operation_id FROM tenetkit_run_steering
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
          yield* appendCompletedSessionEntry(sessionEntry).pipe(
            Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
          )
          yield* sql`
            UPDATE tenetkit_run_operations
            SET status = 'succeeded', result_json = ${encodeJsonValue(validated.reference)}, finished_at = NOW()
            WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
              AND status IN ('requested', 'running')
          `
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
          yield* appendEvent(
            hub,
            yield* requireRun(op.runId),
            validated.event as unknown as { readonly _tag: string } & Record<string, unknown>,
          )
          const rows = yield* sql<OperationRow>`
            SELECT * FROM tenetkit_run_operations WHERE run_id = ${op.runId} AND operation_id = ${op.operationId}
          `
          return toOperationRecord(rows[0]!)
        }),
      ),
  }
}
