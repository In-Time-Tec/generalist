import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { PgClient } from "@effect/sql-pg"
import { eventIdFor, type RunEvent } from "../../run-event.js"
import type { ExecutableManifest, ExecutableRef } from "../../executable-manifest.js"
import type { Message } from "../../message.js"
import { isTerminal, type RunStatus } from "../../run.js"
import {
  decodeMessage,
  decodeQueue,
  encodeExecutableManifest,
  encodeExecutableRef,
  encodeEvent,
  encodeMessage,
  encodeQueue,
} from "../codecs.js"
import type { EventHub } from "../subscribers.js"
import { reconcileFanOutWith } from "../store-fan-out.js"
import type { DecodedRun, EventRow, OperationRow, RunRow } from "../rows.js"
import type { OperationRecord } from "../operations.js"
import { decodePersistedEvents, decodeRunEffect } from "../store-helpers.js"
import { NOTIFY_CHANNEL } from "./schema.js"
import type { AgentLoopEvent } from "../../agent-event.js"
import type { ExecutionClaim } from "../../run-store.js"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { StaleClaim } from "../errors.js"

export type EventPartial = { readonly _tag: string } & Record<string, unknown>

export const loadRun = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<RunRow>`SELECT * FROM baton_runs WHERE run_id = ${runId}`
    const row = rows[0]
    return row === undefined ? undefined : yield* decodeRunEffect(row)
  })

export const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((loaded) =>
      loaded === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(loaded),
    ),
  )

export const lockSpawnParent = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${runId} FOR UPDATE`
    const parent = yield* loadRun(runId)
    if (parent === undefined) return yield* RunNotFound.make({ runId })
    if (isTerminal(parent.status)) return yield* RunTerminal.make({ runId, status: parent.status })
    return parent
  })

export const emitAgentEvent = (hub: EventHub, input: ExecutionClaim & { readonly event: AgentLoopEvent }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${input.runId} FOR UPDATE`
    const loaded = yield* loadRun(input.runId)
    if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (loaded.ownerWorkerId !== input.ownerId || loaded.attemptFence !== input.attemptFence) {
      return yield* StaleClaim.make({
        runId: input.runId,
        workerId: input.ownerId,
        attemptFence: input.attemptFence,
      })
    }
    if (isTerminal(loaded.status)) return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
    yield* appendEvent(hub, loaded, input.event as EventPartial)
    if (input.event._tag === "TurnCompleted") {
      yield* sql`
        UPDATE baton_runs SET transcript_json = ${JSON.stringify(input.event.transcript)}, continuation_json = NULL
        WHERE run_id = ${loaded.runId}
      `
    }
  })

export const loadEventsAfter = (runId: string, cursor: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return []
    const rows = yield* sql<EventRow>`
      SELECT * FROM baton_run_events
      WHERE run_id = ${runId} AND sequence > ${cursor}
      ORDER BY sequence ASC
    `
    return yield* decodePersistedEvents(rows, run.executableManifest)
  })

export const allocateSequence = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ last_sequence: number }>`
      UPDATE baton_runs
      SET last_sequence = last_sequence + 1, updated_at = NOW()
      WHERE run_id = ${runId}
      RETURNING last_sequence
    `
    return Number(rows[0]!.last_sequence)
  })

