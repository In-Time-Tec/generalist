import { Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { PgClient } from "@effect/sql-pg"
import { eventIdFor, type RunEvent } from "tenetkit/runtime/driver/run/event"
import type { ExecutableManifest, ExecutableRef } from "tenetkit/runtime/driver/executable/manifest"
import type { Message } from "tenetkit/runtime/driver/messaging/message"
import { isTerminal, type RunStatus } from "tenetkit/runtime/driver/run"
import {
  StringArray,
  decodeMessage,
  decodeEvent,
  decodeQueue,
  encodeExecutableManifest,
  encodeExecutableRef,
  encodeEvent,
  encodeJson,
  encodeMessage,
  encodeQueue,
} from "tenetkit/runtime/driver/sql/codec/codecs"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { reconcileFanOutWith } from "tenetkit/runtime/driver/sql/store/fan-out/service"
import type { DecodedRun, EventRow, RunRow } from "tenetkit/runtime/driver/sql/codec/rows"
import { decodePersistedEvents, decodeRunEffect, nowIso } from "tenetkit/runtime/driver/sql/store/statements"
import type { EmittableAgentLoopEvent } from "tenetkit/runtime/driver/execution/agent/event"
import { PendingRunOutcome, type ExecutionClaim } from "tenetkit/runtime/driver/run/store"
import type { ExecutionResult } from "tenetkit/runtime/driver/execution/state"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { StaleClaim } from "tenetkit/runtime/driver/sql/errors"
import { notifyRun } from "../events/transaction-events.js"
import { admitChildSettlementFromEventId } from "tenetkit/runtime/driver/sql/settlement-notifications"
import { discardPendingSteering } from "tenetkit/runtime/driver/sql/store/steering/disposition"
import {
  hasPendingOperationCancellation,
  hasUnsettledChild,
  loadTerminalEvent,
  reconcileChildWaitWith,
} from "tenetkit/runtime/driver/sql/store/child/settlement"
import { appendTerminalToolResultsForEvent } from "tenetkit/runtime/driver/sql/session/terminalization"

type StoreError = RuntimeUnavailable | SqlError
type StoreEffect<A> = Effect.Effect<A, StoreError, SqlClient.SqlClient>
type SqlOnlyEffect<A> = Effect.Effect<A, SqlError, SqlClient.SqlClient>
type RunEventEffect = Effect.Effect<RunEvent, RuntimeUnavailable | SqlError, SqlClient.SqlClient>
type LaneEffect = Effect.Effect<{ acceptedSequence: number; isHead: boolean }, SqlError, SqlClient.SqlClient>
type AgentEventError = RunNotFound | RunTerminal | StoreError | StaleClaim
type AgentEventEffect = Effect.Effect<undefined, AgentEventError, SqlClient.SqlClient>
type CompleteRunEffect = Effect.Effect<undefined, RunTerminal | StoreError, SqlClient.SqlClient>
type SettleParentEffect = Effect.Effect<void, StoreError, SqlClient.SqlClient | PgClient.PgClient>
type EventField = RunEvent extends RunEvent ? unknown : never
type AppendInput = object & { readonly _tag: string }
export interface EventPartial {
  readonly _tag: string
  readonly [key: string]: EventField
}

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

export const loadRun = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<RunRow>`SELECT * FROM tenetkit_runs WHERE run_id = ${runId}`
    const row = rows[0]
    return row === undefined ? undefined : yield* decodeRunEffect(row)
  })

export const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((loaded) =>
      loaded === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(loaded),
    ),
  )

