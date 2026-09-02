import { Clock, Effect, Function, Random, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import { isTerminal } from "../../../run.js"
import { ExecutionCheckpoint } from "../../../execution/state.js"
import type { RecordOperationInput } from "../../../run/store.js"
import { encodeExecutableRef, encodeJson, encodeJsonValue } from "../../codec/codecs.js"
import { canBlindRetry, type OperationRecord } from "../../operations.js"
import type { OperationRow } from "../../codec/rows.js"
import { appendEvent, loadEventsAfter, loadRun, nowIso, toOperationRecord } from "../statements.js"
import type { EventHub } from "../../subscribers.js"
import { encodeContinuation } from "../../../run/steering.js"
import { checkpointRef } from "../../../executable/manifest-internal.js"
import { validateSteeringPrefix } from "./steering-prefix.js"

import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  sameModelResponseEvent,
  validateModelResponseCommit,
  type CommitModelResponseInput,
} from "../../../execution/model-response/commit.js"
import {
  appendCompletedSessionEntry,
  appendHandoffSessionEntry,
  verifyCompletedSessionEntry,
  verifyHandoffSessionEntry,
} from "../../model-response/completed-model-response.js"
import { handoffSessionEntry, isCommit, sameHandoffCheckpoint, sameCommit } from "../../../session/handoff.js"
import type { CancellationOutcome } from "../../../../core/tools/tool-executor.js"
import { decodeCancellableOperation } from "../../../../core/tools/tool-executor-cancellation.js"
import { markSqlTransitionDivergentRetry, markSqlTransitionExactRetry } from "../kernel/observability.js"

const CancellationEnvelope = Schema.Struct({ cancellation: Schema.Unknown })
const encodeCheckpoint = (checkpoint: RecordOperationInput["checkpoint"]): string | null =>
  checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, checkpoint)
const isCompletedStatus = (status: OperationRow["status"]): boolean =>
  status === "cancelling" ||
  status === "cancelled" ||
  status === "succeeded" ||
  status === "failed" ||
  status === "unknown"

const sameEntries = (rows: ReadonlyArray<{ readonly entry_id: string }>, expected: ReadonlyArray<string>): boolean =>
  rows.length === expected.length && rows.every((entry, index) => entry.entry_id === expected[index])

export const nextOperationId: Effect.Effect<string> = Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis
  const random = yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER)
  return `op_${now.toString(36)}_${random.toString(36)}`
})

const priorOperation = (sql: SqlClient.SqlClient, input: RecordOperationInput, prior: OperationRow) =>
  Effect.gen(function* () {
    const consumed = yield* sql<{
      readonly entry_id: string
    }>`SELECT entry_id FROM generalist_run_steering WHERE run_id = ${input.runId} AND consumed_operation_id = ${prior.operation_id} ORDER BY sequence`
    if (!sameEntries(consumed, input.steeringEntryIds ?? [])) {
      return yield* RuntimeUnavailable.make({ message: "steering consumption does not match operation" })
    }
    return toOperationRecord(prior)
  })

const ensureRecordable = (
  run: Awaited<ReturnType<typeof requireRun>> extends Effect.Effect<infer A, infer _E, infer _R> ? A : never,
) => {
  if (isTerminal(run.status)) return RunTerminal.make({ runId: run.runId, status: run.status })
  if (run.cancellationRequested) return RuntimeUnavailable.make({ message: `run ${run.runId} is cancelling` })
  return undefined
}

const completeExisting = (
  current: OperationRecord,
  input: CompleteOperationInput,
  sessionId: string,
  checkpoint: ExecutionCheckpoint | undefined,
) =>
  Effect.gen(function* () {
    if (current.kind !== "handoff" || current.status !== "succeeded" || !isCommit(current.result)) return current
    if (
      input.outcome._tag !== "Succeeded" ||
      !sameCommit(current.result, input.outcome.value) ||
      !sameHandoffCheckpoint(checkpoint, input.checkpoint)
    ) {
      return yield* RuntimeUnavailable.make({ message: "handoff operation has a divergent completion retry" })
    }
    const entry = handoffSessionEntry({ sessionId, operationKey: current.operationKey, value: input.outcome.value })
    if (Schema.is(RuntimeUnavailable)(entry)) return yield* entry
    yield* verifyHandoffSessionEntry(entry).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    return current
  })

