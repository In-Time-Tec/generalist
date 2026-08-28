import { DateTime, Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { eventIdFor, type RunEvent } from "../../run/event.js"
import { decodePinned, type ExecutableManifest, type ExecutableRef } from "../../executable/manifest.js"
import type { Message } from "../../messaging/message.js"
import { isTerminal, type RunStatus } from "../../run.js"
import {
  StringArray,
  decodeJson,
  decodeEvent,
  decodeQueue,
  encodeExecutableManifest,
  encodeExecutableRef,
  encodeEvent,
  encodeJson,
  encodeMessage,
  encodeQueue,
} from "../codec/codecs.js"
import type { EventHub } from "../subscribers.js"
import type { DecodedRun, EventRow, RunRow, WaitRow } from "../codec/rows.js"
import { decodeReason, WaitResolution, type RunWait } from "../../run/wait.js"
import {
  hasPendingOperationCancellation,
  hasUnsettledChild,
  loadTerminalEvent,
  reconcileChildWaitWith,
} from "./child/settlement.js"
import { RuntimeUnavailable } from "../../errors.js"
import { admitChildSettlementFromEventId } from "../settlement-notifications.js"
import { discardPendingSteering } from "./steering/disposition.js"
import { appendTerminalToolResultsForEvent } from "../session/terminalization.js"
import { decodeRunEffect, isoFromSql as asIso } from "./run-decoding.js"
export { decodeRun, decodeRunEffect } from "./run-decoding.js"

export const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso))

const sqlBool = (sql: SqlClient.SqlClient, value: boolean): boolean | 0 | 1 =>
  sql.onDialectOrElse({
    pg: () => value,
    mysql: () => (value ? 1 : 0),
    orElse: () => (value ? 1 : 0),
  })

export const loadRun = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<RunRow>`SELECT * FROM tenetkit_runs WHERE run_id = ${runId}`
    const row = rows[0]
    return row === undefined ? undefined : yield* decodeRunEffect(row)
  })

export const hasAdmission = (input: {
  readonly address: string
  readonly sessionId: string
  readonly idempotencyKey: string
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ run_id: string }>`
      SELECT run_id FROM tenetkit_runs
      WHERE address = ${input.address}
        AND session_id = ${input.sessionId}
        AND idempotency_key = ${input.idempotencyKey}
    `
    return rows.length > 0
  })

export function decodePersistedEvents(
  rows: EventRows,
  manifest: ExecutableManifest,
): Effect.Effect<RunEvent[], RuntimeUnavailable, never>
export function decodePersistedEvents(
  manifest: ExecutableManifest,
): (rows: EventRows) => Effect.Effect<RunEvent[], RuntimeUnavailable, never>
export function decodePersistedEvents(...args: [EventRows, ExecutableManifest] | [ExecutableManifest]) {
  if (args.length === 1) return (rows: EventRows) => decodePersistedEvents(rows, args[0])
  const [rows, manifest] = args
  return Effect.forEach(rows, (row) =>
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
}
export function loadEventsAfter(
  runId: string,
  cursor: number,
): Effect.Effect<RunEvent[], RuntimeUnavailable | SqlError, SqlClient.SqlClient>
export function loadEventsAfter(
  cursor: number,
): (runId: string) => Effect.Effect<RunEvent[], RuntimeUnavailable | SqlError, SqlClient.SqlClient>
export function loadEventsAfter(...args: [string, number] | [number]) {
  if (args.length === 1) return (runId: string) => loadEventsAfter(runId, args[0])
  const [runId, cursor] = args
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return []
    const rows = yield* sql<EventRow>`
      SELECT * FROM tenetkit_run_events
      WHERE run_id = ${runId} AND sequence > ${cursor}
      ORDER BY sequence ASC
    `
    return yield* decodePersistedEvents(rows, run.executableManifest)
  })
}