export const appendEvent = (_hub: EventHub, run: DecodedRun, partial: EventPartial, nextStatus?: RunStatus) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const pg = yield* PgClient.PgClient
    const sequence = yield* allocateSequence(run.runId)
    const occurredAt = new Date().toISOString()
    const event = {
      specVersion: "1" as const,
      eventId: eventIdFor(run.runId, sequence),
      runId: run.runId,
      sequence,
      executableRef: run.executableRef,
      rootRunId: run.rootRunId,
      occurredAt,
      ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
      ...(run.message.causationId === undefined ? {} : { causationId: run.message.causationId }),
      ...(run.message.correlationId === undefined ? {} : { correlationId: run.message.correlationId }),
      ...(run.attempt > 0 ? { attemptId: `${run.runId}:attempt:${run.attempt}` } : {}),
      ...partial,
    } as RunEvent
    yield* sql`
      INSERT INTO baton_run_events (run_id, sequence, event_id, event_json)
      VALUES (${run.runId}, ${sequence}, ${event.eventId}, ${encodeEvent(event)})
    `
    const treeRoot = (yield* sql<{ last_position: number }>`
      UPDATE baton_tree_roots SET last_position = last_position + 1
      WHERE root_run_id = ${run.rootRunId} RETURNING last_position
    `)[0]!
    yield* sql`
      INSERT INTO baton_tree_event_index (root_run_id, position, run_id, run_sequence, event_id)
      VALUES (${run.rootRunId}, ${Number(treeRoot.last_position)}, ${run.runId}, ${sequence}, ${event.eventId})
    `
    const status = nextStatus ?? run.status
    const activeWaitId =
      event._tag === "RunWaiting" ? event.wait.waitId : event._tag === "RunResumed" ? null : (run.activeWaitId ?? null)
    const terminalEventId =
      event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled"
        ? event.eventId
        : (run.terminalEventId ?? null)
    const cancellationRequested = event._tag === "RunCancellationRequested" || run.cancellationRequested
    const cancelReason =
      event._tag === "RunCancellationRequested" && "reason" in event && typeof event.reason === "string"
        ? event.reason
        : (run.cancelReason ?? null)
    const attempt = event._tag === "RunAttemptStarted" ? event.attempt : run.attempt
    const terminalPartial = event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled"
    if (terminalPartial) {
      yield* sql`
        UPDATE baton_runs SET
          status = ${status},
          active_wait_id = ${activeWaitId},
          terminal_event_id = ${terminalEventId},
          cancellation_requested = ${cancellationRequested},
          cancel_reason = ${cancelReason},
          attempt = ${attempt},
          owner_worker_id = NULL,
          lease_expires_at = NULL,
          updated_at = NOW()
        WHERE run_id = ${run.runId}
          AND status NOT IN ('succeeded', 'failed', 'cancelled')
      `
    } else {
      yield* sql`
        UPDATE baton_runs SET
          status = ${status},
          active_wait_id = ${activeWaitId},
          terminal_event_id = ${terminalEventId},
          cancellation_requested = ${cancellationRequested},
          cancel_reason = ${cancelReason},
          attempt = ${attempt},
          continuation_json = NULL,
          updated_at = NOW()
        WHERE run_id = ${run.runId}
      `
    }
    yield* pg.notify(NOTIFY_CHANNEL, run.runId)
    return event
  })

export const promoteHead = (hub: EventHub, address: string, sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ head_run_id: string | null; queue_json: string }>`
      SELECT head_run_id, queue_json FROM baton_lanes
      WHERE address = ${address} AND session_id = ${sessionId}
      FOR UPDATE
    `
    const lane = lanes[0]
    if (lane === undefined) return
    const queue = decodeQueue(lane.queue_json)
    const headId = lane.head_run_id ?? queue[0]
    if (headId === undefined) return
    if (lane.head_run_id !== headId) {
      yield* sql`
        UPDATE baton_lanes SET head_run_id = ${headId}
        WHERE address = ${address} AND session_id = ${sessionId}
      `
    }
    const head = yield* loadRun(headId)
    if (head === undefined || head.status !== "queued" || head.cancellationRequested) return
  })

export const removeFromLane = (address: string, sessionId: string, runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ queue_json: string }>`
      SELECT queue_json FROM baton_lanes
      WHERE address = ${address} AND session_id = ${sessionId}
      FOR UPDATE
    `
    const lane = lanes[0]
    if (lane === undefined) return
    const queue = decodeQueue(lane.queue_json).filter((id) => id !== runId)
    if (queue.length === 0) {
      yield* sql`DELETE FROM baton_lanes WHERE address = ${address} AND session_id = ${sessionId}`
    } else {
      yield* sql`
        UPDATE baton_lanes
        SET queue_json = ${encodeQueue(queue)}, head_run_id = ${queue[0]!}
        WHERE address = ${address} AND session_id = ${sessionId}
      `
    }
  })

export const afterTerminal = (hub: EventHub, run: DecodedRun) =>
  Effect.gen(function* () {
    yield* removeFromLane(run.address, run.sessionId, run.runId)
    yield* promoteHead(hub, run.address, run.sessionId)
  })