const persistOperationOutcome = (sql: SqlClient.SqlClient, input: CompleteOperationInput, finished: string) =>
  Effect.gen(function* () {
    if (input.outcome._tag === "Succeeded") {
      yield* sql`UPDATE generalist_run_operations SET status = 'succeeded', result_json = ${encodeJsonValue(input.outcome.value)}, finished_at = ${finished} WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status IN ('requested', 'running')`
    } else if (input.outcome._tag === "Failed") {
      yield* sql`UPDATE generalist_run_operations SET status = 'failed', error_json = ${encodeJsonValue(input.outcome.error)}, finished_at = ${finished} WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status IN ('requested', 'running')`
    } else {
      yield* sql`UPDATE generalist_run_operations SET status = 'unknown', finished_at = ${finished} WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status IN ('requested', 'running')`
    }
  })

const verifySteeringOwnership = (sql: SqlClient.SqlClient, input: CompleteOperationInput) =>
  Effect.gen(function* () {
    for (const entryId of new Set(input.steeringEntryIds ?? [])) {
      const rows =
        yield* sql<SteeringConsumptionRow>`SELECT entry_id, consumed_operation_id FROM generalist_run_steering WHERE run_id = ${input.runId} AND entry_id = ${entryId}`
      if (rows[0]?.consumed_operation_id !== input.operationId) {
        return yield* RuntimeUnavailable.make({ message: `steering entry ${entryId} does not belong to operation` })
      }
    }
  })

interface SteeringConsumptionRow {
  readonly entry_id: string
  readonly sequence: number | string
  readonly consumed_operation_id: string | null
  readonly discarded_reason: string | null
}

const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((run) => (run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run))),
  )

type CompleteOperationInput = {
  readonly runId: string
  readonly operationId: string
  readonly outcome: import("../../../run/store.js").OperationCompletionOutcome
  readonly checkpoint?: import("../../../execution/state.js").ExecutionCheckpoint
  readonly continuation?: import("../../../run/steering.js").ExecutionContinuation | null
  readonly steeringEntryIds?: ReadonlyArray<string>
}
type OperationEffect = Effect.Effect<
  OperationRecord,
  RunNotFound | RunTerminal | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>
type CompleteEffect = Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient>
type ExpireEffect = Effect.Effect<
  | { record: OperationRecord; outcome: "failed" | "requested" | "succeeded" | "unknown" }
  | { record: OperationRecord; outcome: "retried" },
  RunNotFound | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>
export const recordOperation: {
  (input: RecordOperationInput): (hub: EventHub) => OperationEffect
  (hub: EventHub, input: RecordOperationInput): OperationEffect
} = Function.dual(2, (hub: EventHub, input: RecordOperationInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const unavailable = ensureRecordable(run)
    if (unavailable !== undefined) return yield* unavailable
    const existing = yield* sql<OperationRow>`
      SELECT * FROM generalist_run_operations
      WHERE run_id = ${input.runId} AND operation_key = ${input.operationKey}
    `
    const prior = existing[0]
    if (prior !== undefined) {
      return yield* priorOperation(sql, input, prior)
    }
    const steeringEntryIds = input.steeringEntryIds ?? []
    yield* validateSteeringPrefix(input)
    const operationId = yield* nextOperationId
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    yield* sql`
      INSERT INTO generalist_run_operations (
        run_id, operation_id, operation_key, kind, status, input_digest, input_json,
        result_json, error_json, replay_policy, attempt, started_at, finished_at, checkpoint_json, completed_sequence
      ) VALUES (
        ${input.runId}, ${operationId}, ${input.operationKey}, ${input.kind}, 'requested',
        ${input.inputDigest}, ${encodeJsonValue(input.input)}, NULL, NULL, ${input.replayPolicy},
        ${input.attempt}, NULL, NULL,
        ${encodeCheckpoint(input.checkpoint)}, NULL
      )
    `
    if (input.checkpoint !== undefined || input.continuation !== undefined) {
      yield* sql`
        UPDATE generalist_runs SET
          driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)}, driver_checkpoint_json),
          executable_ref_json = ${encodeExecutableRef(executableRef)},
          continuation_json = CASE WHEN ${input.continuation === undefined ? 0 : 1} = 1
            THEN ${input.continuation === null || input.continuation === undefined ? null : encodeContinuation(input.continuation)}
            ELSE continuation_json END
        WHERE run_id = ${input.runId}
      `
    }
    for (const entryId of steeringEntryIds) {
      yield* sql`
        UPDATE generalist_run_steering SET consumed_operation_id = ${operationId}
        WHERE run_id = ${input.runId} AND entry_id = ${entryId}
          AND consumed_operation_id IS NULL AND discarded_reason IS NULL
      `
    }
    if (steeringEntryIds.length > 0) {
      yield* appendEvent(hub, yield* requireRun(input.runId), {
        _tag: "SteeringConsumed",
        entryIds: steeringEntryIds,
        operationId,
      })
    }
    for (const event of input.steeringEvents ?? []) {
      const current = yield* requireRun(input.runId)
      yield* appendEvent(hub, current, event)
    }
    const rows = yield* sql<OperationRow>`
      SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${operationId}
    `
    return toOperationRecord(rows[0]!)
  }),
)