export const emitAgentEvent: {
  (input: ExecutionClaim & { readonly event: EmittableAgentLoopEvent }): (hub: EventHub) => AgentEventEffect
  (hub: EventHub, input: ExecutionClaim & { readonly event: EmittableAgentLoopEvent }): AgentEventEffect
} = Function.dual(2, (hub: EventHub, input: ExecutionClaim & { readonly event: EmittableAgentLoopEvent }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT run_id FROM tenetkit_runs WHERE run_id = ${input.runId} FOR UPDATE`
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
    yield* appendEvent(hub, loaded, input.event)
    if (input.event._tag === "TurnCompleted") {
      yield* sql`UPDATE tenetkit_runs SET continuation_json = NULL WHERE run_id = ${loaded.runId}`
    }
  }),
)

export const loadEventsAfter: {
  (cursor: number): (runId: string) => StoreEffect<RunEvent[]>
  (runId: string, cursor: number): StoreEffect<RunEvent[]>
} = Function.dual(2, (runId: string, cursor: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* loadRun(runId)
    if (run === undefined) return []
    const rows = yield* sql<EventRow>`
      SELECT * FROM tenetkit_run_events
      WHERE run_id = ${runId} AND sequence > ${cursor}
      ORDER BY sequence ASC
    `
    return yield* decodePersistedEvents(rows, run.executableManifest)
  }),
)

export const allocateSequence = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ last_sequence: number }>`
      UPDATE tenetkit_runs
      SET last_sequence = last_sequence + 1, updated_at = NOW()
      WHERE run_id = ${runId}
      RETURNING last_sequence
    `
    return rows[0]!.last_sequence
  })

export const appendEvent: {
  <Partial extends AppendInput>(
    run: DecodedRun,
    partial: Partial,
    nextStatus?: RunStatus,
  ): (hub: EventHub) => RunEventEffect
  <Partial extends AppendInput>(
    hub: EventHub,
    run: DecodedRun,
    partial: Partial,
    nextStatus?: RunStatus,
  ): RunEventEffect
  (hub: EventHub, run: DecodedRun, partial: EventPartial, nextStatus?: RunStatus): RunEventEffect
} = Function.dual(
  (args) => args.length >= 4 || (args.length === 3 && !("runId" in args[0])),
  (_hub: EventHub, run: DecodedRun, partial: EventPartial, nextStatus?: RunStatus) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const discarded = yield* discardPendingSteering({ runId: run.runId, terminalTag: partial._tag })
      if (discarded !== undefined) {
        yield* appendEvent(_hub, run, discarded)
        return yield* appendEvent(_hub, (yield* loadRun(run.runId))!, partial, nextStatus)
      }
      yield* appendTerminalToolResultsForEvent({ run, event: partial })
      const sequence = yield* allocateSequence(run.runId)
      const occurredAt = yield* nowIso
      const event = makeEvent(run, partial, sequence, occurredAt)
      yield* sql`
      INSERT INTO tenetkit_run_events (run_id, sequence, event_id, event_json)
      VALUES (${run.runId}, ${sequence}, ${event.eventId}, ${encodeEvent(event)})
    `
      const treeRoot = (yield* sql<{ last_position: number }>`
      UPDATE tenetkit_tree_roots SET last_position = last_position + 1
      WHERE root_run_id = ${run.rootRunId} RETURNING last_position
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
      const terminalPartial = isTerminalEvent(event)
      if (terminalPartial) {
        yield* sql`
        UPDATE tenetkit_runs SET
          status = ${status},
          active_wait_id = ${activeWaitId},
          terminal_event_id = ${terminalEventId},
          cancellation_requested = ${cancellationRequested},
          cancel_reason = ${cancelReason},
          attempt = ${attempt},
           owner_worker_id = NULL,
           lease_expires_at = NULL,
           continuation_json = NULL,
           pending_outcome_json = NULL,
           suspension_json = NULL,
          updated_at = NOW()
        WHERE run_id = ${run.runId}
          AND status NOT IN ('succeeded', 'failed', 'cancelled')
      `
      } else {
        yield* sql`
        UPDATE tenetkit_runs SET
          status = ${status},
          active_wait_id = ${activeWaitId},
          terminal_event_id = ${terminalEventId},
          cancellation_requested = ${cancellationRequested},
          cancel_reason = ${cancelReason},
          attempt = ${attempt},
          updated_at = NOW()
        WHERE run_id = ${run.runId}
      `
      }
      yield* notifyRun(run.runId)
      return event
    }),
)

export const promoteHead: {
  (sessionId: string): (hub: EventHub) => StoreEffect<void>
  (hub: EventHub, sessionId: string): StoreEffect<void>
} = Function.dual(2, (hub: EventHub, sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ head_run_id: string | null; queue_json: string }>`
      SELECT head_run_id, queue_json FROM tenetkit_lanes
      WHERE session_id = ${sessionId}
      FOR UPDATE
    `
    const lane = lanes[0]
    if (lane === undefined) return
    const queue = decodeQueue(lane.queue_json)
    const headId = lane.head_run_id ?? queue[0]
    if (headId === undefined) return
    if (lane.head_run_id !== headId) {
      yield* sql`
        UPDATE tenetkit_lanes SET head_run_id = ${headId}
        WHERE session_id = ${sessionId}
      `
    }
    yield* loadRun(headId)
  }),
)

