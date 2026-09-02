import { Effect, Function, Predicate, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ForkSequenceInvalid, NoSnapshot, RunNotFound, SubstitutionInvalid } from "../../../errors.js"
import type { Message } from "../../../messaging/message.js"
import { eventIdFor, RunEvent } from "../../../run/event.js"
import type { ForkRunInput, RewindRunInput } from "../../../run/store-types.js"
import { decodeEvent, decodeMessage, encodeEvent, encodeJsonValue, encodeMessage } from "../../codec/codecs.js"
import type { EventRow, OperationRow, RunRow } from "../../codec/rows.js"
import type { EventHub } from "../../subscribers.js"
import { appendEvent, loadRun } from "../statements.js"

export const loadRunBranches = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ run_id: string; fork_sequence: number }>`
      SELECT run_id, fork_sequence FROM generalist_runs
      WHERE forked_from = ${runId}
      ORDER BY created_at ASC, run_id ASC
    `
    return rows.map((row) => ({ runId: row.run_id, forkedAt: row.fork_sequence }))
  })

const isSandboxSnapshot = (event: RunEvent): event is Extract<RunEvent, { readonly _tag: "ToolProgress" }> =>
  event._tag === "ToolProgress" && event.message === "SandboxSnapshot"

const snapshotUnavailable = (event: Extract<RunEvent, { readonly _tag: "ToolProgress" }>): boolean =>
  !Predicate.isObject(event.data) || event.data._tag !== "SandboxSnapshot" || !Predicate.isString(event.data.snapshotId)

const prefix = (runId: string, sequence: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sourceRows = yield* sql<RunRow>`SELECT * FROM generalist_runs WHERE run_id = ${runId}`
    const source = sourceRows[0]
    if (source === undefined) return yield* RunNotFound.make({ runId })
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > source.last_sequence) {
      return yield* ForkSequenceInvalid.make({ runId, sequence, lastSequence: source.last_sequence })
    }
    const loadedRows = yield* sql<EventRow>`
      SELECT * FROM generalist_run_events WHERE run_id = ${runId} AND sequence <= ${sequence}
      ORDER BY sequence ASC
    `
    const retained = loadedRows
      .map((row) => ({ row, event: decodeEvent(row.event_json) }))
      .filter(
        ({ event }) => event._tag !== "RunCompleted" && event._tag !== "RunFailed" && event._tag !== "RunCancelled",
      )
    const eventRows = retained.map(({ row }) => row)
    const events = retained.map(({ event }) => event)
    const snapshot = events.findLast(isSandboxSnapshot)
    if (snapshot !== undefined && snapshotUnavailable(snapshot)) {
      return yield* NoSnapshot.make({ runId, atSequence: sequence })
    }
    const checkpoint = eventRows.findLast((row) => row.checkpoint_json !== null)?.checkpoint_json ?? null
    return { source, eventRows, events, checkpoint }
  })

const copiedMessage = (source: RunRow, runId: string) => {
  const decoded = decodeMessage(source.message_json)
  return {
    ...decoded,
    id: `fork:${runId}`,
    sessionId: `${source.session_id}:fork:${runId}`,
    idempotencyKey: `fork:${runId}`,
  } satisfies Message
}

