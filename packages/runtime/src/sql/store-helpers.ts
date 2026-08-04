import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { eventIdFor, type AgentLoopEvent, type AgentResult, type RunEvent, type RunFailure } from "../run-event.js"
import type { ExecutableManifest, ExecutableRef } from "../executable-manifest.js"
import type { Message } from "../message.js"
import { isTerminal, type RunStatus } from "../run.js"
import {
  decodePinnedExecutable,
  decodeEvent,
  decodeMessage,
  decodeQueue,
  encodeExecutableManifest,
  encodeExecutableRef,
  encodeEvent,
  encodeMessage,
  encodeQueue,
} from "./codecs.js"
import type { EventHub } from "./subscribers.js"
import type { DecodedRun, EventRow, OperationRow, RunRow } from "./rows.js"
import type { WaitRow } from "./rows.js"
import { WaitResolution, type RunWait } from "../run-wait.js"
import { Schema } from "effect"
import type { OperationRecord } from "./operations.js"
import { decodeContinuation } from "../steering.js"
import { reconcileFanOut } from "./store-fan-out.js"
import { RuntimeUnavailable } from "../errors.js"
import { DurableDriver } from "@batonfx/core"
import { checkpointRef, decodePinned } from "../executable-manifest.js"

export const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso))

const asBool = (value: number | boolean): boolean => value === true || Number(value) === 1

const asIso = (value: string | Date | null | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined
  return value instanceof Date ? value.toISOString() : value
}

export const decodeRun = (row: RunRow): DecodedRun => {
  const executable = decodePinnedExecutable(row.executable_ref_json, row.executable_manifest_json)
  const checkpoint =
    row.driver_checkpoint_json === null || row.driver_checkpoint_json === undefined
      ? undefined
      : Schema.decodeUnknownSync(DurableDriver.DriverCheckpoint)(JSON.parse(row.driver_checkpoint_json))
  const checkpointExecutable = checkpointRef(executable.ref, executable.manifest, checkpoint)
  if (
    checkpointExecutable.executable !== executable.ref.executable ||
    checkpointExecutable.active !== executable.ref.active
  ) {
    throw new TypeError("Persisted checkpoint executable does not match Run executable")
  }
  return {
    runId: row.run_id,
    status: row.status,
    address: row.address,
    sessionId: row.session_id,
    message: decodeMessage(row.message_json),
    messageDigest: row.message_digest,
    executableRef: executable.ref,
    executableManifest: executable.manifest,
    rootRunId: row.root_run_id,
    attempt: Number(row.attempt),
    attemptFence: Number(row.attempt_fence),
    lastSequence: Number(row.last_sequence),
    cancellationRequested: asBool(row.cancellation_requested),
    acceptedSequence: Number(row.accepted_sequence),
    respondedWaitIds: new Set(JSON.parse(row.responded_wait_ids_json) as ReadonlyArray<string>),
    ...(row.parent_run_id === null || row.parent_run_id === undefined ? {} : { parentRunId: row.parent_run_id }),
    ...(row.invocation_id === null || row.invocation_id === undefined ? {} : { invocationId: row.invocation_id }),
    ...(row.active_wait_id === null || row.active_wait_id === undefined ? {} : { activeWaitId: row.active_wait_id }),
    ...(row.cancel_reason === null || row.cancel_reason === undefined ? {} : { cancelReason: row.cancel_reason }),
    ...(row.terminal_event_id === null || row.terminal_event_id === undefined
      ? {}
      : { terminalEventId: row.terminal_event_id }),
    ...(row.owner_worker_id === null || row.owner_worker_id === undefined
      ? {}
      : { ownerWorkerId: row.owner_worker_id }),
    ...(checkpoint === undefined ? {} : { driverCheckpoint: checkpoint }),
    ...(row.suspension_json === null || row.suspension_json === undefined
      ? {}
      : { suspension: JSON.parse(row.suspension_json) }),
    ...(row.transcript_json === null || row.transcript_json === undefined
      ? {}
      : { transcript: JSON.parse(row.transcript_json) }),
    ...(row.continuation_json === null || row.continuation_json === undefined
      ? {}
      : { continuation: decodeContinuation(row.continuation_json) }),
    ...(() => {
      const lease = asIso(row.lease_expires_at)
      return lease === undefined ? {} : { leaseExpiresAt: lease }
    })(),
  }
}