export const removeFromLane: {
  (runId: string): (sessionId: string) => SqlOnlyEffect<void>
  (sessionId: string, runId: string): SqlOnlyEffect<void>
} = Function.dual(2, (sessionId: string, runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ queue_json: string }>`
      SELECT queue_json FROM tenetkit_lanes
      WHERE session_id = ${sessionId}
      FOR UPDATE
    `
    const lane = lanes[0]
    if (lane === undefined) return
    const queue = decodeQueue(lane.queue_json).filter((id) => id !== runId)
    if (queue.length === 0) {
      yield* sql`DELETE FROM tenetkit_lanes WHERE session_id = ${sessionId}`
    } else {
      yield* sql`
        UPDATE tenetkit_lanes
        SET queue_json = ${encodeQueue(queue)}, head_run_id = ${queue[0]!}
        WHERE session_id = ${sessionId}
      `
    }
  }),
)

export const afterTerminal: {
  (run: DecodedRun): (hub: EventHub) => StoreEffect<void>
  (hub: EventHub, run: DecodedRun): StoreEffect<void>
} = Function.dual(2, (hub: EventHub, run: DecodedRun) =>
  Effect.gen(function* () {
    yield* removeFromLane(run.sessionId, run.runId)
    yield* promoteHead(hub, run.sessionId)
  }),
)

export const completeRun: {
  (run: DecodedRun, result: ExecutionResult): (hub: EventHub) => CompleteRunEffect
  (hub: EventHub, run: DecodedRun, result: ExecutionResult): CompleteRunEffect
} = Function.dual(3, (hub: EventHub, run: DecodedRun, result: ExecutionResult) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      const runningFanOut = yield* sql<{ fan_out_id: string }>`
        SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
      `
      if (
        runningFanOut.length > 0 ||
        (yield* hasPendingOperationCancellation(run.runId)) ||
        (yield* hasUnsettledChild(run.runId))
      ) {
        yield* sql`
          UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${run.runId}
        `
        return
      }
      const event = yield* appendEvent(
        hub,
        run,
        { _tag: "RunCancelled", ...(run.cancelReason === undefined ? undefined : { reason: run.cancelReason }) },
        "cancelled",
      )
      const settled = (yield* loadRun(run.runId))!
      yield* settleParent(hub, settled, event.eventId)
      yield* afterTerminal(hub, settled)
      return
    }
    const runningFanOut = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${run.runId} AND status = 'running' LIMIT 1
    `
    if (runningFanOut.length > 0) {
      yield* sql`
        UPDATE tenetkit_runs SET status = 'waiting', owner_worker_id = NULL, lease_expires_at = NULL,
          suspension_json = NULL,
          pending_outcome_json = ${encodeJson(PendingRunOutcome, { _tag: "Completed", result })}
        WHERE run_id = ${run.runId}
      `
      return
    }
    const event = yield* appendEvent(hub, run, { _tag: "RunCompleted", result }, "succeeded")
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  }),
)

export const settleParent: {
  (child: DecodedRun, terminalEventId: string): (hub: EventHub) => SettleParentEffect
  (hub: EventHub, child: DecodedRun, terminalEventId: string): SettleParentEffect
} = Function.dual(3, (hub: EventHub, child: DecodedRun, terminalEventId: string) =>
  Effect.gen(function* () {
    if (child.parentRunId === undefined) return
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT run_id FROM tenetkit_runs WHERE run_id = ${child.parentRunId} FOR UPDATE`
    const parent = yield* loadRun(child.parentRunId)
    if (parent === undefined) return
    const existing = yield* sql<{ child_run_id: string }>`
      SELECT child_run_id FROM tenetkit_run_links
      WHERE parent_run_id = ${parent.runId} AND child_run_id = ${child.runId} AND terminal_event_id IS NOT NULL
    `
    if (existing.length > 0) return
    yield* sql`
      UPDATE tenetkit_run_links
      SET readiness = 'settled', terminal_event_id = ${terminalEventId}, settled_at = NOW()
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
    yield* reconcileFanOutWith(hub, child.runId, terminalEventId, appendEvent, settleParent, afterTerminal)
    let currentParent = yield* loadRun(parent.runId)
    const terminalEvent = yield* loadTerminalEvent(terminalEventId)
    if (currentParent !== undefined && terminalEvent !== undefined) {
      yield* reconcileChildWaitWith({ hub, parent: currentParent, child, event: terminalEvent, append: appendEvent })
      currentParent = yield* loadRun(parent.runId)
    }
    if (currentParent?.status === "queued") {
      const unsettled = yield* sql<{ child_run_id: string }>`
        SELECT l.child_run_id FROM tenetkit_run_links l
        JOIN tenetkit_runs r ON r.run_id = l.child_run_id
        WHERE l.parent_run_id = ${parent.runId}
          AND r.status NOT IN ('succeeded', 'failed', 'cancelled')
        LIMIT 1
      `
      if (unsettled.length === 0) {
        const attempt = currentParent.attempt + 1
        yield* sql`UPDATE tenetkit_runs SET attempt_fence = ${attempt} WHERE run_id = ${parent.runId}`
        yield* appendEvent(hub, { ...currentParent, attempt }, { _tag: "RunAttemptStarted", attempt }, "running")
      }
    } else if (currentParent?.status === "cancelling" && currentParent.ownerWorkerId === undefined) {
      yield* settleCancelledParent(hub, currentParent)
    }
  }),
)

const settleCancelledParent = (hub: EventHub, parent: DecodedRun) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${parent.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) return
    if (yield* hasPendingOperationCancellation(parent.runId)) return
    if (yield* hasUnsettledChild(parent.runId)) return
    const cancelled = yield* appendEvent(
      hub,
      parent,
      {
        _tag: "RunCancelled",
        ...(parent.cancelReason === undefined ? undefined : { reason: parent.cancelReason }),
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
  readonly depth: number
  readonly treePolicy: import("tenetkit/runtime/driver/tree/policy").TreePolicy
  readonly parentRunId?: string
  readonly invocationId?: string
  readonly acceptedSequence: number
  readonly attempt?: number
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO tenetkit_runs (
        run_id, status, address, session_id, message_id, message_json, message_digest, idempotency_key,
        executable_ref_json, executable_manifest_json, root_run_id, depth, max_depth, max_subagents, parent_run_id, invocation_id, active_wait_id, attempt, attempt_fence,
        last_sequence, cancellation_requested, cancel_reason, terminal_event_id, accepted_sequence,
        responded_wait_ids_json, owner_worker_id, lease_expires_at, created_at, updated_at
      ) VALUES (
        ${input.runId}, ${input.status}, ${input.message.to}, ${input.message.sessionId}, ${input.message.id},
        ${encodeMessage(input.message)}, ${input.digest}, ${input.message.idempotencyKey},
        ${encodeExecutableRef(input.executableRef)}, ${encodeExecutableManifest(input.executableManifest)},
        ${input.rootRunId}, ${input.depth}, ${input.treePolicy.maxDepth}, ${input.treePolicy.maxSubagents}, ${input.parentRunId ?? null}, ${input.invocationId ?? null},
        NULL, ${input.attempt ?? 0}, ${input.attempt ?? 0}, -1, FALSE, NULL, NULL, ${input.acceptedSequence},
        ${encodeJson(StringArray, [])}, NULL, NULL, NOW(), NOW()
      )
    `
    if (input.runId === input.rootRunId) {
      yield* sql`INSERT INTO tenetkit_tree_roots (root_run_id) VALUES (${input.runId})`
    }
  })