export function loadRunWait(
  runId: string,
  waitId?: string,
): Effect.Effect<RunWait | undefined, SqlError, SqlClient.SqlClient>
export function loadRunWait(
  waitId?: string,
): (runId: string) => Effect.Effect<RunWait | undefined, SqlError, SqlClient.SqlClient>
export function loadRunWait(...args: [string?, string?]) {
  const [runIdOrWaitId, waitId] = args
  if (args.length < 2) return (runId: string) => loadRunWait(runId, runIdOrWaitId)
  if (runIdOrWaitId === undefined) throw new TypeError("loadRunWait requires a run id")
  const runId = runIdOrWaitId
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows =
      waitId === undefined
        ? yield* sql<WaitRow>`SELECT * FROM tenetkit_run_waits WHERE run_id = ${runId} ORDER BY opened_at DESC LIMIT 1`
        : yield* sql<WaitRow>`SELECT * FROM tenetkit_run_waits WHERE run_id = ${runId} AND wait_id = ${waitId}`
    const row = rows[0]
    if (row === undefined) return undefined
    const openedAt = asIso(row.opened_at)!
    const closedAt = asIso(row.closed_at)
    const resolution = row.response_json === null ? undefined : decodeJson(WaitResolution, row.response_json)
    return Object.assign(
      {
        waitId: row.wait_id,
        reason: decodeReason(row.reason),
        status: row.status,
        openedAt,
      },
      resolution === undefined ? {} : { resolution },
      closedAt === undefined ? {} : { closedAt },
    ) satisfies RunWait
  })
}
type EventField = RunEvent extends RunEvent ? unknown : never
type AppendInput = object & { readonly _tag: string }
export interface EventPartial {
  readonly _tag: string
  readonly [key: string]: EventField
}
type EventRows = ReadonlyArray<EventRow>
type EventEffect = Effect.Effect<RunEvent, RuntimeUnavailable | SqlError, SqlClient.SqlClient>
type TerminalEffect = Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient>
const isTerminalEvent = (event: RunEvent): boolean =>
  event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled"
const makeEvent = (run: DecodedRun, partial: EventPartial, sequence: number, occurredAt: string): RunEvent => {
  const base = {
    specVersion: "1" as const,
    eventId: eventIdFor(run.runId, sequence),
    runId: run.runId,
    sequence,
    executableRef: run.executableRef,
    rootRunId: run.rootRunId,
    depth: run.depth,
    occurredAt,
  }
  Object.assign(base, run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId })
  Object.assign(base, run.message.causationId === undefined ? {} : { causationId: run.message.causationId })
  Object.assign(base, run.message.correlationId === undefined ? {} : { correlationId: run.message.correlationId })
  Object.assign(base, run.attempt > 0 ? { attemptId: `${run.runId}:attempt:${run.attempt}` } : {})
  return decodeEvent(JSON.stringify(Object.assign(base, partial)))
}
export const appendEvent: {
  <Partial extends AppendInput>(hub: EventHub, run: DecodedRun, partial: Partial, nextStatus?: RunStatus): EventEffect
  <Partial extends AppendInput>(
    run: DecodedRun,
    partial: Partial,
    nextStatus?: RunStatus,
  ): (hub: EventHub) => EventEffect
  (hub: EventHub, run: DecodedRun, partial: EventPartial, nextStatus?: RunStatus): EventEffect
} = Function.dual(
  (args) => "publish" in args[0],
  (hub: EventHub, run: DecodedRun, partial: EventPartial, nextStatus?: RunStatus) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const discarded = yield* discardPendingSteering({ runId: run.runId, terminalTag: partial._tag })
      if (discarded !== undefined) {
        yield* appendEvent(hub, run, discarded)
        return yield* appendEvent(hub, (yield* loadRun(run.runId))!, partial, nextStatus)
      }
      yield* appendTerminalToolResultsForEvent({ run, event: partial })
      const sequence = run.lastSequence + 1
      const occurredAt = yield* nowIso
      const event = makeEvent(run, partial, sequence, occurredAt)
      yield* sql`
      INSERT INTO tenetkit_run_events (run_id, sequence, event_id, event_json)
      VALUES (${run.runId}, ${sequence}, ${event.eventId}, ${encodeEvent(event)})
    `
      yield* sql`UPDATE tenetkit_tree_roots SET last_position = last_position + 1 WHERE root_run_id = ${run.rootRunId}`
      const treeRoot = (yield* sql<{ last_position: number }>`
      SELECT last_position FROM tenetkit_tree_roots WHERE root_run_id = ${run.rootRunId}
    `)[0]!
      yield* sql`
      INSERT INTO tenetkit_tree_event_index (root_run_id, position, run_id, run_sequence, event_id)
      VALUES (${run.rootRunId}, ${treeRoot.last_position}, ${run.runId}, ${sequence}, ${event.eventId})
    `
      const status = nextStatus ?? run.status
      let activeWaitId: string | null = run.activeWaitId ?? null
      if (event._tag === "RunWaiting") activeWaitId = event.wait.waitId
      if (event._tag === "RunResumed") activeWaitId = null
      const terminalEventId = isTerminalEvent(event) ? event.eventId : (run.terminalEventId ?? null)
      const cancellationRequested = event._tag === "RunCancellationRequested" || run.cancellationRequested
      const cancelReason =
        event._tag === "RunCancellationRequested" ? (event.reason ?? null) : (run.cancelReason ?? null)
      const attempt = event._tag === "RunAttemptStarted" ? event.attempt : run.attempt
      const updated = yield* nowIso
      const terminalPartial = isTerminalEvent(event)
      if (terminalPartial) {
        yield* sql`
        UPDATE tenetkit_runs SET
          status = ${status},
          last_sequence = ${sequence},
          active_wait_id = ${activeWaitId},
          terminal_event_id = ${terminalEventId},
          cancellation_requested = ${sqlBool(sql, cancellationRequested)},
          cancel_reason = ${cancelReason},
           attempt = ${attempt},
           continuation_json = NULL,
           pending_outcome_json = NULL,
           suspension_json = NULL,
           updated_at = ${updated}
        WHERE run_id = ${run.runId}
          AND last_sequence = ${run.lastSequence}
          AND status NOT IN ('succeeded', 'failed', 'cancelled')
      `
      } else {
        yield* sql`
        UPDATE tenetkit_runs SET
          status = ${status},
          last_sequence = ${sequence},
          active_wait_id = ${activeWaitId},
          terminal_event_id = ${terminalEventId},
          cancellation_requested = ${sqlBool(sql, cancellationRequested)},
          cancel_reason = ${cancelReason},
          attempt = ${attempt},
          updated_at = ${updated}
        WHERE run_id = ${run.runId}
          AND last_sequence = ${run.lastSequence}
      `
      }
      yield* hub.publish(run.runId, event)
      return event
    }),
)

