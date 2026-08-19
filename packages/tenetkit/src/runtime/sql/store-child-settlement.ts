import { DateTime, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { ownsChildSuspension, resultFromChildEvent } from "../child-group.js"
import { isTerminal, type RunStatus } from "../run.js"
import type { RunEvent } from "../run-event.js"
import { WaitResolution } from "../run-wait.js"
import { decodeEvent, encodeJson } from "./codecs.js"
import type { DecodedRun } from "./rows.js"
import type { EventHub } from "./subscribers.js"

type EventPartial = { readonly _tag: string } & Record<string, unknown>
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

export const reconcileChildWaitWith = <E, R>(input: {
  readonly hub: EventHub
  readonly parent: DecodedRun
  readonly child: DecodedRun
  readonly event: RunEvent
  readonly append: AppendFn<E, R>
}): Effect.Effect<boolean, E | SqlError, R | SqlClient.SqlClient> =>
  Effect.gen(function* () {
    if (
      isTerminal(input.parent.status) ||
      input.parent.cancellationRequested ||
      input.parent.activeWaitId === undefined ||
      (input.event._tag !== "RunCompleted" &&
        input.event._tag !== "RunFailed" &&
        input.event._tag !== "RunCancelled") ||
      !ownsChildSuspension({
        parentRunId: input.parent.runId,
        waitId: input.parent.activeWaitId,
        childRunId: input.child.runId,
        metadata: input.child.message.metadata,
        suspension: input.parent.suspension,
      })
    ) {
      return false
    }
    const sql = yield* SqlClient.SqlClient
    const wait = (yield* sql<{ status: string }>`
      SELECT status FROM tenetkit_run_waits
      WHERE run_id = ${input.parent.runId} AND wait_id = ${input.parent.activeWaitId}
    `)[0]
    if (wait?.status !== "open") return false
    const result = resultFromChildEvent({
      childRunId: input.child.runId,
      metadata: input.child.message.metadata,
      event: input.event,
    })
    const resolution = { _tag: "ToolResult" as const, result, encodedResult: result }
    const closedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso))
    yield* sql`
      UPDATE tenetkit_run_waits
      SET status = 'responded', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${closedAt}
      WHERE run_id = ${input.parent.runId} AND wait_id = ${input.parent.activeWaitId} AND status = 'open'
    `
    yield* input.append(
      input.hub,
      input.parent,
      { _tag: "RunResumed", waitId: input.parent.activeWaitId, resolution },
      "running",
    )
    return true
  })