export const enqueueLane: {
  (runId: string): (sessionId: string) => LaneEffect
  (sessionId: string, runId: string): LaneEffect
} = Function.dual(2, (sessionId: string, runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const lanes = yield* sql<{ accepted_sequence: string | number; queue_json: string; head_run_id: string | null }>`
      SELECT accepted_sequence, queue_json, head_run_id FROM tenetkit_lanes
      WHERE session_id = ${sessionId}
      FOR UPDATE
    `
    const lane = lanes[0]
    if (lane === undefined) {
      yield* sql`
        INSERT INTO tenetkit_lanes (session_id, accepted_sequence, queue_json, head_run_id)
        VALUES (${sessionId}, 0, ${encodeQueue([runId])}, ${runId})
      `
      return { acceptedSequence: 0, isHead: true }
    }
    const acceptedSequence = Number(lane.accepted_sequence) + 1
    const queue = [...decodeQueue(lane.queue_json), runId]
    const head = lane.head_run_id ?? queue[0]!
    yield* sql`
      UPDATE tenetkit_lanes
      SET accepted_sequence = ${acceptedSequence}, queue_json = ${encodeQueue(queue)}, head_run_id = ${head}
      WHERE session_id = ${sessionId}
    `
    return { acceptedSequence, isHead: head === runId }
  }),
)

export { toOperationRecord } from "tenetkit/runtime/driver/sql/operations"

export { decodeMessage, encodeQueue, decodeQueue }