export function promoteHead(hub: EventHub, address: string, sessionId: string): TerminalEffect
export function promoteHead(address: string, sessionId: string): (hub: EventHub) => TerminalEffect
export function promoteHead(...args: [EventHub, string, string] | [string, string]) {
  if (args.length === 2) return (hub: EventHub) => promoteHead(hub, args[0], args[1])
  const [hub, address, sessionId] = args
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ queue_json: string }>`
      SELECT queue_json FROM tenetkit_lanes WHERE address = ${address} AND session_id = ${sessionId}
    `
    const lane = lanes[0]
    if (lane === undefined) return
    const queue = decodeQueue(lane.queue_json)
    const headId = queue[0]
    if (headId === undefined) return
    const head = yield* loadRun(headId)
    if (head === undefined || head.status !== "queued" || head.cancellationRequested) return
    const attempt = head.attempt + 1
    yield* sql`UPDATE tenetkit_runs SET attempt_fence = ${attempt} WHERE run_id = ${headId} AND attempt_fence = ${head.attemptFence}`
    yield* appendEvent(hub, { ...head, attempt }, { _tag: "RunAttemptStarted", attempt }, "running")
  })
}

export function removeFromLane(
  address: string,
  sessionId: string,
  runId: string,
): Effect.Effect<void, SqlError, SqlClient.SqlClient>
export function removeFromLane(
  sessionId: string,
  runId: string,
): (address: string) => Effect.Effect<void, SqlError, SqlClient.SqlClient>
export function removeFromLane(...args: [string, string, string] | [string, string]) {
  if (args.length === 2) return (address: string) => removeFromLane(address, args[0], args[1])
  const [address, sessionId, runId] = args
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ queue_json: string; accepted_sequence: number }>`
      SELECT queue_json, accepted_sequence FROM tenetkit_lanes WHERE address = ${address} AND session_id = ${sessionId}
    `
    const lane = lanes[0]
    if (lane === undefined) return
    const queue = decodeQueue(lane.queue_json).filter((id) => id !== runId)
    if (queue.length === 0) {
      yield* sql`DELETE FROM tenetkit_lanes WHERE address = ${address} AND session_id = ${sessionId}`
    } else {
      yield* sql`
        UPDATE tenetkit_lanes SET queue_json = ${encodeQueue(queue)}
        WHERE address = ${address} AND session_id = ${sessionId}
      `
    }
  })
}

export function afterTerminal(
  run: DecodedRun,
): (hub: EventHub) => Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient>
export function afterTerminal(
  hub: EventHub,
  run: DecodedRun,
): Effect.Effect<void, RuntimeUnavailable | SqlError, SqlClient.SqlClient>
export function afterTerminal(...args: [EventHub, DecodedRun] | [DecodedRun]) {
  if (args.length === 1) return (hub: EventHub) => afterTerminal(hub, args[0])
  const [hub, run] = args
  return Effect.gen(function* () {
    yield* removeFromLane(run.address, run.sessionId, run.runId)
    yield* promoteHead(hub, run.address, run.sessionId)
  })
}

const isQueuedRun = (run: DecodedRun | undefined): run is DecodedRun => run?.status === "queued"
const isCancellableRun = (run: DecodedRun | undefined): run is DecodedRun =>
  run?.status === "cancelling" && run.ownerWorkerId === undefined