export const startOperation = (input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is cancelling` })
    }
    const started = yield* nowIso
    yield* sql`
      UPDATE generalist_run_operations
      SET status = 'running', started_at = ${started}
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'requested'
    `
    const rows =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return toOperationRecord(row)
  })

export const completeOperation: {
  (input: CompleteOperationInput): (hub: EventHub) => CompleteEffect
  (hub: EventHub, input: CompleteOperationInput): CompleteEffect
} = Function.dual(2, (hub: EventHub, input: CompleteOperationInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const existing = yield* sql<OperationRow>`
      SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    if (existing[0] === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (isCompletedStatus(existing[0].status)) {
      const current = toOperationRecord(existing[0])
      return yield* completeExisting(current, input, run.message.sessionId, run.driverCheckpoint)
    }
    yield* verifySteeringOwnership(sql, input)
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    if (existing[0].kind === "handoff" && input.outcome._tag === "Succeeded" && isCommit(input.outcome.value)) {
      const entry = handoffSessionEntry({
        sessionId: run.message.sessionId,
        operationKey: existing[0].operation_key,
        value: input.outcome.value,
      })
      if (Schema.is(RuntimeUnavailable)(entry)) return yield* entry
      yield* appendHandoffSessionEntry(entry).pipe(
        Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
      )
    }
    const finished = yield* nowIso
    yield* persistOperationOutcome(sql, input, finished)
    yield* sql`UPDATE generalist_run_operations SET completed_sequence = ${run.lastSequence + 1}
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
    yield* sql`
      UPDATE generalist_runs SET
        driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)}, driver_checkpoint_json),
        executable_ref_json = ${encodeExecutableRef(executableRef)},
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
    const rows =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return toOperationRecord(row)
  }),
)

export const commitModelResponse: {
  (input: CommitModelResponseInput): (hub: EventHub) => CompleteEffect
  (hub: EventHub, input: CommitModelResponseInput): CompleteEffect
} = Function.dual(2, (hub: EventHub, input: CommitModelResponseInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const rows =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    const current = toOperationRecord(row)
    if (current.status === "succeeded") yield* markSqlTransitionDivergentRetry
    const validated = validateModelResponseCommit({ record: current, input, sessionId: run.message.sessionId })
    if (Schema.is(RuntimeUnavailable)(validated)) return yield* validated
    const sessionEntry = validated.entry
    if (current.status === "succeeded") {
      const priorValidation = validateModelResponseCommit({
        record: current,
        input: {
          ...input,
          outcome: { _tag: "Succeeded", value: current.result },
        },
        sessionId: run.message.sessionId,
      })
      if (Schema.is(RuntimeUnavailable)(priorValidation)) return yield* priorValidation
      const prior = (yield* loadEventsAfter(input.runId, -1)).filter(
        (event) => event._tag === "ModelResponseCommitted" && event.operationKey === input.event.operationKey,
      )
      if (
        prior.length !== 1 ||
        prior[0]?._tag !== "ModelResponseCommitted" ||
        !sameModelResponseEvent({ left: prior[0], right: validated.event })
      )
        return yield* RuntimeUnavailable.make({
          message: `model operation ${input.operationId} has a divergent outbox retry`,
        })
      yield* verifyCompletedSessionEntry(sessionEntry).pipe(
        Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
      )
      yield* markSqlTransitionExactRetry
      return current
    }
    if (current.status === "failed" || current.status === "unknown")
      return yield* RuntimeUnavailable.make({
        message: `model operation ${input.operationId} already completed as ${current.status}`,
      })
    yield* appendCompletedSessionEntry(sessionEntry).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    const completed = yield* completeOperation(hub, {
      ...input,
      outcome: { _tag: "Succeeded", value: validated.reference },
    })
    yield* appendEvent(hub, yield* requireRun(input.runId), validated.event)
    return completed
  }),
)