export const decodeRunEffect = (row: RunRow): Effect.Effect<DecodedRun, RuntimeUnavailable> =>
  Effect.try({
    try: () => decodeRun(row),
    catch: (error) => RuntimeUnavailable.make({ message: `invalid persisted Run ${row.run_id}: ${String(error)}` }),
  })

export const loadRun = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<RunRow>`SELECT * FROM baton_runs WHERE run_id = ${runId}`
    const row = rows[0]
    return row === undefined ? undefined : yield* decodeRunEffect(row)
  })

export const decodePersistedEvents = (rows: ReadonlyArray<EventRow>, manifest: ExecutableManifest) =>
  Effect.forEach(rows, (row) =>
    Effect.try({
      try: () => {
        const event = decodeEvent(row.event_json)
        decodePinned({ ref: event.executableRef, manifest })
        return event
      },
      catch: (error) =>
        RuntimeUnavailable.make({ message: `invalid persisted Run event ${row.event_id}: ${String(error)}` }),
    }),
  )

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

export const loadRunWait = (runId: string, waitId?: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows =
      waitId === undefined
        ? yield* sql<WaitRow>`SELECT * FROM baton_run_waits WHERE run_id = ${runId} ORDER BY opened_at DESC LIMIT 1`
        : yield* sql<WaitRow>`SELECT * FROM baton_run_waits WHERE run_id = ${runId} AND wait_id = ${waitId}`
    const row = rows[0]
    if (row === undefined) return undefined
    const openedAt = asIso(row.opened_at)!
    const closedAt = asIso(row.closed_at)
    const resolution =
      row.response_json === null ? undefined : Schema.decodeUnknownSync(WaitResolution)(JSON.parse(row.response_json))
    return {
      waitId: row.wait_id,
      reason: row.reason,
      status: row.status,
      openedAt,
      ...(resolution === undefined ? {} : { resolution }),
      ...(closedAt === undefined ? {} : { closedAt }),
    } satisfies RunWait
  })

export type EventPartial = { readonly _tag: string } & Record<string, unknown>