export const settleParent: {
  (hub: EventHub, child: DecodedRun, terminalEventId: string): TerminalEffect
  (child: DecodedRun, terminalEventId: string): (hub: EventHub) => TerminalEffect
  (hub: EventHub, child: DecodedRun, terminalEventId: string): TerminalEffect
} = Function.dual(3, (hub: EventHub, child: DecodedRun, terminalEventId: string) =>
  Effect.gen(function* () {
    if (child.parentRunId === undefined) return
    const sql = yield* SqlClient.SqlClient
    const parent = yield* loadRun(child.parentRunId)
    if (parent === undefined) return
    const existing = yield* sql<{ child_run_id: string }>`
      SELECT child_run_id FROM tenetkit_run_links
      WHERE parent_run_id = ${parent.runId} AND child_run_id = ${child.runId} AND terminal_event_id IS NOT NULL
    `
    if (existing.length > 0) return
    const settledAt = yield* nowIso
    yield* sql`
      UPDATE tenetkit_run_links
      SET readiness = 'settled', terminal_event_id = ${terminalEventId}, settled_at = ${settledAt}
      WHERE parent_run_id = ${parent.runId} AND child_run_id = ${child.runId}
    `
    yield* admitChildSettlementFromEventId({ parent, child, terminalEventId })
    if (!isTerminal(parent.status)) {
      yield* appendEvent(hub, parent, {
        _tag: "ChildReadinessChanged",
        childRunId: child.runId,
        readiness: "settled",
      })
      yield* appendEvent(hub, (yield* loadRun(parent.runId))!, {
        _tag: "ChildSettled",
        childRunId: child.runId,
        terminalEventId,
      })
    }
    const { reconcileFanOut } = yield* Effect.promise(() => import("./fan-out/service.js"))
    yield* reconcileFanOut(hub, child.runId, terminalEventId, settleParent)
    let currentParent = yield* loadRun(parent.runId)
    const terminalEvent = yield* loadTerminalEvent(terminalEventId)
    if (currentParent !== undefined && terminalEvent !== undefined) {
      const reconciliation: TerminalEffect = reconcileChildWaitWith({
        hub,
        parent: currentParent,
        child,
        event: terminalEvent,
        append: appendEvent,
      })
      yield* reconciliation
      currentParent = yield* loadRun(parent.runId)
    }
    if (isQueuedRun(currentParent) && !(yield* hasUnsettledChild(parent.runId))) {
      const attempt = currentParent.attempt + 1
      yield* sql`UPDATE tenetkit_runs SET attempt_fence = ${attempt} WHERE run_id = ${parent.runId}`
      yield* appendEvent(hub, { ...currentParent, attempt }, { _tag: "RunAttemptStarted", attempt }, "running")
      return
    }
    if (!isCancellableRun(currentParent)) return
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${parent.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) return
    if (yield* hasPendingOperationCancellation(parent.runId)) return
    if (yield* hasUnsettledChild(parent.runId)) return
    const cancellation = Object.assign(
      { _tag: "RunCancelled" as const },
      currentParent.cancelReason === undefined ? {} : { reason: currentParent.cancelReason },
    )
    const cancelled = yield* appendEvent(hub, currentParent, cancellation, "cancelled")
    const settledParent = (yield* loadRun(parent.runId))!
    yield* settleParent(hub, settledParent, cancelled.eventId)
    yield* afterTerminal(hub, settledParent)
  }),
)

export const insertRun = (input: {
  readonly runId: string
  readonly status: RunStatus
  readonly message: Message
  readonly digest: string
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly rootRunId: string
  readonly depth: number
  readonly treePolicy: import("../../tree/policy.js").TreePolicy
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly acceptedSequence: number
  readonly attempt?: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const created = yield* nowIso
    yield* sql`
      INSERT INTO tenetkit_runs (
        run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
        executable_ref_json, executable_manifest_json, root_run_id, depth, max_depth, max_subagents, parent_run_id, invocation_id, active_wait_id, attempt, attempt_fence,
        last_sequence, cancellation_requested, cancel_reason, terminal_event_id, accepted_sequence,
        responded_wait_ids_json, created_at, updated_at
      ) VALUES (
        ${input.runId}, ${input.status}, ${input.message.to}, ${input.message.sessionId}, ${input.message.id},
        ${encodeMessage(input.message)}, ${input.digest}, ${input.message.idempotencyKey},
        ${encodeExecutableRef(input.executableRef)}, ${encodeExecutableManifest(input.executableManifest)},
        ${input.rootRunId}, ${input.depth}, ${input.treePolicy.maxDepth}, ${input.treePolicy.maxSubagents}, ${input.parentRunId ?? null}, ${input.invocationId ?? null},
        NULL, ${input.attempt ?? 0}, ${input.attempt ?? 0}, -1, ${sqlBool(sql, false)}, NULL, NULL, ${input.acceptedSequence},
        ${encodeJson(StringArray, [])}, ${created}, ${created}
      )
    `
    if (input.runId === input.rootRunId) {
      yield* sql`INSERT INTO tenetkit_tree_roots (root_run_id) VALUES (${input.runId})`
    }
  })

export { toOperationRecord } from "../operations.js"
