import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { resultFromChildEvent, waitIdForChild } from "../../../child/group.js"
import { isTerminal, type RunStatus } from "../../../run.js"
import type { RunEvent } from "../../../run/event.js"
import { decodeEvent } from "../../codec/codecs.js"
import type { DecodedRun } from "../../codec/rows.js"
import type { EventHub } from "../../subscribers.js"
import { transitionRunWait } from "../wait-transition.js"

type EventPartial = Pick<Extract<RunEvent, { readonly _tag: "RunResumed" }>, "_tag" | "waitId" | "resolution">
type AppendFn<E, R> = (
  hub: EventHub,
  run: DecodedRun,
  partial: EventPartial,
  nextStatus?: RunStatus,
) => Effect.Effect<RunEvent, E, R>

export const loadTerminalEvent = (
  terminalEventId: string,
): Effect.Effect<RunEvent | undefined, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = (yield* sql<{ event_json: string }>`
      SELECT event_json FROM tenetkit_run_events WHERE event_id = ${terminalEventId}
    `)[0]
    return row === undefined ? undefined : decodeEvent(row.event_json)
  })

export const hasUnsettledChild = (runId: string): Effect.Effect<boolean, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const pending = yield* sql<{ present: number }>`
      SELECT 1 AS present FROM tenetkit_run_links l
        JOIN tenetkit_runs r ON r.run_id = l.child_run_id
        WHERE l.parent_run_id = ${runId}
          AND r.status NOT IN ('succeeded', 'failed', 'cancelled')
      UNION ALL
      SELECT 1 AS present FROM tenetkit_external_child_placements
        WHERE parent_run_id = ${runId} AND settlement_id IS NULL
      LIMIT 1
    `
    return pending.length > 0
  })

export const hasPendingOperationCancellation = (runId: string): Effect.Effect<boolean, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const pending = yield* sql<{ present: number }>`
      SELECT 1 AS present FROM tenetkit_run_operations
      WHERE run_id = ${runId} AND status = 'cancelling'
      LIMIT 1
    `
    return pending.length > 0
  })

export const hasUnknownOperation = (runId: string): Effect.Effect<boolean, SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const pending = yield* sql<{ present: number }>`
      SELECT 1 AS present FROM tenetkit_run_operations
      WHERE run_id = ${runId} AND status = 'unknown'
      UNION ALL
      SELECT 1 AS present FROM tenetkit_program_operations
      WHERE run_id = ${runId} AND status = 'unknown'
      LIMIT 1
    `
    return pending.length > 0
  })

export const hasPendingCancellationWork = (runId: string): Effect.Effect<boolean, SqlError, SqlClient.SqlClient> =>
  Effect.all([hasPendingOperationCancellation(runId), hasUnknownOperation(runId), hasUnsettledChild(runId)]).pipe(
    Effect.map((pending) => pending.some(Boolean)),
  )

export const reconcileChildWaitWith = <E, R>(input: {
  readonly hub: EventHub
  readonly parent: DecodedRun
  readonly child: DecodedRun
  readonly event: RunEvent
  readonly append: AppendFn<E, R>
}): Effect.Effect<boolean, E | SqlError, R | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const waitId = waitIdForChild({
      parentRunId: input.parent.runId,
      childRunId: input.child.runId,
      metadata: input.child.message.metadata,
      suspension: input.parent.suspension,
    })
    if (
      isTerminal(input.parent.status) ||
      input.parent.cancellationRequested ||
      waitId === undefined ||
      (input.event._tag !== "RunCompleted" && input.event._tag !== "RunFailed" && input.event._tag !== "RunCancelled")
    ) {
      return false
    }
    const result = resultFromChildEvent({
      childRunId: input.child.runId,
      metadata: input.child.message.metadata,
      event: input.event,
    })
    const resolution = { _tag: "ToolResult" as const, result, encodedResult: result }
    const affected = yield* transitionRunWait({
      runId: input.parent.runId,
      waitId,
      status: "responded",
      resolution,
      closedAt: yield* DateTime.now.pipe(Effect.map(DateTime.formatIso)),
    })
    if (affected !== 1) return false
    yield* input.append(input.hub, input.parent, { _tag: "RunResumed", waitId, resolution }, "running")
    return true
  })