const cloneSession = (sourceSessionId: string, targetSessionId: string, leafId: string | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO generalist_sessions (session_id, leaf_id, next_seq, writer_epoch, updated_at)
      SELECT ${targetSessionId}, ${leafId}, next_seq, 0, updated_at
      FROM generalist_sessions WHERE session_id = ${sourceSessionId}
    `
    yield* sql`
      INSERT INTO generalist_session_entries (session_id, entry_id, parent_id, seq, tag, payload_json, created_at)
      SELECT ${targetSessionId}, entry_id, parent_id, seq, tag, payload_json, created_at
      FROM generalist_session_entries WHERE session_id = ${sourceSessionId}
    `
  })

const leafAt = (events: ReadonlyArray<RunEvent>): string | null => {
  const committed = events.findLast(
    (event): event is Extract<RunEvent, { readonly _tag: "ModelResponseCommitted" }> =>
      event._tag === "ModelResponseCommitted",
  )
  return committed?.sessionEntryId ?? null
}

const copyRun = (input: {
  readonly source: RunRow
  readonly eventRows: ReadonlyArray<EventRow>
  readonly events: ReadonlyArray<RunEvent>
  readonly targetRunId: string
  readonly forkSequence: number
  readonly checkpoint: string | null
  readonly status: RunRow["status"]
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const message = copiedMessage(input.source, input.targetRunId)
    const sessionId = message.sessionId
    const lastSequence = input.eventRows.at(-1)?.sequence ?? -1
    yield* sql`
      INSERT INTO generalist_runs (
        run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
        executable_ref_json, executable_manifest_json, root_run_id, depth, max_depth, max_subagents,
        forked_from, fork_sequence, attempt, attempt_fence, last_sequence, last_turn_completed_sequence,
        cancellation_requested, accepted_sequence, driver_checkpoint_json, created_at, updated_at
      ) SELECT
        ${input.targetRunId}, ${input.status}, address, ${sessionId}, ${message.id}, ${encodeMessage(message)},
        message_digest, ${message.idempotencyKey}, executable_ref_json, executable_manifest_json,
        ${input.targetRunId}, 0, max_depth, max_subagents, ${input.source.run_id}, ${input.forkSequence},
        attempt, attempt_fence + 1, ${lastSequence},
        CASE WHEN last_turn_completed_sequence > ${lastSequence} THEN ${lastSequence} ELSE last_turn_completed_sequence END,
        0, accepted_sequence, ${input.checkpoint}, created_at, updated_at
      FROM generalist_runs WHERE run_id = ${input.source.run_id}
    `
    yield* sql`INSERT INTO generalist_tree_roots (root_run_id, earliest_position, last_position)
      VALUES (${input.targetRunId}, 0, ${lastSequence})`
    for (const [position, row] of input.eventRows.entries()) {
      const sourceEvent = decodeEvent(row.event_json)
      const event = yield* Schema.decodeUnknownEffect(RunEvent)({
        ...sourceEvent,
        runId: input.targetRunId,
        rootRunId: input.targetRunId,
        eventId: eventIdFor(input.targetRunId, row.sequence),
      }).pipe(Effect.orDie)
      yield* sql`
        INSERT INTO generalist_run_events (run_id, sequence, event_id, event_json, checkpoint_json)
        VALUES (
          ${input.targetRunId}, ${row.sequence}, ${event.eventId}, ${encodeEvent(event)},
          ${row.checkpoint_json?.replaceAll(input.source.run_id, input.targetRunId) ?? null}
        )
      `
      yield* sql`
        INSERT INTO generalist_tree_event_index (root_run_id, position, run_id, run_sequence, event_id)
        VALUES (${input.targetRunId}, ${position}, ${input.targetRunId}, ${row.sequence}, ${event.eventId})
      `
    }
    yield* sql`INSERT INTO generalist_run_registrations (run_id, pin)
      SELECT ${input.targetRunId}, pin FROM generalist_run_registrations WHERE run_id = ${input.source.run_id}`
    yield* cloneSession(input.source.session_id, sessionId, leafAt(input.events))
    return yield* loadRun(input.targetRunId)
  })

const loadOperations = (input: ForkRunInput, maximumSequence: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<OperationRow>`
      SELECT * FROM generalist_run_operations WHERE run_id = ${input.runId}
        AND completed_sequence IS NOT NULL AND completed_sequence <= ${maximumSequence}
      ORDER BY completed_sequence ASC, operation_id ASC
    `
    const substituted =
      input.substitute === undefined
        ? undefined
        : rows.find((row) => row.operation_id === input.substitute?.operationId)
    if (
      input.substitute !== undefined &&
      (substituted === undefined || substituted.kind !== "tool" || substituted.status !== "succeeded")
    ) {
      return yield* SubstitutionInvalid.make({ runId: input.runId, operationId: input.substitute.operationId })
    }
    return { rows, substituted, cutoff: substituted?.completed_sequence ?? maximumSequence }
  })

const copyOperations = (
  input: ForkRunInput,
  selected: {
    readonly rows: ReadonlyArray<OperationRow>
    readonly substituted: OperationRow | undefined
    readonly cutoff: number
  },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const { cutoff, rows, substituted } = selected
    for (const row of rows) {
      if (row.completed_sequence === null || row.completed_sequence > cutoff) continue
      const result =
        row === substituted && input.substitute !== undefined
          ? encodeJsonValue(input.substitute.result)
          : row.result_json
      const operationKey = row.operation_key.replaceAll(input.runId, input.newRunId)
      const checkpoint = row.checkpoint_json?.replaceAll(input.runId, input.newRunId) ?? null
      yield* sql`
        INSERT INTO generalist_run_operations (
          run_id, operation_id, operation_key, kind, status, input_digest, input_json, result_json, error_json,
          replay_policy, attempt, started_at, finished_at, resolution_idempotency_key, resolution_json,
          checkpoint_json, completed_sequence
        ) VALUES (
          ${input.newRunId}, ${row.operation_id}, ${operationKey}, ${row.kind}, ${row.status}, ${row.input_digest},
          ${row.input_json}, ${result}, ${row.error_json}, ${row.replay_policy}, ${row.attempt}, ${row.started_at},
          ${row.finished_at}, ${row.resolution_idempotency_key}, ${row.resolution_json}, ${checkpoint},
          ${row.completed_sequence}
        )
      `
    }
    return substituted?.checkpoint_json?.replaceAll(input.runId, input.newRunId)
  })

const forkEffect = (hub: EventHub, input: ForkRunInput) =>
  Effect.gen(function* () {
    const selected = yield* prefix(input.runId, input.atSequence)
    const operations = yield* loadOperations(input, input.atSequence)
    const checkpoint =
      (operations.substituted?.checkpoint_json ?? selected.checkpoint)?.replaceAll(input.runId, input.newRunId) ?? null
    const run = yield* copyRun({
      ...selected,
      targetRunId: input.newRunId,
      forkSequence: input.atSequence,
      checkpoint,
      status: "queued",
    })
    if (run === undefined) return yield* RunNotFound.make({ runId: input.newRunId })
    yield* copyOperations(input, operations)
    if (input.substitute !== undefined) {
      yield* appendEvent(hub, run, { _tag: "Substituted", operationId: input.substitute.operationId }, "queued")
    }
    return { runId: input.newRunId, messageId: run.message.id, acceptedSequence: 0, duplicate: false }
  })
type ForkEffect = ReturnType<typeof forkEffect>
export const fork: {
  (input: ForkRunInput): (hub: EventHub) => ForkEffect
  (hub: EventHub, input: ForkRunInput): ForkEffect
} = Function.dual(2, forkEffect)

const rewindEffect = (hub: EventHub, input: RewindRunInput) =>
  Effect.gen(function* () {
    const selected = yield* prefix(input.runId, input.toSequence)
    const fullRows = yield* (yield* SqlClient.SqlClient)<EventRow>`
      SELECT * FROM generalist_run_events WHERE run_id = ${input.runId} ORDER BY sequence ASC
    `
    const fullEvents = fullRows.map((row) => decodeEvent(row.event_json))
    yield* copyRun({
      source: selected.source,
      eventRows: fullRows,
      events: fullEvents,
      targetRunId: input.branchRunId,
      forkSequence: input.toSequence,
      checkpoint: selected.source.driver_checkpoint_json,
      status: selected.source.status,
    })
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM generalist_tree_event_index WHERE root_run_id = ${input.runId} AND position > ${input.toSequence}`
    yield* sql`DELETE FROM generalist_run_events WHERE run_id = ${input.runId} AND sequence > ${input.toSequence}`
    yield* sql`DELETE FROM generalist_run_operations WHERE run_id = ${input.runId}
      AND (completed_sequence IS NULL OR completed_sequence > ${input.toSequence})`
    yield* sql`DELETE FROM generalist_run_waits WHERE run_id = ${input.runId}`
    yield* sql`DELETE FROM generalist_run_steering WHERE run_id = ${input.runId}`
    yield* sql`UPDATE generalist_tree_roots SET last_position = ${input.toSequence} WHERE root_run_id = ${input.runId}`
    yield* sql`UPDATE generalist_sessions SET leaf_id = ${leafAt(selected.events)}, writer_run_id = NULL,
      writer_owner_id = NULL, writer_attempt_fence = NULL WHERE session_id = ${selected.source.session_id}`
    yield* sql`UPDATE generalist_runs SET status = 'queued', last_sequence = ${input.toSequence},
      last_turn_completed_sequence = CASE WHEN last_turn_completed_sequence > ${input.toSequence}
        THEN ${input.toSequence} ELSE last_turn_completed_sequence END,
      cancellation_requested = 0, cancel_reason = NULL, terminal_event_id = NULL,
      owner_worker_id = NULL, driver_checkpoint_json = ${selected.checkpoint}, suspension_json = NULL,
      continuation_json = NULL, pending_outcome_json = NULL, attempt_fence = attempt_fence + 1
      WHERE run_id = ${input.runId}`
    void hub
  })
type RewindEffect = ReturnType<typeof rewindEffect>
export const rewind: {
  (input: RewindRunInput): (hub: EventHub) => RewindEffect
  (hub: EventHub, input: RewindRunInput): RewindEffect
} = Function.dual(2, rewindEffect)