export const settleParent = (
  hub: EventHub,
  child: DecodedRun,
  terminalEventId: string,
): Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient | PgClient.PgClient> =>
  Effect.gen(function* () {
    if (child.parentRunId === undefined) return
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${child.parentRunId} FOR UPDATE`
    const parent = yield* loadRun(child.parentRunId)
    if (parent === undefined) return
    const existing = yield* sql<{ child_run_id: string }>`
      SELECT child_run_id FROM baton_run_links
      WHERE parent_run_id = ${parent.runId} AND child_run_id = ${child.runId} AND terminal_event_id IS NOT NULL
    `
    if (existing.length > 0) return
    yield* sql`
      UPDATE baton_run_links
      SET terminal_event_id = ${terminalEventId}, settled_at = NOW()
      WHERE parent_run_id = ${parent.runId} AND child_run_id = ${child.runId}
    `
    if (!isTerminal(parent.status)) {
      yield* appendEvent(hub, parent, {
        _tag: "ChildSettled",
        childRunId: child.runId,
        terminalEventId,
      })
    }
    yield* reconcileFanOutWith(hub, child.runId, terminalEventId, appendEvent)
    const currentParent = yield* loadRun(parent.runId)
    if (currentParent?.status !== "cancelling" || currentParent.ownerWorkerId !== undefined) return
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${parent.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) return
    const cancelled = yield* appendEvent(
      hub,
      currentParent,
      {
        _tag: "RunCancelled",
        ...(currentParent.cancelReason === undefined ? {} : { reason: currentParent.cancelReason }),
      },
      "cancelled",
    )
    const settledParent = (yield* loadRun(parent.runId))!
    yield* settleParent(hub, settledParent, cancelled.eventId)
    yield* afterTerminal(hub, settledParent)
  })

export const insertRun = (input: {
  readonly runId: string
  readonly status: RunStatus
  readonly message: Message
  readonly digest: string
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly rootRunId: string
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly acceptedSequence: number
  readonly attempt?: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO baton_runs (
        run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
        executable_ref_json, executable_manifest_json, root_run_id, parent_run_id, invocation_id, active_wait_id, attempt, attempt_fence,
        last_sequence, cancellation_requested, cancel_reason, terminal_event_id, accepted_sequence,
        responded_wait_ids_json, owner_worker_id, lease_expires_at, created_at, updated_at
      ) VALUES (
        ${input.runId}, ${input.status}, ${input.message.to}, ${input.message.sessionId}, ${input.message.id},
        ${encodeMessage(input.message)}, ${input.digest}, ${input.message.idempotencyKey},
        ${encodeExecutableRef(input.executableRef)}, ${encodeExecutableManifest(input.executableManifest)},
        ${input.rootRunId}, ${input.parentRunId ?? null}, ${input.invocationId ?? null},
        NULL, ${input.attempt ?? 0}, ${input.attempt ?? 0}, -1, FALSE, NULL, NULL, ${input.acceptedSequence},
        ${JSON.stringify([])}, NULL, NULL, NOW(), NOW()
      )
    `
    if (input.runId === input.rootRunId) {
      yield* sql`INSERT INTO baton_tree_roots (root_run_id) VALUES (${input.runId})`
    }
  })

export const enqueueLane = (address: string, sessionId: string, runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ accepted_sequence: string | number; queue_json: string; head_run_id: string | null }>`
      SELECT accepted_sequence, queue_json, head_run_id FROM baton_lanes
      WHERE address = ${address} AND session_id = ${sessionId}
      FOR UPDATE
    `
    const lane = lanes[0]
    if (lane === undefined) {
      yield* sql`
        INSERT INTO baton_lanes (address, session_id, accepted_sequence, queue_json, head_run_id)
        VALUES (${address}, ${sessionId}, 0, ${encodeQueue([runId])}, ${runId})
      `
      return { acceptedSequence: 0, isHead: true }
    }
    const acceptedSequence = Number(lane.accepted_sequence) + 1
    const queue = [...decodeQueue(lane.queue_json), runId]
    const head = lane.head_run_id ?? queue[0]!
    yield* sql`
      UPDATE baton_lanes
      SET accepted_sequence = ${acceptedSequence}, queue_json = ${encodeQueue(queue)}, head_run_id = ${head}
      WHERE address = ${address} AND session_id = ${sessionId}
    `
    return { acceptedSequence, isHead: head === runId }
  })

export const toOperationRecord = (row: OperationRow): OperationRecord => ({
  runId: row.run_id,
  operationId: row.operation_id,
  operationKey: row.operation_key,
  kind: row.kind,
  status: row.status,
  inputDigest: row.input_digest,
  input: JSON.parse(row.input_json) as unknown,
  replayPolicy: row.replay_policy,
  attempt: Number(row.attempt),
  ...(row.result_json === null ? {} : { result: JSON.parse(row.result_json) as unknown }),
  ...(row.error_json === null ? {} : { error: JSON.parse(row.error_json) as unknown }),
  ...(row.resolution_idempotency_key === null ? {} : { resolutionIdempotencyKey: row.resolution_idempotency_key }),
  ...(row.resolution_json === null ? {} : { resolution: JSON.parse(row.resolution_json) }),
})

export { decodeMessage, encodeQueue, decodeQueue }