export const appendEvent = (hub: EventHub, run: DecodedRun, partial: EventPartial, nextStatus?: RunStatus) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sequence = run.lastSequence + 1
    const occurredAt = yield* nowIso
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
    yield* sql`UPDATE baton_tree_roots SET last_position = last_position + 1 WHERE root_run_id = ${run.rootRunId}`
    const treeRoot = (yield* sql<{ last_position: number }>`
      SELECT last_position FROM baton_tree_roots WHERE root_run_id = ${run.rootRunId}
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
    const cancellationRequested = event._tag === "RunCancellationRequested" || run.cancellationRequested ? 1 : 0
    const cancelReason =
      event._tag === "RunCancellationRequested" && "reason" in event && typeof event.reason === "string"
        ? event.reason
        : (run.cancelReason ?? null)
    const attempt = event._tag === "RunAttemptStarted" ? event.attempt : run.attempt
    const updated = yield* nowIso
    const terminalPartial = event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled"
    if (terminalPartial) {
      yield* sql`
        UPDATE baton_runs SET
          status = ${status},
          last_sequence = ${sequence},
          active_wait_id = ${activeWaitId},
          terminal_event_id = ${terminalEventId},
          cancellation_requested = ${cancellationRequested},
          cancel_reason = ${cancelReason},
          attempt = ${attempt},
          continuation_json = NULL,
          updated_at = ${updated}
        WHERE run_id = ${run.runId}
          AND last_sequence = ${run.lastSequence}
          AND status NOT IN ('succeeded', 'failed', 'cancelled')
      `
    } else {
      yield* sql`
        UPDATE baton_runs SET
          status = ${status},
          last_sequence = ${sequence},
          active_wait_id = ${activeWaitId},
          terminal_event_id = ${terminalEventId},
          cancellation_requested = ${cancellationRequested},
          cancel_reason = ${cancelReason},
          attempt = ${attempt},
          updated_at = ${updated}
        WHERE run_id = ${run.runId}
          AND last_sequence = ${run.lastSequence}
      `
    }
    yield* hub.publish(run.runId, event)
    return event
  })

export const promoteHead = (hub: EventHub, address: string, sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ queue_json: string }>`
      SELECT queue_json FROM baton_lanes WHERE address = ${address} AND session_id = ${sessionId}
    `
    const lane = lanes[0]
    if (lane === undefined) return
    const queue = decodeQueue(lane.queue_json)
    const headId = queue[0]
    if (headId === undefined) return
    const head = yield* loadRun(headId)
    if (head === undefined || head.status !== "queued" || head.cancellationRequested) return
    const attempt = head.attempt + 1
    yield* sql`UPDATE baton_runs SET attempt_fence = ${attempt} WHERE run_id = ${headId} AND attempt_fence = ${head.attemptFence}`
    yield* appendEvent(hub, { ...head, attempt }, { _tag: "RunAttemptStarted", attempt }, "running")
  })

export const removeFromLane = (address: string, sessionId: string, runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ queue_json: string; accepted_sequence: number }>`
      SELECT queue_json, accepted_sequence FROM baton_lanes WHERE address = ${address} AND session_id = ${sessionId}
    `
    const lane = lanes[0]
    if (lane === undefined) return
    const queue = decodeQueue(lane.queue_json).filter((id) => id !== runId)
    if (queue.length === 0) {
      yield* sql`DELETE FROM baton_lanes WHERE address = ${address} AND session_id = ${sessionId}`
    } else {
      yield* sql`
        UPDATE baton_lanes SET queue_json = ${encodeQueue(queue)}
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
): Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    if (child.parentRunId === undefined) return
    const sql = yield* SqlClient.SqlClient
    const parent = yield* loadRun(child.parentRunId)
    if (parent === undefined) return
    const existing = yield* sql<{ child_run_id: string }>`
      SELECT child_run_id FROM baton_run_links
      WHERE parent_run_id = ${parent.runId} AND child_run_id = ${child.runId} AND terminal_event_id IS NOT NULL
    `
    if (existing.length > 0) return
    const settledAt = yield* nowIso
    yield* sql`
      UPDATE baton_run_links
      SET terminal_event_id = ${terminalEventId}, settled_at = ${settledAt}
      WHERE parent_run_id = ${parent.runId} AND child_run_id = ${child.runId}
    `
    if (!isTerminal(parent.status)) {
      yield* appendEvent(hub, parent, {
        _tag: "ChildSettled",
        childRunId: child.runId,
        terminalEventId,
      })
    }
    yield* reconcileFanOut(hub, child.runId, terminalEventId)
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
    const created = yield* nowIso
    yield* sql`
      INSERT INTO baton_runs (
        run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
        executable_ref_json, executable_manifest_json, root_run_id, parent_run_id, invocation_id, active_wait_id, attempt, attempt_fence,
        last_sequence, cancellation_requested, cancel_reason, terminal_event_id, accepted_sequence,
        responded_wait_ids_json, created_at, updated_at
      ) VALUES (
        ${input.runId}, ${input.status}, ${input.message.to}, ${input.message.sessionId}, ${input.message.id},
        ${encodeMessage(input.message)}, ${input.digest}, ${input.message.idempotencyKey},
        ${encodeExecutableRef(input.executableRef)}, ${encodeExecutableManifest(input.executableManifest)},
        ${input.rootRunId}, ${input.parentRunId ?? null}, ${input.invocationId ?? null},
        NULL, ${input.attempt ?? 0}, ${input.attempt ?? 0}, -1, 0, NULL, NULL, ${input.acceptedSequence},
        ${JSON.stringify([])}, ${created}, ${created}
      )
    `
    if (input.runId === input.rootRunId) {
      yield* sql`INSERT INTO baton_tree_roots (root_run_id) VALUES (${input.runId})`
    }
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

export type { AgentLoopEvent, AgentResult, RunFailure }