export const expireRunningOperation: {
  (input: { readonly runId: string; readonly operationId: string }): (hub: EventHub) => ExpireEffect
  (hub: EventHub, input: { readonly runId: string; readonly operationId: string }): ExpireEffect
} = Function.dual(2, (hub: EventHub, input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const rows =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (row.status !== "running") {
      return { record: toOperationRecord(row), outcome: row.status }
    }
    if (canBlindRetry(row.replay_policy)) {
      yield* sql`
        UPDATE generalist_run_operations
        SET status = 'requested', started_at = NULL, finished_at = NULL
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'running'
      `
      const next =
        yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
      return { record: toOperationRecord(next[0]!), outcome: "retried" as const }
    }
    const finished = yield* nowIso
    yield* sql`
      UPDATE generalist_run_operations SET status = 'unknown', finished_at = ${finished}
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'running'
    `
    yield* appendEvent(hub, run, { _tag: "OperationUnknown", operationId: input.operationId }, "needs-resolution")
    const next =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
    return { record: toOperationRecord(next[0]!), outcome: "unknown" as const }
  }),
)

export const getOperation = (input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireRun(input.runId)
    const rows =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return toOperationRecord(row)
  })

export const getOperationByKey = (input: { readonly runId: string; readonly operationKey: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireRun(input.runId)
    const rows =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_key = ${input.operationKey}`
    return rows[0] === undefined ? undefined : toOperationRecord(rows[0])
  })

export const operationCancellations = (input: { readonly runId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireRun(input.runId)
    const rows =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND status = 'cancelling' ORDER BY operation_id`
    return rows.map(toOperationRecord)
  })

export const markOperationCancellations = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<OperationRow>`
      SELECT * FROM generalist_run_operations
      WHERE run_id = ${runId} AND kind = 'tool' AND status IN ('requested', 'running', 'unknown')
      ORDER BY operation_id
    `
    let marked = 0
    for (const row of rows) {
      const operationInput = toOperationRecord(row).input
      const envelope = Schema.decodeUnknownOption(CancellationEnvelope)(operationInput)
      const cancellation =
        envelope._tag === "Some" ? decodeCancellableOperation(envelope.value.cancellation) : undefined
      if (cancellation === undefined) continue
      yield* sql`
        UPDATE generalist_run_operations SET status = 'cancelling', finished_at = NULL
        WHERE run_id = ${runId} AND operation_id = ${row.operation_id}
          AND status IN ('requested', 'running', 'unknown')
      `
      marked += 1
    }
    return marked
  })

export const acknowledgeOperationCancellation = (input: {
  readonly runId: string
  readonly operationId: string
  readonly outcome: CancellationOutcome
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (!run.cancellationRequested) {
      return yield* RuntimeUnavailable.make({ message: `run ${input.runId} has not requested cancellation` })
    }
    const rows = yield* sql<OperationRow>`
      SELECT * FROM generalist_run_operations
      WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}
    `
    const row = rows[0]
    if (row === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (row.status === "cancelled" || row.status === "succeeded" || row.status === "failed") {
      return toOperationRecord(row)
    }
    if (row.status !== "cancelling") {
      return yield* RuntimeUnavailable.make({ message: `operation ${input.operationId} is not cancelling` })
    }
    const finished = yield* nowIso
    if (input.outcome._tag === "Cancelled") {
      yield* sql`
        UPDATE generalist_run_operations SET status = 'cancelled', finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'cancelling'
      `
    } else {
      yield* sql`
        UPDATE generalist_run_operations
        SET status = 'succeeded', result_json = ${encodeJsonValue(input.outcome.outcome)}, finished_at = ${finished}
        WHERE run_id = ${input.runId} AND operation_id = ${input.operationId} AND status = 'cancelling'
      `
    }
    const completed =
      yield* sql<OperationRow>`SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId} AND operation_id = ${input.operationId}`
    return toOperationRecord(completed[0]!)
  })
